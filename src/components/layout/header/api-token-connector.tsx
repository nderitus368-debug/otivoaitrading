import React, { useRef, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';
import { generateDerivApiInstance } from '@/external/bot-skeleton/services/api/appId';
import { useOauth2 } from '@/hooks/auth/useOauth2';
import './api-token-connector.scss';

const ApiTokenConnector = () => {
    const { login, isLoggingIn } = useOauth2();
    const [isExpanded, setIsExpanded] = useState(false);
    const [token, setToken] = useState('');
    const [error, setError] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const openForm = () => {
        setIsExpanded(true);
        setError('');
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const closeForm = () => {
        setIsExpanded(false);
        setToken('');
        setError('');
    };

    const handleConnect = async () => {
        const trimmedToken = token.trim();
        if (!trimmedToken) {
            setError('Please enter your API token.');
            return;
        }
        setIsConnecting(true);
        setError('');

        try {
            const api = generateDerivApiInstance();

            const { authorize, error: authError } = (await api.authorize(trimmedToken)) as {
                authorize: {
                    loginid: string;
                    balance: number;
                    currency: string;
                    account_list: Array<{ loginid: string; currency: string; is_virtual: number }>;
                };
                error: { message?: string; code?: string } | undefined;
            };

            api.disconnect();

            if (authError) {
                setError(authError.message ?? 'Invalid token. Please check and try again.');
                setIsConnecting(false);
                return;
            }

            const loginid = authorize.loginid;

            const accountsList: Record<string, string> = {};
            const clientAccounts: Record<string, { loginid: string; token: string; currency: string }> = {};

            authorize.account_list?.forEach(account => {
                accountsList[account.loginid] = trimmedToken;
                clientAccounts[account.loginid] = {
                    loginid: account.loginid,
                    token: trimmedToken,
                    currency: account.currency,
                };
            });

            if (!accountsList[loginid]) {
                accountsList[loginid] = trimmedToken;
                clientAccounts[loginid] = {
                    loginid,
                    token: trimmedToken,
                    currency: authorize.currency,
                };
            }

            localStorage.setItem('authToken', trimmedToken);
            localStorage.setItem('active_loginid', loginid);
            localStorage.setItem('accountsList', JSON.stringify(accountsList));
            localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));

            await api_base.init(true);

            closeForm();
        } catch (e: unknown) {
            const err = e as { message?: string };
            setError(err.message ?? 'Connection failed. Please try again.');
        } finally {
            setIsConnecting(false);
        }
    };

    return (
        <div className='api-token-connector'>
            {!isExpanded ? (
                <div className='api-token-connector__actions'>
                    <button
                        className='api-token-connector__btn'
                        onClick={() => login()}
                        disabled={isLoggingIn}
                        title='Log in with your Deriv account'
                    >
                        {isLoggingIn ? 'Logging in…' : 'Log in'}
                    </button>
                    <button
                        className='api-token-connector__api-token-btn'
                        onClick={openForm}
                        title='Connect with API token'
                    >
                        API Token
                    </button>
                </div>
            ) : (
                <div className='api-token-connector__form'>
                    <div className='api-token-connector__input-row'>
                        <input
                            ref={inputRef}
                            className='api-token-connector__input'
                            type='password'
                            placeholder='Paste your API token here'
                            value={token}
                            onChange={e => setToken(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleConnect();
                                if (e.key === 'Escape') closeForm();
                            }}
                        />
                        <button
                            className='api-token-connector__submit'
                            onClick={handleConnect}
                            disabled={isConnecting}
                        >
                            {isConnecting ? 'Connecting…' : 'Connect'}
                        </button>
                        <button className='api-token-connector__cancel' onClick={closeForm}>
                            Cancel
                        </button>
                    </div>
                    {error && <span className='api-token-connector__error'>{error}</span>}
                </div>
            )}
        </div>
    );
};

export default ApiTokenConnector;
