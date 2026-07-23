import { localize } from '@deriv-com/translations';
import { LogTypes } from '../../../constants/messages';
import { api_base } from '../../api/api-base';
import { contractStatus, info, log } from '../utils/broadcast';
import { doUntilDone, getUUID, recoverFromError, tradeOptionToBuy } from '../utils/helpers';
import { observer as globalObserver } from '../../../utils/observer';
import { purchaseSuccessful } from './state/actions';
import { BEFORE_PURCHASE } from './state/constants';

let delayIndex = 0;
let purchase_reference;

export default Engine =>
    class Purchase extends Engine {
        async purchaseDual(type1, type2) {
            if (this.is_purchasing_dual || this.store.getState().scope !== BEFORE_PURCHASE) {
                return Promise.resolve();
            }

            this.is_purchasing_dual = true;
            this.is_dual_purchase = true;
            
            // Save original prediction so we can restore it after
            const originalPrediction = this.tradeOptions.prediction;
            
            try {
                // Set prediction for first contract (prediction1 from Set Dual Predictions block)
                if (this.tradeOptions.prediction1 !== undefined) {
                    this.tradeOptions.prediction = this.tradeOptions.prediction1;
                }
                const p1 = this.purchase(type1);

                // Small delay to avoid API rate limits
                await new Promise(resolve => setTimeout(resolve, 10)); 

                // Set prediction for second contract (prediction2 from Set Dual Predictions block)
                if (this.tradeOptions.prediction2 !== undefined) {
                    this.tradeOptions.prediction = this.tradeOptions.prediction2;
                }
                const p2 = this.purchase(type2);

                await Promise.all([p1, p2]);
            } finally {
                // Restore original prediction
                this.tradeOptions.prediction = originalPrediction;
                this.is_dual_purchase = false;
                this.is_purchasing_dual = false;
                if (this.is_proposal_subscription_required) {
                    this.renewProposalsOnPurchase();
                }
            }
        }

        purchase(contract_type) {
            // Prevent calling purchase twice unless it's a dual purchase
            if (this.store.getState().scope !== BEFORE_PURCHASE && !this.is_dual_purchase) {
                return Promise.resolve();
            }

            this.current_contract_mode =
                this.virtual_manager?.enabled && this.virtual_manager.is_real_trading ? 'real' : 'virtual';

            const onSuccess = response => {
                // Don't unnecessarily send a forget request for a purchased contract.
                const { buy } = response;

                contractStatus({
                    id: 'contract.purchase_received',
                    data: buy.transaction_id,
                    buy,
                });

                this.contractIds.add(String(buy.contract_id));
                this.store.dispatch(purchaseSuccessful());

                if (this.is_proposal_subscription_required && !this.is_dual_purchase) {
                    this.renewProposalsOnPurchase();
                }

                delayIndex = 0;
                log(LogTypes.PURCHASE, { longcode: buy.longcode, transaction_id: buy.transaction_id });
                info({
                    accountID: this.accountInfo.loginid,
                    totalRuns: this.updateAndReturnTotalRuns(),
                    transaction_ids: { buy: buy.transaction_id },
                    contract_type,
                    buy_price: buy.buy_price,
                });
            };

            if (this.is_proposal_subscription_required) {
                const { id, askPrice } = this.selectProposal(contract_type);

                const action = async () => {
                    if (this.virtual_manager?.enabled) {
                        if (this.virtual_manager.is_real_trading) {
                            // Ensure the primary connection is using the backend token
                            if (api_base.token_override !== this.virtual_manager.token) {
                                await api_base.setTokenOverride(this.virtual_manager.token);
                            }
                            this.current_api = api_base.api;

                        } else {
                            // Ensure we are back to simulated/demo mode if needed
                            if (api_base.token_override) {
                                await api_base.setTokenOverride(null);
                            }
                            
                            // SIMULATION MODE
                            this.current_api = null;
                            this.is_simulated_trade = true;

                            
                            // Emit a custom event to trigger simulation in OpenContract
                            const simId = `sim-${Date.now()}-${Math.random()}`;
                            this.contractIds.add(simId);
                            globalObserver.emit('bot.start_simulation', {
                                contractId: simId,
                                askPrice,
                            });

                            return new Promise(resolve => {
                                setTimeout(() => {
                                    resolve({
                                        buy: {
                                            contract_id: `sim-${Date.now()}`,
                                            buy_price: askPrice,
                                        }
                                    });
                                }, 100);
                            });
                        }
                    }
                    this.current_api = api_base.api;
                    return api_base.api.send({ buy: id, price: askPrice });
                };

                this.isSold = false;

                contractStatus({
                    id: 'contract.purchase_sent',
                    data: askPrice,
                });

                if (!this.options.timeMachineEnabled) {
                    return doUntilDone(action).then(onSuccess);
                }

                this.current_contract_mode =
                    this.virtual_manager?.enabled && this.virtual_manager.is_real_trading ? 'real' : 'virtual';
                return recoverFromError(
                    action,
                    (errorCode, makeDelay) => {
                        // if disconnected no need to resubscription (handled by live-api)
                        if (errorCode !== 'DisconnectError') {
                            this.renewProposalsOnPurchase();
                        } else {
                            this.clearProposals();
                        }

                        const unsubscribe = this.store.subscribe(() => {
                            const { scope, proposalsReady } = this.store.getState();
                            if (scope === BEFORE_PURCHASE && proposalsReady) {
                                makeDelay().then(() => this.observer.emit('REVERT', 'before'));
                                unsubscribe();
                            }
                        });
                    },
                    ['PriceMoved', 'InvalidContractProposal'],
                    delayIndex++
                ).then(onSuccess);
            }
            const trade_option = tradeOptionToBuy(contract_type, this.tradeOptions);
            const action = async () => {
                if (this.virtual_manager?.enabled && this.virtual_manager.is_real_trading) {
                    const secondaryApi = await api_base.getSecondaryApi(this.virtual_manager.token);
                    if (secondaryApi) {
                        return secondaryApi.send(trade_option);
                    }
                }
                return api_base.api.send(trade_option);
            };

            this.isSold = false;

            contractStatus({
                id: 'contract.purchase_sent',
                data: this.tradeOptions.amount,
            });

            if (!this.options.timeMachineEnabled) {
                return doUntilDone(action).then(onSuccess);
            }

            return recoverFromError(
                action,
                (errorCode, makeDelay) => {
                    if (errorCode === 'DisconnectError') {
                        this.clearProposals();
                    }
                    const unsubscribe = this.store.subscribe(() => {
                        const { scope } = this.store.getState();
                        if (scope === BEFORE_PURCHASE) {
                            makeDelay().then(() => this.observer.emit('REVERT', 'before'));
                            unsubscribe();
                        }
                    });
                },
                ['PriceMoved', 'InvalidContractProposal'],
                delayIndex++
            ).then(onSuccess);
        }
        getPurchaseReference = () => purchase_reference;
        regeneratePurchaseReference = () => {
            purchase_reference = getUUID();
        };
    };
