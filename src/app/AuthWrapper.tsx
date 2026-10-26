import React from 'react';
import Cookies from 'js-cookie';
import ChunkLoader from '@/components/loader/chunk-loader';
import { api_base } from '@/external/bot-skeleton';
import { setAccountList, setAuthData } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { generateDerivApiInstance } from '@/external/bot-skeleton/services/api/appId';
import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import {
    exchangeCodeForToken,
    fetchAccounts,
    getOAuthAccessToken,
    setOAuthAccessToken,
    setOAuthRefreshToken,
} from '@/hooks/auth/useOauth2';
import { useOfflineDetection } from '@/hooks/useOfflineDetection';
import { clearAuthData, parseAccountDetails } from '@/utils/auth-utils';
import { localize } from '@deriv-com/translations';
import { URLUtils } from '@deriv-com/utils';
import App from './App';

declare global {
    interface Window {
        is_tmb_enabled?: boolean;
    }
}

const setLocalStorageToken = async (
    loginInfo: URLUtils.LoginInfo[],
    paramsToDelete: string[],
    setIsAuthComplete: React.Dispatch<React.SetStateAction<boolean>>,
    isOnline: boolean
) => {
    if (loginInfo.length) {
        try {
            const defaultActiveAccount = URLUtils.getDefaultActiveAccount(loginInfo);
            if (!defaultActiveAccount) return;

            const accountsList: Record<string, string> = {};
            const clientAccounts: Record<string, { loginid: string; token: string; currency: string }> = {};

            loginInfo.forEach((account: { loginid: string; token: string; currency: string }) => {
                accountsList[account.loginid] = account.token;
                clientAccounts[account.loginid] = account;
            });

            localStorage.setItem('accountsList', JSON.stringify(accountsList));
            localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));

            URLUtils.filterSearchParams(paramsToDelete);

            if (!isOnline) {
                localStorage.setItem('authToken', loginInfo[0].token);
                localStorage.setItem('active_loginid', loginInfo[0].loginid);
                return;
            }

            try {
                const api = await generateDerivApiInstance();

                if (api) {
                    const { authorize, error } = await api.authorize(loginInfo[0].token);
                    api.disconnect();

                    if (error) {
                        if (error.code === 'InvalidToken') {
                            setIsAuthComplete(true);

                            const is_tmb_enabled = window.is_tmb_enabled === true;
                            if (Cookies.get('logged_state') === 'true' && !is_tmb_enabled) {
                                globalObserver.emit('InvalidToken', { error });
                            }

                            if (Cookies.get('logged_state') === 'false') {
                                clearAuthData();
                            }
                        }
                    } else {
                        localStorage.setItem('client.country', authorize.country);
                        const firstId = authorize?.account_list[0]?.loginid;
                        const filteredTokens = loginInfo.filter(token => token.loginid === firstId);

                        if (filteredTokens.length) {
                            localStorage.setItem('authToken', filteredTokens[0].token);
                            localStorage.setItem('active_loginid', filteredTokens[0].loginid);
                            return;
                        }
                    }
                }
            } catch (apiError) {
                console.error('[Auth] API connection error:', apiError);
                localStorage.setItem('authToken', loginInfo[0].token);
                localStorage.setItem('active_loginid', loginInfo[0].loginid);
            }

            localStorage.setItem('authToken', loginInfo[0].token);
            localStorage.setItem('active_loginid', loginInfo[0].loginid);
        } catch (error) {
            console.error('Error setting up login info:', error);
        }
    }
};

