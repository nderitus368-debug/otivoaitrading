import { getRoundedNumber } from '@/components/shared';
import { localize } from '@deriv-com/translations';
import { LogTypes } from '../../../constants/messages';
import { createError } from '../../../utils/error';
import { observer as globalObserver } from '../../../utils/observer';
import { info, log } from '../utils/broadcast';

const skeleton = {
    totalProfit: 0,
    totalWins: 0,
    totalLosses: 0,
    totalStake: 0,
    totalPayout: 0,
    totalRuns: 0,
};

const globalStat = {};

export default Engine =>
    class Total extends Engine {
        constructor() {
            super();
            this.sessionRuns = 0;
            this.sessionProfit = 0;

            globalObserver.register('statistics.clear', this.clearStatistics.bind(this));
        }

        clearStatistics() {
            this.sessionRuns = 0;
            this.sessionProfit = 0;
            if (!this.accountInfo) return;
            const { loginid: accountID } = this.accountInfo;
            globalStat[accountID] = { ...skeleton };
        }

        updateTotals(contract) {
            const { sell_price: sellPrice, buy_price: buyPrice, currency } = contract;

            const profit = getRoundedNumber(Number(sellPrice) - Number(buyPrice), currency);

            const win = profit > 0;

            const accountStat = this.getAccountStat();

            accountStat.totalWins += win ? 1 : 0;
            accountStat.totalLosses += !win ? 1 : 0;
            this.sessionProfit = getRoundedNumber(Number(this.sessionProfit) + Number(profit), currency);
            accountStat.totalProfit = getRoundedNumber(Number(accountStat.totalProfit) + Number(profit), currency);
            accountStat.totalStake = getRoundedNumber(Number(accountStat.totalStake) + Number(buyPrice), currency);
            accountStat.totalPayout = getRoundedNumber(Number(accountStat.totalPayout) + Number(sellPrice), currency);

            if (this.virtual_manager?.enabled) {
                this.virtual_manager.virtual_stat.wins += win ? 1 : 0;
                this.virtual_manager.virtual_stat.losses += !win ? 1 : 0;
                this.virtual_manager.virtual_stat.profit = getRoundedNumber(
                    Number(this.virtual_manager.virtual_stat.profit) + Number(profit),
                    currency
                );

                if (!win) {
                    if (this.current_contract_mode === 'virtual') {
                        this.virtual_manager.current_virtual_losses++;
                        if (this.virtual_manager.current_virtual_losses >= this.virtual_manager.threshold) {
                            this.virtual_manager.is_real_trading = true;
                            this.virtual_manager.current_real_trades = 0;
                        }
                    } else {
                        // Real loss
                        this.virtual_manager.current_real_trades++;
                        if (this.virtual_manager.current_real_trades >= this.virtual_manager.count) {
                            this.virtual_manager.is_real_trading = false;
                            this.virtual_manager.current_virtual_losses = -this.virtual_manager.after;
                        }
                    }
                } else {
                    // Win
                    if (this.current_contract_mode === 'virtual') {
                        // Reset on virtual win
                        this.virtual_manager.current_virtual_losses = 0;
                    } else {
                        this.virtual_manager.current_real_trades++;
                        if (this.virtual_manager.current_real_trades >= this.virtual_manager.count) {
                            this.virtual_manager.is_real_trading = false;
                            this.virtual_manager.current_virtual_losses = -this.virtual_manager.after;
                        }
                    }
                }
            }

            info({
                profit,
                contract,
                accountID: this.accountInfo.loginid,
                totalProfit: accountStat.totalProfit,
                totalWins: accountStat.totalWins,
                totalLosses: accountStat.totalLosses,
                totalStake: accountStat.totalStake,
                totalPayout: accountStat.totalPayout,
                ...(this.virtual_manager?.enabled ? {
                    virtual_profit: this.virtual_manager.virtual_stat.profit,
                    virtual_wins: this.virtual_manager.virtual_stat.wins,
                    virtual_losses: this.virtual_manager.virtual_stat.losses,
                    is_real_trading: this.virtual_manager.is_real_trading,
                } : {})
            });

            log(win ? LogTypes.PROFIT : LogTypes.LOST, { currency, profit });
        }

        updateAndReturnTotalRuns() {
            this.sessionRuns++;
            const accountStat = this.getAccountStat();

            return ++accountStat.totalRuns;
        }

        /* eslint-disable class-methods-use-this */
        getTotalRuns() {
            const accountStat = this.getAccountStat();
            return accountStat.totalRuns;
        }

        getTotalProfit(toString, currency) {
            const accountStat = this.getAccountStat();

            return toString && accountStat.totalProfit !== 0
                ? getRoundedNumber(+accountStat.totalProfit, currency)
                : +accountStat.totalProfit;
        }

        /* eslint-enable */
        checkLimits(tradeOption) {
            if (!tradeOption.limitations) {
                return;
            }

            const {
                limitations: { maxLoss, maxTrades },
            } = tradeOption;

            if (maxLoss && maxTrades) {
                if (this.sessionRuns >= maxTrades) {
                    throw createError('CustomLimitsReached', localize('Maximum number of trades reached'));
                }
                if (this.sessionProfit <= -maxLoss) {
                    throw createError('CustomLimitsReached', localize('Maximum loss amount reached'));
                }
            }
        }

        /* eslint-disable class-methods-use-this */
        validateTradeOptions(tradeOptions) {
            const take_profit = tradeOptions.take_profit;
            const stop_loss = tradeOptions.stop_loss;

            if (take_profit) {
                tradeOptions.limit_order.take_profit = take_profit;
            }
            if (stop_loss) {
                tradeOptions.limit_order.stop_loss = stop_loss;
            }

            return tradeOptions;
        }

        getAccountStat() {
            const { loginid: accountID } = this.accountInfo;

            if (!(accountID in globalStat)) {
                globalStat[accountID] = { ...skeleton };
            }

            return globalStat[accountID];
        }
    };
