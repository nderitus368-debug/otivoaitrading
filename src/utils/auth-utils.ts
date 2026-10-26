/**
 * Utility functions for authentication-related operations
 */
import Cookies from 'js-cookie';

/**
 * Determines whether an account is a Demo/Virtual account.
 * Handles:
 * - account_type === 'demo' | 'virtual'
 * - is_virtual === 1 | true
 * - DOT... (Demo Options Trading)
 * - VRT... / VRW... / VRTC... (Virtual trading accounts)
 */
export const isAccountDemo = (acc: any): boolean => {
    if (!acc) return false;
    const id = String(acc.account_id || acc.id || acc.loginid || '').toUpperCase();
    const type = String(acc.account_type || acc.type || '').toLowerCase();
    return (
        type === 'demo' ||
        type === 'virtual' ||
        Boolean(acc.is_virtual) ||
        acc.is_virtual === 1 ||
        id.startsWith('DOT') ||
        id.startsWith('VRT') ||
        id.startsWith('VRW')
    );
};

export type TParsedAccount = {
    loginid: string;
    account_id: string;
    account_type: 'demo' | 'real';
    currency: string;
    is_virtual: number;
    balance: number;
    [key: string]: any;
};

/**
 * Normalizes an account object from either REST API (/trading/v1/options/accounts)
 * or WebSocket authorize response into a standardized format with guaranteed
 * correct is_virtual and account_type fields.
 */
export const parseAccountDetails = (acc: any): TParsedAccount => {
    const id = String(acc.account_id || acc.id || acc.loginid || '');
    const isDemo = isAccountDemo(acc);
    const bal =
        typeof acc.balance === 'number'
            ? acc.balance
            : parseFloat(String(acc.balance ?? '0'));

    return {
        ...acc,
        loginid: id,
        account_id: id,
        account_type: isDemo ? 'demo' : 'real',
        currency: acc.currency || 'USD',
        is_virtual: isDemo ? 1 : 0,
        balance: isNaN(bal) ? 0 : bal,
    };
};

/**
 * Clears authentication data from local storage and reloads the page
 */
export const clearAuthData = (is_reload: boolean = true): void => {
    localStorage.removeItem('accountsList');
    localStorage.removeItem('clientAccounts');
    localStorage.removeItem('callback_token');
    localStorage.removeItem('authToken');
    localStorage.removeItem('active_loginid');
    localStorage.removeItem('active_account_type');
    localStorage.removeItem('client_account_details');
    localStorage.removeItem('deriv_oauth_access_token');
    localStorage.removeItem('deriv_oauth_refresh_token');
    localStorage.removeItem('client.accounts');
    localStorage.removeItem('client.country');
    sessionStorage.removeItem('query_param_currency');
    if (is_reload) {
        location.reload();
    }
};

/**
 * Handles OIDC authentication failure by clearing auth data and showing logged out view
 * @param error - The error that occurred during OIDC authentication
 */
export const handleOidcAuthFailure = (error: any): void => {
    // Log the error
    console.error('OIDC authentication failed:', error);

    // Clear auth data
    localStorage.removeItem('authToken');
    localStorage.removeItem('active_loginid');
    localStorage.removeItem('clientAccounts');
    localStorage.removeItem('accountsList');

    // Set logged_state cookie to false
    Cookies.set('logged_state', 'false', {
        domain: window.location.hostname.split('.').slice(-2).join('.'),
        expires: 30,
        path: '/',
        secure: true,
    });

    // Reload the page to show the logged out view
    window.location.reload();
};