export const AuthWrapper = () => {
    const [isAuthComplete, setIsAuthComplete] = React.useState(false);
    const { loginInfo, paramsToDelete } = URLUtils.getLoginInfoFromURL();
    const { isOnline } = useOfflineDetection();

    React.useEffect(() => {
        const initializeAuth = async () => {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const code = urlParams.get('code');
                const callbackState = urlParams.get('state');
                const verifier = sessionStorage.getItem('pkce_code_verifier');
                const savedState = sessionStorage.getItem('oauth_state');

                if (code) {
                    if (!verifier || !savedState || (callbackState && callbackState !== savedState)) {
                        console.warn('[Auth] Invalid OAuth callback state or PKCE verifier. Aborting auth flow.');
                        sessionStorage.removeItem('pkce_code_verifier');
                        sessionStorage.removeItem('oauth_state');
                        setIsAuthComplete(true);
                        return;
                    }

                    try {
                        const tokenData = await exchangeCodeForToken(code, verifier);
                        sessionStorage.removeItem('pkce_code_verifier');
                        sessionStorage.removeItem('oauth_state');

                        if (tokenData?.access_token) {
                            setOAuthAccessToken(tokenData.access_token);
                            if (tokenData.refresh_token) {
                                setOAuthRefreshToken(tokenData.refresh_token);
                            }

                            try {
                                const accounts = await fetchAccounts(tokenData.access_token);

                                if (Array.isArray(accounts) && accounts.length > 0) {
                                    const accountsList: Record<string, string> = {};
                                    const clientAccounts: Record<string, any> = {};
                                    const formattedAccountList = accounts.map(parseAccountDetails);

                                    formattedAccountList.forEach((acc: any) => {
                                        accountsList[acc.loginid] = tokenData.access_token;
                                        clientAccounts[acc.loginid] = {
                                            loginid: acc.loginid,
                                            token: tokenData.access_token,
                                            currency: acc.currency,
                                            is_virtual: acc.is_virtual,
                                            account_type: acc.account_type,
                                        };
                                    });

                                    const savedActiveId = localStorage.getItem('active_loginid');
                                    const activeAccount =
                                        (savedActiveId && formattedAccountList.find((a: any) => a.loginid === savedActiveId)) ||
                                        formattedAccountList.find((a: any) => a.is_virtual === 0) ||
                                        formattedAccountList[0];

                                    const activeId = activeAccount.loginid;
                                    localStorage.setItem('accountsList', JSON.stringify(accountsList));
                                    localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));
                                    localStorage.setItem('client_account_details', JSON.stringify(formattedAccountList));
                                    localStorage.setItem('authToken', accountsList[activeId]);
                                    localStorage.setItem('active_loginid', activeId);
                                    localStorage.setItem('active_account_type', activeAccount.account_type);
                                    Cookies.set('logged_state', 'true');

                                    setAccountList(formattedAccountList as any);
                                    setAuthData({
                                        loginid: activeId,
                                        currency: activeAccount.currency,
                                        balance: activeAccount.balance,
                                        is_virtual: activeAccount.is_virtual,
                                        account_list: formattedAccountList,
                                    } as any);

                                    await api_base?.init(true);
                                } else {
                                    localStorage.setItem('authToken', tokenData.access_token);
                                }
                            } catch (fetchErr) {
                                console.warn('[Auth] Failed to fetch accounts via options API:', fetchErr);
                                localStorage.setItem('authToken', tokenData.access_token);
                            }

                            urlParams.delete('code');
                            urlParams.delete('state');
                            const cleanSearch = urlParams.toString();
                            const cleanUrl = `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${window.location.hash}`;
                            window.history.replaceState({}, document.title, cleanUrl);

                            setIsAuthComplete(true);
                            return;
                        }
                    } catch (codeErr) {
                        console.error('[Auth] PKCE token exchange failed:', codeErr);
                        sessionStorage.removeItem('pkce_code_verifier');
                        sessionStorage.removeItem('oauth_state');
                    }
                }

                try {
                    const rawSaved = JSON.parse(localStorage.getItem('client_account_details') || '[]');
                    if (Array.isArray(rawSaved) && rawSaved.length > 0) {
                        const savedDetails = rawSaved.map(parseAccountDetails);
                        localStorage.setItem('client_account_details', JSON.stringify(savedDetails));

                        const activeId = localStorage.getItem('active_loginid') || savedDetails[0]?.loginid;
                        const activeAcc = savedDetails.find((acc: any) => acc.loginid === activeId) || savedDetails[0];

                        if (activeAcc) {
                            localStorage.setItem('active_loginid', activeAcc.loginid);
                            localStorage.setItem('active_account_type', activeAcc.account_type);

                            setAccountList(savedDetails);
                            setAuthData({
                                loginid: activeAcc.loginid,
                                currency: activeAcc.currency,
                                balance: typeof activeAcc.balance === 'number' ? activeAcc.balance : 0,
                                is_virtual: activeAcc.is_virtual,
                                account_list: savedDetails,
                            } as any);

                            const oauthToken = getOAuthAccessToken();
                            if (oauthToken) {
                                fetchAccounts(oauthToken)
                                    .then((freshAccounts: any[]) => {
                                        if (!Array.isArray(freshAccounts) || freshAccounts.length === 0) return;

                                        const freshList = freshAccounts.map(parseAccountDetails);
                                        const freshActiveId = localStorage.getItem('active_loginid') || freshList[0]?.loginid;
                                        const freshAcc = freshList.find((a: any) => a.loginid === freshActiveId) || freshList[0];

                                        if (freshAcc) {
                                            localStorage.setItem('client_account_details', JSON.stringify(freshList));
                                            localStorage.setItem('active_account_type', freshAcc.account_type);

                                            setAccountList(freshList as any);
                                            setAuthData({
                                                loginid: freshAcc.loginid,
                                                currency: freshAcc.currency,
                                                balance: freshAcc.balance,
                                                is_virtual: freshAcc.is_virtual,
                                                account_list: freshList,
                                            } as any);
                                        }
                                    })
                                    .catch(() => {
                                        // ignore
                                    });
                            }
                        }
                    }
                } catch {
                    // ignore parse error
                }

                await setLocalStorageToken(loginInfo, paramsToDelete, setIsAuthComplete, isOnline);
                URLUtils.filterSearchParams(['lang']);
                setIsAuthComplete(true);
            } catch (error) {
                console.error('[Auth] Authentication initialization failed:', error);
                setIsAuthComplete(true);
            }
        };

        if (!isOnline) {
            console.log('[Auth] Offline detected, proceeding with minimal auth');
            setIsAuthComplete(true);
        }

        initializeAuth();
    }, [loginInfo, paramsToDelete, isOnline]);

    React.useEffect(() => {
        if (!isOnline && !isAuthComplete) {
            console.log('[Auth] Offline detected, setting auth timeout');
            const timeout = setTimeout(() => {
                console.log('[Auth] Offline timeout reached, proceeding without full auth');
                setIsAuthComplete(true);
            }, 2000);

            return () => clearTimeout(timeout);
        }
    }, [isOnline, isAuthComplete]);

    const getLoadingMessage = () => {
        if (!isOnline) return localize('Loading offline mode...');
        return localize('Initializing...');
    };

    if (!isAuthComplete) {
        return <ChunkLoader message={getLoadingMessage()} />;
    }

    return <App />;
};
