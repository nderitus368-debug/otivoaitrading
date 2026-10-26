import Cookies from 'js-cookie';
import CommonStore from '@/stores/common-store';
import { TAuthData } from '@/types/api-types';
import { clearAuthData, parseAccountDetails } from '@/utils/auth-utils';
import { observer as globalObserver } from '../../utils/observer';
import { doUntilDone, socket_state } from '../tradeEngine/utils/helpers';
import {
    CONNECTION_STATUS,
    setAccountList,
    setAuthData,
    setConnectionStatus,
    setIsAuthorized,
    setIsAuthorizing,
} from './observables/connection-status-stream';
import ApiHelpers from './api-helpers';
import { generateDerivApiInstance, V2GetActiveClientId, V2GetActiveToken } from './appId';
import chart_api from './chart-api';
import { fetchOtp } from '@/hooks/auth/useOauth2';

type CurrentSubscription = {
    id: string;
    unsubscribe: () => void;
};

type SubscriptionPromise = Promise<{
    subscription: CurrentSubscription;
}>;

type TApiBaseApi = {
    connection: {
        readyState: keyof typeof socket_state;
        addEventListener: (event: string, callback: () => void) => void;
        removeEventListener: (event: string, callback: () => void) => void;
    };
    send: (data: unknown) => void;
    disconnect: () => void;
    authorize: (token: string) => Promise<{ authorize: TAuthData; error: unknown }>;
    getSelfExclusion: () => Promise<unknown>;
    onMessage: () => {
        subscribe: (callback: (message: unknown) => void) => {
            unsubscribe: () => void;
        };
    };
} & ReturnType<typeof generateDerivApiInstance>;

class APIBase {
    api: TApiBaseApi | null = null;
    token: string = '';
    account_id: string = '';
    pip_sizes = {};
    account_info = {};
    is_running = false;
    subscriptions: CurrentSubscription[] = [];
    time_interval: ReturnType<typeof setInterval> | null = null;
    has_active_symbols = false;
    is_stopping = false;
    active_symbols = [];
    current_auth_subscriptions: SubscriptionPromise[] = [];
    is_authorized = false;
    active_symbols_promise: Promise<void> | null = null;
    common_store: CommonStore | undefined;
    landing_company: string | null = null;
    secondary_api: TApiBaseApi | null = null;
    secondary_token: string = '';
    secondary_is_authorized: boolean = false;
    demo_api: TApiBaseApi | null = null;
    demo_token: string = '';
    demo_is_authorized: boolean = false;
    token_override: string | null = null;
    private boundSocketOpen = () => this.onsocketopen();
    private boundSocketClose = () => this.onsocketclose();
    private reconnect_timeout: ReturnType<typeof setTimeout> | null = null;
    private is_reconnecting = false;

    unsubscribeAllSubscriptions = () => {
        this.current_auth_subscriptions?.forEach(subscription_promise => {
            subscription_promise.then(({ subscription }) => {
                if (subscription?.id) {
                    this.api?.send({
                        forget: subscription.id,
                    });
                }
            });
        });
        this.current_auth_subscriptions = [];
    };

    onsocketopen() {
        setConnectionStatus(CONNECTION_STATUS.OPENED);
    }

    onsocketclose() {
        setConnectionStatus(CONNECTION_STATUS.CLOSED);
        this.reconnectIfNotConnected();
    }

