/* eslint-disable no-confusing-arrow */
import { localize } from '@deriv-com/translations';
import { config } from '../../constants/config';
import PendingPromise from '../../utils/pending-promise';
import { api_base } from './api-base';

export default class ActiveSymbols {
    constructor(trading_times) {
        this.active_symbols = [];
        this.disabled_symbols = config().DISABLED_SYMBOLS;
        this.disabled_submarkets = config().DISABLED_SUBMARKETS;
        this.init_promise = new PendingPromise();
        this.is_initialised = false;
        this.processed_symbols = {};
        this.trading_times = trading_times;
    }

    async retrieveActiveSymbols(is_forced_update = false) {
        try {
            await Promise.race([
                this.trading_times.initialise(),
                new Promise(resolve => setTimeout(resolve, 3000)),
            ]);
        } catch (e) {
            console.warn('[active-symbols] trading_times initialise timeout/error:', e);
        }

        if (!is_forced_update && this.is_initialised) {
            await this.init_promise;
            return this.active_symbols;
        }

        this.is_initialised = true;

        if (api_base.has_active_symbols) {
            this.active_symbols = api_base?.active_symbols ?? [];
        } else {
            await api_base.active_symbols_promise;
            this.active_symbols = api_base?.active_symbols ?? [];
        }

        this.processed_symbols = this.processActiveSymbols();

        if (typeof window !== 'undefined' && window.Blockly?.derivWorkspace) {
            try {
                const market_blocks = window.Blockly.derivWorkspace
                    .getAllBlocks()
                    .filter(b => b.type === 'trade_definition_market');
                market_blocks.forEach(block => {
                    const fake_create_event = new window.Blockly.Events.BlockCreate(block);
                    window.Blockly.Events.fire(fake_create_event);
                });
            } catch (blockErr) {
                console.warn('[active-symbols] Failed to refresh market blocks:', blockErr);
            }
        }

        // TODO: fix need to look into it as the method is not present
        this.trading_times.onMarketOpenCloseChanged = changes => {
            Object.keys(changes).forEach(symbol_name => {
                const symbol_obj = this.active_symbols[symbol_name];

                if (symbol_obj) {
                    symbol_obj.exchange_is_open = changes[symbol_name];
                }
            });

            this.changes = changes;
            this.processActiveSymbols();
        };

        this.init_promise.resolve();

        console.log(this.active_symbols);
        return this.active_symbols;
    }

    processActiveSymbols() {
        return this.active_symbols.reduce((processed_symbols, rawSymbol) => {
            const symbol = {
                ...rawSymbol,
                symbol: rawSymbol.symbol || rawSymbol.underlying_symbol || '',
                display_name: rawSymbol.display_name || rawSymbol.underlying_symbol_name || rawSymbol.symbol || '',
                market: rawSymbol.market || 'synthetic_index',
                market_display_name: rawSymbol.market_display_name || rawSymbol.market || 'Derived',
                submarket: rawSymbol.submarket || 'random_index',
                submarket_display_name: rawSymbol.submarket_display_name || rawSymbol.submarket || 'Continuous Indices',
                pip: rawSymbol.pip || '0.001',
                exchange_is_open: rawSymbol.exchange_is_open !== undefined ? rawSymbol.exchange_is_open : 1,
                is_trading_suspended: rawSymbol.is_trading_suspended || 0,
            };

            if (
                !symbol.symbol ||
                config().DISABLED_SYMBOLS.includes(symbol.symbol) ||
                config().DISABLED_SUBMARKETS.includes(symbol.submarket)
            ) {
                return processed_symbols;
            }

            const isExistingValue = (object, prop) => Object.keys(object).findIndex(a => a === symbol[prop]) !== -1;

            if (!isExistingValue(processed_symbols, 'market')) {
                processed_symbols[symbol.market] = {
                    display_name: symbol.market_display_name,
                    submarkets: {},
                };
            }

            const { submarkets } = processed_symbols[symbol.market];

            if (!isExistingValue(submarkets, 'submarket')) {
                submarkets[symbol.submarket] = {
                    display_name: symbol.submarket_display_name,
                    symbols: {},
                };
            }

            const { symbols } = submarkets[symbol.submarket];

            if (!isExistingValue(symbols, 'symbol')) {
                symbols[symbol.symbol] = {
                    display_name: symbol.display_name,
                    pip_size: `${symbol.pip}`.length - 2,
                    is_active: !symbol.is_trading_suspended && (symbol.exchange_is_open === 1 || symbol.exchange_is_open === true || symbol.exchange_is_open === undefined),
                };
            }

            return processed_symbols;
        }, {});
    }

    /**
     * Retrieves all symbols and returns an array of symbol objects consisting of symbol and their linked market + submarket.
     * @returns {Array} Symbols and their submarkets + markets.
     */
    getAllSymbols(should_be_open = false) {
        const all_symbols = [];

        Object.keys(this.processed_symbols).forEach(market_name => {
            if (should_be_open && this.isMarketClosed(market_name)) {
                return;
            }

            const market = this.processed_symbols[market_name];
            const { submarkets } = market;

            Object.keys(submarkets).forEach(submarket_name => {
                const submarket = submarkets[submarket_name];
                const { symbols } = submarket;

                Object.keys(symbols).forEach(symbol_name => {
                    const symbol = symbols[symbol_name];

                    all_symbols.push({
                        market: market_name,
                        market_display: market.display_name,
                        submarket: submarket_name,
                        submarket_display: submarket.display_name,
                        symbol: symbol_name,
                        symbol_display: symbol.display_name,
                    });
                });
            });
        });
        this.getSymbolsForBot();
        return all_symbols;
    }

