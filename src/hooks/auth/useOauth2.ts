import { useState } from 'react';

export const APP_ID = '69546';
export const NEW_CLIENT_ID = '34EgGcZ4kdDYvSMRn1Jxo';

const OAUTH_ACCESS_TOKEN_KEY = 'deriv_oauth_access_token';
const OAUTH_REFRESH_TOKEN_KEY = 'deriv_oauth_refresh_token';

export const getOAuthAccessToken = () =>
    sessionStorage.getItem(OAUTH_ACCESS_TOKEN_KEY) ?? localStorage.getItem(OAUTH_ACCESS_TOKEN_KEY) ?? '';

export const setOAuthAccessToken = (token: string) => {
    sessionStorage.setItem(OAUTH_ACCESS_TOKEN_KEY, token);
    localStorage.removeItem(OAUTH_ACCESS_TOKEN_KEY);
};

export const getOAuthRefreshToken = () =>
    sessionStorage.getItem(OAUTH_REFRESH_TOKEN_KEY) ?? localStorage.getItem(OAUTH_REFRESH_TOKEN_KEY) ?? '';

export const setOAuthRefreshToken = (token: string) => {
    sessionStorage.setItem(OAUTH_REFRESH_TOKEN_KEY, token);
    localStorage.removeItem(OAUTH_REFRESH_TOKEN_KEY);
};

export const refreshAccessToken = async (): Promise<string | null> => {
    const refreshToken = getOAuthRefreshToken();
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
        setOAuthAccessToken(data.access_token);
        if (data.refresh_token) {
            setOAuthRefreshToken(data.refresh_token);
        }
        return data.access_token;
    } catch (err) {
        console.error('Error refreshing token:', err);
        return null;
    }
};

export const getRedirectUri = () => {
    // Must exactly match the registered Redirect URI in Deriv Dashboard (case, protocol, no trailing slash)
    const hostname = window.location.hostname;
    if (hostname === 'otivoaitrading.vercel.app' || hostname.includes('vercel.app')) {
        return 'https://otivoaitrading.vercel.app';
    }
    if (hostname.includes('netlify.app')) {
        return 'https://otivobotai.netlify.app';
    }
    // Localhost / custom origin: ensure no trailing slash
    return window.location.origin.replace(/\/$/, '');
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
    const list = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : data.accounts || [];
    return list;
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

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export const createPkce = async () => {
    const verifierBytes = new Uint8Array(32);
    window.crypto.getRandomValues(verifierBytes);
    const code_verifier = base64UrlEncode(verifierBytes);
    const digest = await window.crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(code_verifier)
    );
    const code_challenge = base64UrlEncode(digest);
    return { code_verifier, code_challenge, code_challenge_method: 'S256' as const };
};

const generateState = () => {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

export const useOauth2 = (options?: { handleLogout?: () => Promise<void>; client?: any }) => {
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const login = async () => {
        setIsLoggingIn(true);

        sessionStorage.removeItem('pkce_code_verifier');
        sessionStorage.removeItem('oauth_state');
        sessionStorage.removeItem('oauth_exchanging_code');

        const { code_verifier, code_challenge, code_challenge_method } = await createPkce();
        const state = generateState();

        sessionStorage.setItem('pkce_code_verifier', code_verifier);
        sessionStorage.setItem('oauth_state', state);

        const redirectUri = getRedirectUri();
        const authUrl = new URL('https://auth.deriv.com/oauth2/auth');
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', NEW_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('scope', 'trade');
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge', code_challenge);
        authUrl.searchParams.set('code_challenge_method', code_challenge_method);

        console.log('[OAuth2] Initiating login with URL:', authUrl.toString());
        console.log('[OAuth2] Client ID:', NEW_CLIENT_ID);
        console.log('[OAuth2] Redirect URI:', redirectUri);

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
        sessionStorage.removeItem('oauth_exchanging_code');
        sessionStorage.removeItem(OAUTH_ACCESS_TOKEN_KEY);
        sessionStorage.removeItem(OAUTH_REFRESH_TOKEN_KEY);
        localStorage.removeItem(OAUTH_ACCESS_TOKEN_KEY);
        localStorage.removeItem(OAUTH_REFRESH_TOKEN_KEY);
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
