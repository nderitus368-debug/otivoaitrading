import React from 'react';
import Cookies from 'js-cookie';
import ChunkLoader from '@/components/loader/chunk-loader';
import { generateDerivApiInstance } from '@/external/bot-skeleton/services/api/appId';
import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import { exchangeCodeForToken, fetchAccounts } from '@/hooks/auth/useOauth2';
import { useOfflineDetection } from '@/hooks/useOfflineDetection';
import { clearAuthData } from '@/utils/auth-utils';
import { localize } from '@deriv-com/translations';
import { URLUtils } from '@deriv-com/utils';
import App from './App';

// Extend Window interface to include is_tmb_enabled property
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

                                    accounts.forEach((acc: any) => {
                                        const id = acc.account_id || acc.id || acc.loginid;
                                        const tok = acc.token || tokenData.access_token;
                                        accountsList[id] = tok;
                                        clientAccounts[id] = {
                                            loginid: id,
                                            token: tok,
                                            currency: acc.currency || 'USD',
                                            is_virtual: acc.is_virtual ? 1 : 0,
                                        };
                                    });

                                    const activeId =
                                        accounts[0].account_id || accounts[0].id || accounts[0].loginid;
                                    localStorage.setItem('accountsList', JSON.stringify(accountsList));
                                    localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));
                                    localStorage.setItem('authToken', accountsList[activeId]);
                                    localStorage.setItem('active_loginid', activeId);
                                } else {
                                    localStorage.setItem('authToken', tokenData.access_token);
                                }
                            } catch (fetchErr) {
                                console.warn('[Auth] Failed to fetch accounts via options API:', fetchErr);
                                localStorage.setItem('authToken', tokenData.access_token);
                            }

                            try {
                                const api = await generateDerivApiInstance();
                                if (api) {
                                    const activeToken = localStorage.getItem('authToken');
                                    if (activeToken) {
                                        await api.authorize(activeToken);
                                    }
                                    api.disconnect();
                                }
                            } catch (apiErr) {
                                console.warn('[Auth] WebSocket authorization after PKCE exchange failed:', apiErr);
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
