import { useCallback, useEffect, useMemo, useRef } from 'react';
import Cookies from 'js-cookie';
import { observer } from 'mobx-react-lite';
import { getDecimalPlaces, toMoment } from '@/components/shared';
import { FORM_ERROR_MESSAGES } from '@/components/shared/constants/form-error-messages';
import { initFormErrorMessages } from '@/components/shared/utils/validation/declarative-validation-rules';
import { api_base } from '@/external/bot-skeleton';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useOauth2 } from '@/hooks/auth/useOauth2';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import useTMB from '@/hooks/useTMB';
import { TLandingCompany, TSocketResponseData } from '@/types/api-types';
import { Balance } from '@deriv/api-types';
import { useTranslations } from '@deriv-com/translations';

type TClientInformation = {
    loginid?: string;
    email?: string;
    currency?: string;
    residence?: string | null;
    first_name?: string;
    last_name?: string;
    preferred_language?: string | null;
    user_id?: number | string;
    landing_company_shortcode?: string;
};
const CoreStoreProvider: React.FC<{ children: React.ReactNode }> = observer(({ children }) => {
    const currentDomain = useMemo(() => '.' + window.location.hostname.split('.').slice(-2).join('.'), []);
    const { isAuthorizing, isAuthorized, connectionStatus, accountList, activeLoginid, authData } = useApiBase();

    const appInitialization = useRef(false);
    const accountInitialization = useRef(false);
    const timeInterval = useRef<NodeJS.Timeout | null>(null);
    const msg_listener = useRef<{ unsubscribe: () => void } | null>(null);
    const { client, common } = useStore() ?? {};

    const { currentLang } = useTranslations();

    const { oAuthLogout } = useOauth2({ handleLogout: async () => client.logout(), client });

    const { is_tmb_enabled: tmb_enabled_from_hook } = useTMB();

    const is_tmb_enabled = useMemo(
        () => window.is_tmb_enabled === true || tmb_enabled_from_hook,
        [tmb_enabled_from_hook]
    );

    const isLoggedOutCookie = Cookies.get('logged_state') === 'false' && !is_tmb_enabled;

    useEffect(() => {
        if (isLoggedOutCookie && client?.is_logged_in) {
            oAuthLogout();
        }
    }, [isLoggedOutCookie, oAuthLogout, client?.is_logged_in]);

    const activeAccount = useMemo(
        () => accountList?.find(account => account.loginid === activeLoginid),
        [activeLoginid, accountList]
    );

    // Immediately seed all_accounts_balance from the authorize response so that
    // useActiveAccount and AccountSwitcher can show the real balance right away.
    useEffect(() => {
        if (authData?.loginid && authData?.currency && client && typeof authData.balance === 'number') {
            const loginid = authData.loginid;
            const currency = authData.currency;
            const balance = authData.balance;
            client.setCurrency(currency);
            client.setBalance(balance.toFixed(getDecimalPlaces(currency)));

            const accountsMap: Record<string, any> = {};
            if (Array.isArray(authData.account_list) && authData.account_list.length > 0) {
                authData.account_list.forEach((acc: any) => {
                    const accBal = typeof acc.balance === 'number' ? acc.balance : (acc.loginid === loginid ? balance : 0);
                    const accCur = acc.currency || currency;
                    accountsMap[acc.loginid] = {
                        balance: accBal,
                        converted_amount: accBal,
                        currency: accCur,
                        demo_account: acc.is_virtual ?? 0,
                        type: 'deriv',
                    };
                });
            } else {
                accountsMap[loginid] = {
                    balance,
                    converted_amount: balance,
                    currency,
                    demo_account: authData.is_virtual ?? 0,
                    type: 'deriv',
                };
            }

            client.setAllAccountsBalance({
                balance,
                loginid,
                accounts: accountsMap,
            } as Balance);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authData?.loginid, authData?.currency, authData?.balance, authData?.account_list]);

    // Keep real-time balance updates via the balance subscription stream.
    // Use activeLoginid directly (from authData$ observable) instead of activeAccount?.loginid
    // to avoid React render-timing race conditions where accountList isn't loaded yet.
    useEffect(() => {
        if (!activeLoginid || !client?.all_accounts_balance?.accounts) return;
        const currentBalanceData = client.all_accounts_balance.accounts[activeLoginid];
        if (currentBalanceData) {
            client.setBalance(currentBalanceData.balance.toFixed(getDecimalPlaces(currentBalanceData.currency)));
            client.setCurrency(currentBalanceData.currency);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeLoginid, client?.all_accounts_balance]);

    useEffect(() => {
        if (client && activeAccount) {
            client?.setLoginId(activeLoginid);
            client?.setAccountList(accountList);
            client?.setIsLoggedIn(true);
        }
    }, [accountList, activeAccount, activeLoginid, client]);

    useEffect(() => {
        initFormErrorMessages(FORM_ERROR_MESSAGES());

        return () => {
            if (timeInterval.current) {
                clearInterval(timeInterval.current);
            }
        };
    }, []);

    useEffect(() => {
        if (common && currentLang) {
            common.setCurrentLanguage(currentLang);
        }
    }, [currentLang, common]);

    useEffect(() => {
        const updateServerTime = () => {
            api_base.api
                .time()
                .then((res: TSocketResponseData<'time'>) => {
                    common.setServerTime(toMoment(res.time), false);
                })
                .catch(() => {
                    common.setServerTime(toMoment(Date.now()), true);
                });
        };

        // Clear any existing interval before setting up a new one
        if (timeInterval.current) {
            clearInterval(timeInterval.current);
            timeInterval.current = null;
        }

        // Only setup the interval if the connection is open and we have access to the API
        if (client && connectionStatus === CONNECTION_STATUS.OPENED && api_base?.api) {
            if (!appInitialization.current) {
                appInitialization.current = true;
                api_base.api
                    ?.websiteStatus()
                    ?.then((res: TSocketResponseData<'website_status'>) => {
                        if (res?.website_status) {
                            client.setWebsiteStatus(res.website_status);
                        }
                    })
                    ?.catch((error: unknown) => {
                        console.warn('[CoreStore] websiteStatus request failed:', error);
                    });
            }

            // Initial time update
            updateServerTime();

            // Schedule updates every 10 seconds
            timeInterval.current = setInterval(updateServerTime, 10000);
        }

        // Cleanup on unmount or dependency change
        return () => {
            if (timeInterval.current) {
                clearInterval(timeInterval.current);
                timeInterval.current = null;
            }
        };
    }, [client, common, is_tmb_enabled, connectionStatus]);

    const handleMessages = useCallback(
        async (res: Record<string, unknown>) => {
            if (!res) return;
            const data = res.data as TSocketResponseData<'balance'>;
            const { msg_type, error } = data;

            const isOAuth = Boolean(localStorage.getItem('deriv_oauth_access_token'));
            if (
                !isOAuth &&
                (error?.code === 'AuthorizationRequired' ||
                    error?.code === 'DisabledClient' ||
                    error?.code === 'InvalidToken')
            ) {
                await oAuthLogout();
            }

            if (msg_type === 'balance' && data && !error) {
                // The Balance type omits `currency` at the top level but the Deriv API always
                // includes it in individual balance subscription messages (API-token-compatible).
                const balance = data.balance as Balance & { currency?: string };
                if (balance?.loginid) {
                    const currency = balance.currency ?? client?.currency;
                    if (currency) {
                        const formatted = balance.balance.toFixed(getDecimalPlaces(currency));
                        client.setBalance(formatted);
                        client.setCurrency(currency);
                        // Rebuild all_accounts_balance so useActiveAccount and AccountSwitcher
                        // always read from the same source of truth.
                        const existing = client.all_accounts_balance;
                        client.setAllAccountsBalance({
                            ...(existing ?? {}),
                            balance: balance.balance,
                            loginid: balance.loginid,
                            accounts: {
                                ...(existing?.accounts ?? {}),
                                [balance.loginid]: {
                                    ...(existing?.accounts?.[balance.loginid] ?? {}),
                                    balance: balance.balance,
                                    converted_amount: balance.balance,
                                    currency,
                                    demo_account:
                                        existing?.accounts?.[balance.loginid]?.demo_account ??
                                        (authData?.is_virtual ?? 0),
                                    type: existing?.accounts?.[balance.loginid]?.type ?? 'deriv',
                                },
                            },
                        } as Balance);
                    }
                }
            }
        },
        [client, oAuthLogout, activeLoginid, authData]
    );

    useEffect(() => {
        if (!isAuthorizing && client) {
            const subscription = api_base?.api?.onMessage().subscribe(handleMessages);
            msg_listener.current = { unsubscribe: subscription?.unsubscribe };
        }

        return () => {
            if (msg_listener.current) {
                msg_listener.current.unsubscribe?.();
            }
        };
    }, [connectionStatus, handleMessages, isAuthorizing, isAuthorized, client]);

    useEffect(() => {
        if (!isAuthorizing && isAuthorized && !accountInitialization.current && client) {
            accountInitialization.current = true;
            // Mark landing company as loaded so app loading doesn't hang
            client?.setLandingCompany({} as unknown as TLandingCompany);

            api_base.api?.getSettings?.()?.then((settingRes: TSocketResponseData<'get_settings'>) => {
                client?.setAccountSettings(settingRes?.get_settings);
                const client_information: TClientInformation = {
                    loginid: activeAccount?.loginid,
                    email: settingRes?.get_settings?.email,
                    currency: client?.currency,
                    residence: settingRes?.get_settings?.residence,
                    first_name: settingRes?.get_settings?.first_name,
                    last_name: settingRes?.get_settings?.last_name,
                    preferred_language: settingRes?.get_settings?.preferred_language,
                    user_id: ((api_base.account_info as any)?.user_id as number) || activeLoginid,
                    landing_company_shortcode: activeAccount?.landing_company_name,
                };

                Cookies.set('client_information', JSON.stringify(client_information), {
                    domain: currentDomain,
                });

                api_base.api
                    ?.landingCompany?.({
                        landing_company: settingRes?.get_settings?.country_code,
                    })
                    ?.then((res: TSocketResponseData<'landing_company'>) => {
                        if (res?.landing_company) {
                            client?.setLandingCompany(res.landing_company as unknown as TLandingCompany);
                        }
                    })
                    ?.catch(() => {});
            })?.catch(() => {});

            api_base.api?.getAccountStatus?.()?.then((res: TSocketResponseData<'get_account_status'>) => {
                client?.setAccountStatus(res?.get_account_status);
            })?.catch(() => {});
        }
    }, [isAuthorizing, isAuthorized, client]);

    return <>{children}</>;
});

export default CoreStoreProvider;