    /**
     *
     * @returns {Array} Symbols and their submarkets + markets for deriv-bot
     */
    getSymbolsForBot() {
        const { DISABLED } = config().QUICK_STRATEGY;
        const symbols_for_bot = [];
        Object.keys(this.processed_symbols).forEach(market_name => {
            if (this.isMarketClosed(market_name)) return;

            const market = this.processed_symbols[market_name];
            const { submarkets } = market;

            Object.keys(submarkets).forEach(submarket_name => {
                if (DISABLED.SUBMARKETS.includes(submarket_name)) return;
                const submarket = submarkets[submarket_name];
                const { symbols } = submarket;

                Object.keys(symbols).forEach(symbol_name => {
                    if (DISABLED.SYMBOLS.includes(symbol_name)) return;
                    const symbol = symbols[symbol_name];
                    symbols_for_bot.push({
                        group: submarket.display_name,
                        text: symbol.display_name,
                        value: symbol_name,
                        submarket: submarket_name,
                    });
                });
            });
        });

        return symbols_for_bot;
    }

    getMarketDropdownOptions() {
        const market_options = [];

        Object.keys(this.processed_symbols).forEach(market_name => {
            const { display_name } = this.processed_symbols[market_name];
            const market_display_name =
                display_name + (this.isMarketClosed(market_name) ? ` ${localize('(Closed)')}` : '');
            market_options.push([market_display_name, market_name]);
        });

        if (market_options.length === 0) {
            return config().NOT_AVAILABLE_DROPDOWN_OPTIONS;
        }
        market_options.sort(a => (a[1] === 'synthetic_index' ? -1 : 1));

        const has_closed_markets = market_options.some(market_option => this.isMarketClosed(market_option[1]));

        if (has_closed_markets) {
            const sorted_options = this.sortDropdownOptions(market_options, this.isMarketClosed);

            if (this.isMarketClosed('forex')) {
                return sorted_options.sort(a => (a[1] === 'synthetic_index' ? -1 : 1));
            }

            return sorted_options;
        }

        return market_options;
    }

    getSubmarketDropdownOptions(market) {
        const submarket_options = [];
        const market_obj = this.processed_symbols[market];

        if (market_obj) {
            const { submarkets } = market_obj;

            Object.keys(submarkets).forEach(submarket_name => {
                const { display_name } = submarkets[submarket_name];
                const submarket_display_name =
                    display_name + (this.isSubmarketClosed(submarket_name) ? ` ${localize('(Closed)')}` : '');
                submarket_options.push([submarket_display_name, submarket_name]);
            });
        }

        if (submarket_options.length === 0) {
            return config().NOT_AVAILABLE_DROPDOWN_OPTIONS;
        }
        if (market === 'synthetic_index') {
            submarket_options.sort(a => (a[1] === 'random_index' ? -1 : 1));
        }

        return this.sortDropdownOptions(submarket_options, this.isSubmarketClosed);
    }

    getSymbolDropdownOptions(submarket) {
        const symbol_options = Object.keys(this.processed_symbols).reduce((accumulator, market_name) => {
            const { submarkets } = this.processed_symbols[market_name];

            Object.keys(submarkets).forEach(submarket_name => {
                if (submarket_name === submarket) {
                    const { symbols } = submarkets[submarket_name];
                    Object.keys(symbols).forEach(symbol_name => {
                        const { display_name } = symbols[symbol_name];
                        const symbol_display_name =
                            display_name + (this.isSymbolClosed(symbol_name) ? ` ${localize('(Closed)')}` : '');
                        accumulator.push([symbol_display_name, symbol_name]);
                    });
                }
            });

            return accumulator;
        }, []);

        if (symbol_options.length === 0) {
            return config().NOT_AVAILABLE_DROPDOWN_OPTIONS;
        }

        return this.sortDropdownOptions(symbol_options, this.isSymbolClosed);
    }

    isMarketClosed(market_name) {
        const market = this.processed_symbols[market_name];

        if (!market) {
            return true;
        }

        return Object.keys(market.submarkets).every(submarket_name => this.isSubmarketClosed(submarket_name));
    }

    isSubmarketClosed(submarket_name) {
        const market_name = Object.keys(this.processed_symbols).find(name => {
            const market = this.processed_symbols[name];
            return Object.keys(market.submarkets).includes(submarket_name);
        });

        if (!market_name) {
            return true;
        }

        const market = this.processed_symbols[market_name];
        const submarket = market.submarkets[submarket_name];

        if (!submarket) {
            return true;
        }

        const { symbols } = submarket;
        return Object.keys(symbols).every(symbol_name => this.isSymbolClosed(symbol_name));
    }

    isSymbolClosed(symbol_name) {
        return this.active_symbols.some(
            active_symbol => {
                const sym = active_symbol.symbol || active_symbol.underlying_symbol;
                return sym === symbol_name &&
                    (active_symbol.exchange_is_open === 0 || active_symbol.exchange_is_open === false || active_symbol.is_trading_suspended === 1);
            }
        );
    }

    sortDropdownOptions = (dropdown_options, closedFunc) => {
        const options = [...dropdown_options];

        options.sort((a, b) => {
            const is_a_closed = closedFunc.call(this, a[1]);
            const is_b_closed = closedFunc.call(this, b[1]);

            if (is_a_closed && !is_b_closed) {
                return 1;
            } else if (is_a_closed === is_b_closed) {
                return 0;
            }
            return -1;
        });

        return options;
    };
}