    async init(force_create_connection = false) {
        this.toggleRunButton(true);

        if (this.api) {
            this.unsubscribeAllSubscriptions();
        }

        const isOAuth = Boolean(localStorage.getItem('deriv_oauth_access_token'));
        const oauthToken = localStorage.getItem('deriv_oauth_access_token');
        const activeId = localStorage.getItem('active_loginid') || '';

        let customSocketUrl: string | null = null;
        if (isOAuth && oauthToken && activeId) {
            try {
                customSocketUrl = await fetchOtp(oauthToken, activeId);
                console.log('[api-base] Connected using OTP WebSocket URL for account:', activeId);
            } catch (otpErr) {
                console.warn('[api-base] Could not get OTP socket URL, using default socket:', otpErr);
            }
        }

        if (!this.api || this.api?.connection.readyState !== 1 || force_create_connection || customSocketUrl) {
            if (this.api?.connection) {
                ApiHelpers.disposeInstance();
                this.api.connection.removeEventListener('open', this.boundSocketOpen);
                this.api.connection.removeEventListener('close', this.boundSocketClose);
                this.api.disconnect();
            }

            this.api = generateDerivApiInstance(customSocketUrl);
            this.api?.connection.addEventListener('open', this.boundSocketOpen);
            this.api?.connection.addEventListener('close', this.boundSocketClose);
        }

        if (!this.has_active_symbols) {
            this.active_symbols_promise = this.getActiveSymbols();
        }

        this.initEventListeners();

        if (this.time_interval) clearInterval(this.time_interval);
        this.time_interval = null;

        if (V2GetActiveToken() || localStorage.getItem('deriv_oauth_access_token')) {
            setIsAuthorizing(true);
            await this.authorizeAndSubscribe();
        }

        chart_api.init(force_create_connection);
    }

    getConnectionStatus() {
        if (this.api?.connection) {
            const ready_state = this.api.connection.readyState;
            return socket_state[ready_state as keyof typeof socket_state] || 'Unknown';
        }
        return 'Socket not initialized';
    }

    terminate() {
        // eslint-disable-next-line no-console
        if (this.api) this.api.disconnect();
    }

    initEventListeners() {
        if (window) {
            window.addEventListener('online', this.reconnectIfNotConnected);
            window.addEventListener('focus', this.reconnectIfNotConnected);
        }
    }

    async createNewInstance(account_id: string) {
        if (this.account_id !== account_id) {
            await this.init();
        }
    }

    reconnectIfNotConnected = () => {
        if (this.is_reconnecting) return;
        if (this.reconnect_timeout) clearTimeout(this.reconnect_timeout);

        this.reconnect_timeout = setTimeout(() => {
            if (this.api?.connection?.readyState && this.api?.connection?.readyState > 1) {
                // eslint-disable-next-line no-console
                console.log('Info: Connection to the server was closed, attempting reconnect.');
                this.is_reconnecting = true;
                this.init(true).finally(() => {
                    this.is_reconnecting = false;
                });
            }
        }, 3000);
    };

    async getSecondaryApi(token: string) {
        if (this.secondary_api && this.secondary_token === token && this.secondary_is_authorized) {
            return this.secondary_api;
        }

        this.secondary_token = token;
        const api = generateDerivApiInstance() as TApiBaseApi;
        
        try {
            const { error } = await api.authorize(token);
            if (error) {
                console.error('Secondary API Authorization error:', error);
                return null;
            }
            this.secondary_api = api;
            this.secondary_is_authorized = true;
            return api;
        } catch (e) {
            console.error('Secondary API Authorization failed:', e);
            return null;
        }
    }

    async getDemoApi() {
        if (this.demo_api && this.demo_is_authorized) {
            return this.demo_api;
        }

        const account_list = JSON.parse(localStorage.getItem('accountsList') || '{}');
        const demo_loginid = Object.keys(account_list).find(loginid => loginid.startsWith('VRTC'));
        
        if (!demo_loginid) return null;
        
        const token = account_list[demo_loginid];
        this.demo_token = token;
        const api = generateDerivApiInstance() as TApiBaseApi;
        
        try {
            const { error } = await api.authorize(token);
            if (error) {
                console.error('Demo API Authorization error:', error);
                return null;
            }
            this.demo_api = api;
            this.demo_is_authorized = true;
            return api;
        } catch (e) {
            console.error('Demo API Authorization failed:', e);
            return null;
        }
    }

