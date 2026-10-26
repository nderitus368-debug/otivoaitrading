import React from 'react';
import Cookies from 'js-cookie';
import ChunkLoader from '@/components/loader/chunk-loader';
import { api_base } from '@/external/bot-skeleton';
import { setAccountList, setAuthData } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { generateDerivApiInstance } from '@/external/bot-skeleton/services/api/appId';
import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import { exchangeCodeForToken, fetchAccounts } from '@/hooks/auth/useOauth2';
import { useOfflineDetection } from '@/hooks/useOfflineDetection';
import { clearAuthData, parseAccountDetails } from '@/utils/auth-utils';
import { localize } from '@deriv-com/translations';
import { URLUtils } from '@deriv-com/utils';
import App from './App';

// Extend Window interface to include is_tmb_enabled property
declare global {
    interface Window {
        is_tmb_enabled?: boolean;
    }
}

const initializeStoredSession = async () => {
    const storedToken = localStorage.getItem('authToken');
    const storedLoginId = localStorage.getItem('active_loginid');
    const oauthToken = localStorage.getItem('deriv_oauth_access_token');

    if (!storedToken || !storedLoginId || oauthToken) {
        return;
    }

    try {
        const savedAccounts = JSON.parse(localStorage.getItem('client_account_details') || '[]');
        const accountMap: Record<string, string> = {};
        const clientAccounts: Record<string, any> = {};

        if (Array.isArray(savedAccounts) && savedAccounts.length > 0) {
            savedAccounts.forEach((account: any) => {
                const parsed = parseAccountDetails(account);
                const loginid = parsed.loginid || account.loginid;
                if (loginid) {
                    accountMap[loginid] = parsed.token || storedToken;
                    clientAccounts[loginid] = {
                        loginid,
                        token: parsed.token || storedToken,
                        currency: parsed.currency,
                        is_virtual: parsed.is_virtual,
                        account_type: parsed.account_type,
                    };
                }
            });
        }

        if (!accountMap[storedLoginId]) {
            accountMap[storedLoginId] = storedToken;
        }

        localStorage.setItem('accountsList', JSON.stringify(accountMap));
        localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));
        await api_base.init(true);
    } catch (error) {
        console.warn('[Auth] Failed to initialize stored Deriv session:', error);
    }
};

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

            // Skip API connection when offline
            if (!isOnline) {
                console.log('[Auth] Offline mode - skipping API connection');
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
                        // Check if the error is due to an invalid token
                        if (error.code === 'InvalidToken') {
                            // Set isAuthComplete to true to prevent the app from getting stuck in loading state
                            setIsAuthComplete(true);

                            const is_tmb_enabled = window.is_tmb_enabled === true;
                            // Only emit the InvalidToken event if logged_state is true
                            if (Cookies.get('logged_state') === 'true' && !is_tmb_enabled) {
                                // Emit an event that can be caught by the application to retrigger OIDC authentication
                                globalObserver.emit('InvalidToken', { error });
                            }

                            if (Cookies.get('logged_state') === 'false') {
                                // If the user is not logged out, we need to clear the local storage
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
                            await api_base.init(true);
                            return;
                        }
                    }
                }
            } catch (apiError) {
                console.error('[Auth] API connection error:', apiError);
                // Still set token in offline mode
                localStorage.setItem('authToken', loginInfo[0].token);
                localStorage.setItem('active_loginid', loginInfo[0].loginid);
            }

            localStorage.setItem('authToken', loginInfo[0].token);
            localStorage.setItem('active_loginid', loginInfo[0].loginid);
            await api_base.init(true);
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
                // Check if returning from Deriv OAuth with authorization code
                const urlParams = new URLSearchParams(window.location.search);
                const code = urlParams.get('code');
                const verifier = sessionStorage.getItem('pkce_code_verifier');

                if (code && verifier) {
                    try {
                        const tokenData = await exchangeCodeForToken(code, verifier);
                        sessionStorage.removeItem('pkce_code_verifier');
                        sessionStorage.removeItem('oauth_state');

                        if (tokenData?.access_token) {
                            localStorage.setItem('deriv_oauth_access_token', tokenData.access_token);
                            if (tokenData.refresh_token) {
                                localStorage.setItem('deriv_oauth_refresh_token', tokenData.refresh_token);
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

                                    // Pre-set observables so UI is immediately ready
                                    setAccountList(formattedAccountList as any);
                                    setAuthData({
                                        loginid: activeId,
                                        currency: activeAccount.currency,
                                        balance: activeAccount.balance,
                                        is_virtual: activeAccount.is_virtual,
                                        account_list: formattedAccountList,
                                    } as any);

                                    // Initialize authenticated engine connection
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

                // Pre-seed saved account observables if available from previous OAuth session
                // Also try to refresh balances from Deriv REST API in the background
                try {
                    const rawSaved = JSON.parse(localStorage.getItem('client_account_details') || '[]');
                    if (Array.isArray(rawSaved) && rawSaved.length > 0) {
                        // Re-sanitize saved details to immediately fix any previously incorrect is_virtual flags
                        const savedDetails = rawSaved.map(parseAccountDetails);
                        localStorage.setItem('client_account_details', JSON.stringify(savedDetails));

                        const activeId = localStorage.getItem('active_loginid') || savedDetails[0]?.loginid;
                        const activeAcc = savedDetails.find((acc: any) => acc.loginid === activeId) || savedDetails[0];
                        if (activeAcc) {
                            localStorage.setItem('active_loginid', activeAcc.loginid);
                            localStorage.setItem('active_account_type', activeAcc.account_type);
                            // Immediately seed observables from sanitized saved data so UI shows accurate balance right away
                            setAccountList(savedDetails);
                            setAuthData({
                                loginid: activeAcc.loginid,
                                currency: activeAcc.currency,
                                balance: typeof activeAcc.balance === 'number' ? activeAcc.balance : 0,
                                is_virtual: activeAcc.is_virtual,
                                account_list: savedDetails,
                            } as any);

                            // Then refresh balances from live API in the background (non-blocking)
                            const oauthToken = localStorage.getItem('deriv_oauth_access_token');
                            if (oauthToken) {
                                fetchAccounts(oauthToken).then((freshAccounts: any[]) => {
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
                                }).catch(() => {
                                    // Silently ignore — we already seeded from localStorage
                                });
                            }
                        }
                    }
                } catch {
                    // Ignore parse error
                }

                const hasStoredAuth = Boolean(localStorage.getItem('authToken') && localStorage.getItem('active_loginid'));
                if (hasStoredAuth) {
                    await initializeStoredSession();
                }

                // Pass isOnline to setLocalStorageToken to handle offline mode properly
                await setLocalStorageToken(loginInfo, paramsToDelete, setIsAuthComplete, isOnline);
                URLUtils.filterSearchParams(['lang']);
                setIsAuthComplete(true);
            } catch (error) {
                console.error('[Auth] Authentication initialization failed:', error);
                // Don't block the app if auth fails, especially when offline
                setIsAuthComplete(true);
            }
        };

        // If offline, set auth complete immediately but still run initializeAuth
        // to save login info to localStorage for offline use
        if (!isOnline) {
            console.log('[Auth] Offline detected, proceeding with minimal auth');
            setIsAuthComplete(true);
        }

        initializeAuth();
    }, [loginInfo, paramsToDelete, isOnline]);

    // Add timeout for offline scenarios to prevent infinite loading
    React.useEffect(() => {
        if (!isOnline && !isAuthComplete) {
            console.log('[Auth] Offline detected, setting auth timeout');
            const timeout = setTimeout(() => {
                console.log('[Auth] Offline timeout reached, proceeding without full auth');
                setIsAuthComplete(true);
            }, 2000); // 2 second timeout for offline

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
