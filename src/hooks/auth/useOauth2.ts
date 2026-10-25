import { useState } from 'react';

export const APP_ID = '69546';
export const NEW_CLIENT_ID = '34EgGcZ4kdDYvSMRn1Jxo';

export const refreshAccessToken = async (): Promise<string | null> => {
    const refreshToken = localStorage.getItem('deriv_oauth_refresh_token');
    if (!refreshToken) return null;

    try {
        const res = await fetch('https://auth.deriv.com/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: NEW_CLIENT_ID,
                refresh_token: refreshToken,
            }),
        });
        const data = await res.json();
        if (data.error || !data.access_token) {
            console.warn('Failed to refresh token:', data.error_description || data.error);
            return null;
        }
        localStorage.setItem('deriv_oauth_access_token', data.access_token);
        if (data.refresh_token) {
            localStorage.setItem('deriv_oauth_refresh_token', data.refresh_token);
        }
        return data.access_token;
    } catch (err) {
        console.error('Error refreshing token:', err);
        return null;
    }
};

export const getRedirectUri = () => {
    // Must exactly match the registered Redirect URI in Deriv Dashboard
    if (
        window.location.hostname.includes('netlify.app') ||
        window.location.hostname === 'otivoaitrading.vercel.app'
    ) {
        return 'https://otivobotai.netlify.app';
    }
    return `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '');
};

export const exchangeCodeForToken = async (code: string, verifier: string) => {
    const res = await fetch('https://auth.deriv.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: NEW_CLIENT_ID,
            code,
            code_verifier: verifier,
            redirect_uri: getRedirectUri(),
        }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error);
    return data; // { access_token, refresh_token, ... }
};

export const fetchAccounts = async (accessToken: string) => {
    let token = accessToken;
    let res = await fetch('https://api.derivws.com/trading/v1/options/accounts', {
        headers: {
            Authorization: `Bearer ${token}`,
            'Deriv-App-ID': APP_ID,
        },
    });

    if (res.status === 401 || res.status === 403) {
        const newToken = await refreshAccessToken();
        if (newToken) {
            token = newToken;
            res = await fetch('https://api.derivws.com/trading/v1/options/accounts', {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Deriv-App-ID': APP_ID,
                },
            });
        }
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error_description || 'Failed to fetch accounts');
    return data.data; // List of accounts
};

export const fetchOtp = async (accessToken: string, accountId: string) => {
    let token = accessToken;
    let res = await fetch(`https://api.derivws.com/trading/v1/options/accounts/${accountId}/otp`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Deriv-App-ID': APP_ID,
        },
    });

    if (res.status === 401 || res.status === 403) {
        const newToken = await refreshAccessToken();
        if (newToken) {
            token = newToken;
            res = await fetch(`https://api.derivws.com/trading/v1/options/accounts/${accountId}/otp`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Deriv-App-ID': APP_ID,
                },
            });
        }
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error_description || 'Failed to fetch OTP');
    return data.data.url; // The authenticated WebSocket URL
};

export const useOauth2 = (options?: { handleLogout?: () => Promise<void>; client?: any }) => {
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    // 1. Helper to generate PKCE Code Verifier
    const generateCodeVerifier = () => {
        const array = new Uint8Array(64);
        window.crypto.getRandomValues(array);
        return Array.from(array)
            .map(v => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[v % 66])
            .join('');
    };

    // 2. Helper to generate Code Challenge from Verifier
    const generateCodeChallenge = async (verifier: string) => {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const hash = await window.crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode(...new Uint8Array(hash)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    };

    const login = async () => {
        setIsLoggingIn(true);

        // Clear any previous PKCE / state values before generating new ones
        sessionStorage.removeItem('pkce_code_verifier');
        sessionStorage.removeItem('oauth_state');
        sessionStorage.removeItem('oauth_exchanging_code');

        // 1. Generate PKCE values
        const verifier = generateCodeVerifier();
        const challenge = await generateCodeChallenge(verifier);
        const state = Math.random().toString(36).substring(2);

        // 2. Store verifier and state for the callback step
        sessionStorage.setItem('pkce_code_verifier', verifier);
        sessionStorage.setItem('oauth_state', state);

        // 3. Construct Auth URL cleanly
        const authUrl = new URL('https://auth.deriv.com/oauth2/auth');
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', NEW_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', getRedirectUri());
        authUrl.searchParams.set('scope', 'trade');
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge', challenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');

        window.location.href = authUrl.toString();
    };

    const loginClassic = () => {
        sessionStorage.removeItem('pkce_code_verifier');
        sessionStorage.removeItem('oauth_state');
        sessionStorage.removeItem('oauth_exchanging_code');
        window.location.href = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&l=en&brand=deriv`;
    };

    const logout = async () => {
        sessionStorage.removeItem('pkce_code_verifier');
        sessionStorage.removeItem('oauth_state');
        localStorage.removeItem('deriv_oauth_access_token');
        localStorage.removeItem('deriv_oauth_refresh_token');
        localStorage.removeItem('authToken');
        localStorage.removeItem('active_loginid');
        localStorage.removeItem('accountsList');
        localStorage.removeItem('clientAccounts');

        if (options?.handleLogout) {
            try {
                await options.handleLogout();
            } catch (err) {
                console.error('Error during handleLogout:', err);
            }
        }

        window.location.href = '/';
    };

    return {
        login,
        loginClassic,
        logout,
        oAuthLogout: logout,
        isLoggingIn,
        isSingleLoggingIn: isLoggingIn,
        retriggerOAuth2Login: login,
        exchangeCodeForToken,
        fetchAccounts,
        fetchOtp,
        refreshAccessToken,
    };
};