    async setTokenOverride(token: string | null) {
        this.token_override = token;
        if (this.api) {
            await this.api.authorize(token || V2GetActiveToken());
            this.authorizeAndSubscribe(); // Re-subscribe to everything on the new account
        }
    }

    async authorizeAndSubscribe() {
        const isOAuth = Boolean(localStorage.getItem('deriv_oauth_access_token'));
        const token = this.token_override || (isOAuth ? localStorage.getItem('deriv_oauth_access_token') : V2GetActiveToken());
        if (!token || !this.api) return;
        this.token = token;
        this.account_id = V2GetActiveClientId() ?? localStorage.getItem('active_loginid') ?? '';
        setIsAuthorizing(true);
        setIsAuthorized(false);

        let savedDetails: any[] = [];
        let activeAcc: any = null;

        // Pre-seed from localStorage if saved account details exist so UI shows immediately
        try {
            const rawSaved = JSON.parse(localStorage.getItem('client_account_details') || '[]');
            if (Array.isArray(rawSaved) && rawSaved.length > 0) {
                savedDetails = rawSaved.map(parseAccountDetails);
                const activeId = localStorage.getItem('active_loginid') || savedDetails[0]?.loginid;
                activeAcc = savedDetails.find((acc: any) => acc.loginid === activeId) || savedDetails[0];
                if (activeAcc) {
                    setAccountList(savedDetails as any);
                    setAuthData({
                        loginid: activeAcc.loginid,
                        currency: activeAcc.currency,
                        balance: typeof activeAcc.balance === 'number' ? activeAcc.balance : 0,
                        is_virtual: activeAcc.is_virtual,
                        account_list: savedDetails,
                    } as any);
                }
            }
        } catch {
            // Ignore parse errors
        }

        // Check if user authenticated via OAuth2 PKCE
        if (isOAuth) {
            const activeId = localStorage.getItem('active_loginid') || activeAcc?.loginid || '';
            const oauthToken = localStorage.getItem('deriv_oauth_access_token') || '';
            this.token = oauthToken;
            this.account_id = activeId;
            this.account_info = {
                loginid: activeId,
                currency: activeAcc?.currency || 'USD',
                balance: typeof activeAcc?.balance === 'number' ? activeAcc.balance : 0,
                is_virtual: activeAcc?.is_virtual ? 1 : 0,
                account_list: savedDetails,
            };
            setConnectionStatus(CONNECTION_STATUS.OPENED);
            setIsAuthorized(true);
            this.is_authorized = true;
            setIsAuthorizing(false);
            if (!this.has_active_symbols) {
                this.active_symbols_promise = this.getActiveSymbols();
            }
            this.toggleRunButton(false);
            try {
                this.subscribe();
            } catch (subErr) {
                console.warn('[api-base] subscribe on OAuth socket error:', subErr);
            }
            return;
        }

        try {
            // Timeout after 6 seconds to avoid hanging indefinitely
            const authPromise = this.api.authorize(this.token);
            const timeoutPromise = new Promise<{ authorize?: TAuthData; error?: any }>((_, reject) =>
                setTimeout(() => reject(new Error('WebSocket authorization timeout')), 6000)
            );
            const { authorize, error } = await Promise.race([authPromise, timeoutPromise]);

            if (error) {
                console.warn('WebSocket authorization returned error:', error);
                const hasSavedAccounts = Boolean(localStorage.getItem('client_account_details'));
                if (!hasSavedAccounts) {
                    if (error.code === 'InvalidToken') {
                        const is_tmb_enabled = window.is_tmb_enabled === true;
                        if (Cookies.get('logged_state') === 'true' && !is_tmb_enabled) {
                            globalObserver.emit('InvalidToken', { error });
                        } else {
                            clearAuthData();
                        }
                    }
                } else {
                    // Retain session from OAuth saved accounts
                    setIsAuthorized(true);
                    this.is_authorized = true;
                    if (!this.has_active_symbols) {
                        this.active_symbols_promise = this.getActiveSymbols();
                    }
                }
                setIsAuthorizing(false);
                return error;
            }

            this.account_info = authorize;
            setAccountList(authorize?.account_list || []);
            setAuthData(authorize);
            setIsAuthorized(true);
            this.is_authorized = true;
            localStorage.setItem('client_account_details', JSON.stringify(authorize?.account_list));
            localStorage.setItem('client.country', authorize?.country);

            if (this.has_active_symbols) {
                this.toggleRunButton(false);
            } else {
                this.active_symbols_promise = this.getActiveSymbols();
            }
            this.subscribe();
        } catch (e) {
            console.warn('Authorization attempt finished:', e);
            const hasSavedAccounts = Boolean(localStorage.getItem('client_account_details'));
            if (hasSavedAccounts) {
                setIsAuthorized(true);
                this.is_authorized = true;
                if (!this.has_active_symbols) {
                    this.active_symbols_promise = this.getActiveSymbols();
                }
            } else {
                this.is_authorized = false;
                setIsAuthorized(false);
            }
        } finally {
            setIsAuthorizing(false);
        }
    }

