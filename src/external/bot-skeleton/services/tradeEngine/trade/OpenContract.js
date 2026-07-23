import { localize } from '@deriv-com/translations';
import { getRoundedNumber } from '@/components/shared';
import { api_base } from '../../api/api-base';
import { contract as broadcastContract, contractStatus } from '../utils/broadcast';
import { observer as globalObserver } from '../../../utils/observer';
import { openContractReceived, sell } from './state/actions';

export default Engine =>
    class OpenContract extends Engine {
        observeOpenContract() {
            globalObserver.register('bot.start_simulation', ({ contractId, askPrice }) => {
                this.is_simulated_trade = true;
                this.contractId = contractId;
                this.simulateContract();
            });

            const api = this.current_api || api_base.api;
            if (!api) return;
            const subscription = api.onMessage().subscribe(({ data }) => {
                if (data.msg_type === 'proposal_open_contract') {
                    const contract = data.proposal_open_contract;
                    

                    if (!contract || !this.expectedContractId(contract?.contract_id)) {
                        return;
                    }

                    this.setContractFlags(contract);

                    this.data.contract = contract;

                    broadcastContract({ accountID: api_base.account_info.loginid, ...contract });

                    if (this.isSold) {
                        this.completedContracts = this.completedContracts || [];
                        this.completedContracts.push(contract);
                        this.contractIds.delete(String(contract.contract_id));
                        
                        contractStatus({
                            id: 'contract.sold',
                            data: contract.transaction_ids?.sell,
                            contract,
                        });

                        if (this.contractIds.size > 0) {
                            return;
                        }

                        clearTimeout(this.transaction_recovery_timeout);

                        let aggregatedContract = contract;
                        if (this.completedContracts.length > 1) {
                            const anyWon = this.completedContracts.some(c => c.status === 'won');
                            const totalProfit = this.completedContracts.reduce((sum, c) => sum + Number(c.profit || 0), 0);
                            const totalBuyPrice = this.completedContracts.reduce((sum, c) => sum + Number(c.buy_price || 0), 0);
                            const totalSellPrice = this.completedContracts.reduce((sum, c) => sum + Number(c.sell_price || 0), 0);
                            
                            aggregatedContract = {
                                ...contract,
                                status: anyWon ? 'won' : 'lost',
                                profit: totalProfit,
                                buy_price: totalBuyPrice,
                                sell_price: totalSellPrice,
                            };
                        }

                        this.updateTotals(aggregatedContract);
                        this.data.contract = aggregatedContract;
                        this.completedContracts = [];

                        if (this.afterPromise) {
                            this.afterPromise();
                        }

                        this.store.dispatch(sell());
                    } else {
                        this.store.dispatch(openContractReceived());
                    }
                }
            });
            api_base.pushSubscription(subscription);
        }

        waitForAfter() {
            return new Promise(resolve => {
                this.afterPromise = resolve;
            });
        }

        setContractFlags(contract) {
            const { is_expired, is_valid_to_sell, is_sold, entry_tick } = contract;

            this.isSold = Boolean(is_sold);
            this.isSellAvailable = !this.isSold && Boolean(is_valid_to_sell);
            this.isExpired = Boolean(is_expired);
            this.hasEntryTick = Boolean(entry_tick);
        }

        expectedContractId(contractId) {
            return this.contractIds && this.contractIds.has(String(contractId));
        }

        async simulateContract() {
            const { ticksService } = this.$scope;
            const symbol = this.symbol;
            let tickCount = 0;
            const targetTicks = this.tradeOptions.duration || 1;
            const type = this.tradeOptions.contract_type;
            const prediction = Number(this.tradeOptions.prediction ?? 0);
            const barrier = Number(this.tradeOptions.barrier ?? 0);
            const high_barrier = Number(this.tradeOptions.high_barrier ?? 0);
            const low_barrier = Number(this.tradeOptions.low_barrier ?? 0);
            
            const entryTick = await this.getLastTick(true);
            const entrySpot = entryTick.quote;
            const entryEpoch = entryTick.epoch;
            let lastSpot = entrySpot;
            let allUps = true;
            let allDowns = true;

            const contract = {
                contract_id: this.contractId,
                buy_price: this.tradeOptions.amount,
                bid_price: entrySpot,
                entry_tick: entrySpot,
                entry_tick_time: entryEpoch,
                is_sold: 0,
                profit: 0,
                underlying: symbol,
                contract_type: type,
                currency: this.tradeOptions.currency,
            };

            const callback = async (ticks) => {
                const lastTick = ticks.slice(-1)[0];
                const currentSpot = lastTick.quote;
                tickCount++;

                if (currentSpot <= lastSpot) allUps = false;
                if (currentSpot >= lastSpot) allDowns = false;
                lastSpot = currentSpot;

                if (tickCount >= targetTicks) {
                    await ticksService.stopMonitor({ symbol, key: this.simKey });
                    
                    const exitSpot = currentSpot;
                    const exitEpoch = lastTick.epoch;
                    const exitDigit = Number(String(exitSpot).slice(-1));
                    
                    let win = false;
                    switch (type) {
                        case 'DIGITMATCH': win = exitDigit === prediction; break;
                        case 'DIGITDIFF': win = exitDigit !== prediction; break;
                        case 'DIGITEVEN': win = exitDigit % 2 === 0; break;
                        case 'DIGITODD': win = exitDigit % 2 !== 0; break;
                        case 'DIGITOVER': win = exitDigit > prediction; break;
                        case 'DIGITUNDER': win = exitDigit < prediction; break;
                        case 'CALL': win = exitSpot > entrySpot; break;
                        case 'PUT': win = exitSpot < entrySpot; break;
                        case 'CALLE': win = exitSpot > (barrier || entrySpot); break;
                        case 'PUTE': win = exitSpot < (barrier || entrySpot); break;
                        case 'EXPIRYRANGE': win = exitSpot > low_barrier && exitSpot < high_barrier; break;
                        case 'EXPIRYMISS': win = exitSpot < low_barrier || exitSpot > high_barrier; break;
                        case 'UPORDOWN': win = exitSpot > high_barrier || exitSpot < low_barrier; break;
                        case 'RANGE': win = exitSpot > low_barrier && exitSpot < high_barrier; break;
                        case 'ONETOUCH': win = exitSpot >= barrier; break;
                        case 'NOTOUCH': win = exitSpot < barrier; break;
                        case 'RUNHIGH': win = allUps; break;
                        case 'RUNLOW': win = allDowns; break;
                        case 'ACCU': win = Math.random() > 0.05; break; // Simple 95% survival simulation for Accu
                        default: win = exitSpot > entrySpot;
                    }

                    contract.is_sold = 1;
                    contract.exit_tick = exitSpot;
                    contract.exit_tick_time = exitEpoch;
                    contract.profit = win ? (this.tradeOptions.amount * 0.9) : -this.tradeOptions.amount;
                    contract.status = win ? 'won' : 'lost';

                    this.setContractFlags(contract);
                    this.data.contract = contract;
                    broadcastContract({ accountID: api_base.account_info.loginid, ...contract });
                    
                    this.completedContracts = this.completedContracts || [];
                    this.completedContracts.push(contract);
                    this.contractIds.delete(String(contract.contract_id));
                    
                    contractStatus({
                        id: 'contract.sold',
                        data: `sim-sell-${Date.now()}`,
                        contract,
                    });

                    if (this.contractIds.size > 0) {
                        return;
                    }

                    this.is_simulated_trade = false;

                    let aggregatedContract = contract;
                    if (this.completedContracts.length > 1) {
                        const anyWon = this.completedContracts.some(c => c.status === 'won');
                        const totalProfit = this.completedContracts.reduce((sum, c) => sum + Number(c.profit || 0), 0);
                        const totalBuyPrice = this.completedContracts.reduce((sum, c) => sum + Number(c.buy_price || 0), 0);
                        const totalSellPrice = this.completedContracts.reduce((sum, c) => sum + Number(c.sell_price || 0), 0);
                        
                        aggregatedContract = {
                            ...contract,
                            status: anyWon ? 'won' : 'lost',
                            profit: totalProfit,
                            buy_price: totalBuyPrice,
                            sell_price: totalSellPrice,
                        };
                    }

                    this.updateTotals(aggregatedContract);
                    this.data.contract = aggregatedContract;
                    this.completedContracts = [];

                    if (this.afterPromise) this.afterPromise();
                    this.store.dispatch(sell());
                } else {
                    contract.bid_price = currentSpot;
                    this.data.contract = contract;
                    broadcastContract({ accountID: api_base.account_info.loginid, ...contract });
                }
            };

            this.simKey = await ticksService.monitor({ symbol, callback });
        }

        getSellPrice() {
            const { bid_price: bidPrice, buy_price: buyPrice, currency } = this.data.contract;
            return getRoundedNumber(Number(bidPrice) - Number(buyPrice), currency);
        }
    };