    async getSelfExclusion() {
        if (!this.api || !this.is_authorized) return;
        await this.api.getSelfExclusion();
        // TODO: fix self exclusion
    }

    async subscribe() {
        const subscribeToStream = (streamName: string) => {
            return doUntilDone(
                () => {
                    const subscription = this.api?.send({
                        [streamName]: 1,
                        subscribe: 1,
                    });
                    if (subscription) {
                        this.current_auth_subscriptions.push(subscription);
                    }
                    return subscription;
                },
                [],
                this
            );
        };

        const streamsToSubscribe = ['balance', 'transaction', 'proposal_open_contract'];

        await Promise.all(streamsToSubscribe.map(subscribeToStream));
    }

    waitForSocketOpen = async (timeoutMs = 6000): Promise<boolean> => {
        if (!this.api?.connection) return false;
        if (this.api.connection.readyState === 1) return true;
        return new Promise(resolve => {
            const timer = setTimeout(() => {
                resolve(this.api?.connection?.readyState === 1);
            }, timeoutMs);
            const onOpen = () => {
                clearTimeout(timer);
                resolve(true);
            };
            this.api?.connection?.addEventListener('open', onOpen);
        });
    };

    fetchSymbolsFromPublicSocket = (): Promise<{ active_symbols: any[] }> => {
        return new Promise((resolve, reject) => {
            try {
                const wsUrl = 'wss://api.derivws.com/trading/v1/options/ws/public';
                const socket = new WebSocket(wsUrl);
                const timer = setTimeout(() => {
                    socket.close();
                    reject(new Error('Public socket symbols request timed out'));
                }, 5000);

                socket.onopen = () => {
                    socket.send(JSON.stringify({ active_symbols: 'brief', product_type: 'basic' }));
                };

                socket.onmessage = (event: MessageEvent) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.active_symbols) {
                            clearTimeout(timer);
                            socket.close();
                            resolve(data);
                        } else if (data.error) {
                            clearTimeout(timer);
                            socket.close();
                            reject(new Error(data.error.message || 'Active symbols error'));
                        }
                    } catch (err) {
                        clearTimeout(timer);
                        socket.close();
                        reject(err);
                    }
                };

                socket.onerror = (err: Event) => {
                    clearTimeout(timer);
                    socket.close();
                    reject(err);
                };
            } catch (err) {
                reject(err);
            }
        });
    };

    getActiveSymbols = async () => {
        try {
            // Check localStorage cache first so workspace blocks have immediate symbol data
            if (!this.has_active_symbols) {
                try {
                    const cached = localStorage.getItem('cached_active_symbols');
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            this.active_symbols = parsed;
                            this.has_active_symbols = true;
                            const pip_sizes: Record<string, number> = {};
                            parsed.forEach(({ symbol, pip }: { symbol: string; pip: string }) => {
                                pip_sizes[symbol] = +(+pip).toExponential().substring(3);
                            });
                            this.pip_sizes = pip_sizes;
                            this.toggleRunButton(false);
                            if (ApiHelpers?.instance?.active_symbols) {
                                ApiHelpers.instance.active_symbols.retrieveActiveSymbols(true);
                            }
                        }
                    }
                } catch {
                    // Ignore cache read errors
                }
            }

            await this.waitForSocketOpen();

            const fetchSymbols = () => this.api?.send({ active_symbols: 'brief', product_type: 'basic' });
            const fetchSymbolsAlt = () => this.api?.send({ active_symbols: 'brief' });

            let response: any = null;
            for (let i = 0; i < 4; i++) {
                try {
                    response = await fetchSymbols();
                    if (response?.active_symbols?.length) break;
                    response = await fetchSymbolsAlt();
                    if (response?.active_symbols?.length) break;
                } catch {
                    await new Promise(r => setTimeout(r, 600));
                }
            }

            // Fallback: If primary socket returned no symbols, query public Deriv WS directly
            if (!response?.active_symbols?.length) {
                try {
                    response = await this.fetchSymbolsFromPublicSocket();
                } catch (fallbackErr) {
                    console.warn('[api-base] Public socket symbols fallback error:', fallbackErr);
                }
            }

            const raw_symbols = response?.active_symbols || [];
            if (raw_symbols.length) {
                // Normalize symbol fields to ensure standard field availability
                const active_symbols = raw_symbols.map((s: any) => ({
                    ...s,
                    symbol: s.symbol || s.underlying_symbol || '',
                    display_name: s.display_name || s.underlying_symbol_name || s.symbol || '',
                    market: s.market || 'synthetic_index',
                    market_display_name: s.market_display_name || s.market || 'Derived',
                    submarket: s.submarket || 'random_index',
                    submarket_display_name: s.submarket_display_name || s.submarket || 'Continuous Indices',
                    pip: s.pip || '0.001',
                    exchange_is_open: s.exchange_is_open !== undefined ? s.exchange_is_open : 1,
                    is_trading_suspended: s.is_trading_suspended || 0,
                }));

                this.has_active_symbols = true;
                const pip_sizes: Record<string, number> = {};
                active_symbols.forEach(({ symbol, pip }: { symbol: string; pip: string }) => {
                    pip_sizes[symbol] = +(+pip).toExponential().substring(3);
                });
                this.pip_sizes = pip_sizes;
                this.toggleRunButton(false);
                this.active_symbols = active_symbols;

                try {
                    localStorage.setItem('cached_active_symbols', JSON.stringify(active_symbols));
                } catch {
                    // Ignore storage quota error
                }

                if (ApiHelpers?.instance?.active_symbols) {
                    ApiHelpers.instance.active_symbols.retrieveActiveSymbols(true);
                }
            }
            return this.active_symbols || [];
        } catch (e) {
            console.warn('[api-base] getActiveSymbols error:', e);
            return this.active_symbols || [];
        }
    };

    toggleRunButton = (toggle: boolean) => {
        const run_button = document.querySelector('#db-animation__run-button');
        if (!run_button) return;
        (run_button as HTMLButtonElement).disabled = toggle;
    };

    setIsRunning(toggle = false) {
        this.is_running = toggle;
    }

    pushSubscription(subscription: CurrentSubscription) {
        this.subscriptions.push(subscription);
    }

    clearSubscriptions() {
        this.subscriptions.forEach(s => s.unsubscribe());
        this.subscriptions = [];

        // Resetting timeout resolvers
        const global_timeouts = globalObserver.getState('global_timeouts') ?? [];

        global_timeouts.forEach((_: unknown, i: number) => {
            clearTimeout(i);
        });
    }
}

export const api_base = new APIBase();
