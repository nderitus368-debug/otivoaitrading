import React from 'react';
import classNames from 'classnames';
import { standalone_routes } from '@/components/shared';
import Button from '@/components/shared_ui/button';
import { useFirebaseCountriesConfig } from '@/hooks/firebase/useFirebaseCountriesConfig';
import useStoreWalletAccountsList from '@/hooks/useStoreWalletAccountsList';
import { getWalletUrl, handleTraderHubRedirect } from '@/utils/traders-hub-redirect';
import { LogOut } from 'lucide-react';
import { Localize, localize } from '@deriv-com/translations';
import { AccountSwitcher as UIAccountSwitcher } from '@deriv-com/ui';

type TAccountSwitcherFooter = {
    oAuthLogout: () => void;
    loginid?: string;
    is_logging_out?: boolean;
    residence?: string;
    type?: 'demo' | 'real';
};
import { AccountSwitcherDivider } from './utils';

const AccountSwitcherFooter = ({ loginid, residence, type, oAuthLogout, is_logging_out }: TAccountSwitcherFooter) => {
    const accountList = JSON.parse(localStorage.getItem('clientAccounts') || '{}');
    const account_currency = loginid ? accountList[loginid]?.currency : '';
    // Hide manage button for demo accounts (virtual accounts)
    const show_manage_button = loginid?.includes('CR') || loginid?.includes('MF');
    const { has_wallet = false } = useStoreWalletAccountsList() || {};
    const { hubEnabledCountryList } = useFirebaseCountriesConfig();

    // Check if the account is a demo account from both loginid and URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const account_param = urlParams.get('account');
    const is_virtual = loginid?.startsWith('VRTC') || account_param === 'demo' || false;

    // Get the redirect URL from handleTraderHubRedirect
    const redirectParams = {
        product_type: 'cfds' as const,
        has_wallet,
        is_virtual,
        residence,
        hubEnabledCountryList,
    };
    const redirect_url_str = handleTraderHubRedirect(redirectParams) || standalone_routes.traders_hub;

    // Add the account parameter to the URL
    let final_url_str = redirect_url_str;
    try {
        const redirect_url = new URL(redirect_url_str);
        if (is_virtual) {
            // For demo accounts, set the account parameter to 'demo'
            redirect_url.searchParams.set('account', 'demo');
        } else if (account_currency) {
            // For real accounts, set the account parameter to the currency
            redirect_url.searchParams.set('account', account_currency);
        }
        final_url_str = redirect_url.toString();
    } catch (error) {
        console.error('Error parsing redirect URL:', error);
    }

    const is_virtual_tab = type === 'demo';

    return (
        <div className=''>
            <UIAccountSwitcher.TradersHubLink href={final_url_str}>
                {localize(`Looking for CFD accounts? Go to Trader's Hub`)}
            </UIAccountSwitcher.TradersHubLink>
            <AccountSwitcherDivider />
            <div
                className={classNames('account-switcher-footer__actions', {
                    'account-switcher-footer__actions--hide-manage-button': (!show_manage_button || is_virtual_tab),
                })}
                style={{ display: 'flex', justifyContent: (!show_manage_button || is_virtual_tab) ? 'flex-end' : 'space-between', alignItems: 'center', width: '100%' }}
            >
                {!is_virtual_tab && show_manage_button && (
                    <Button
                        id='manage-button'
                        className='manage-button'
                        onClick={() => {
                            if (has_wallet) {
                                const wallet_url = getWalletUrl();
                                location.replace(wallet_url);
                            } else {
                                location.replace(final_url_str);
                            }
                        }}
                    >
                        <Localize i18n_default_text='Manage accounts' />
                    </Button>
                )}
                <Button
                    id='dt_logout_button'
                    className='logout-button'
                    color='secondary'
                    onClick={oAuthLogout}
                    disabled={is_logging_out}
                    style={{ padding: '8px 12px', minWidth: 'unset', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title={localize('Log out')}
                >
                    <LogOut size={18} />
                </Button>
            </div>
        </div>
    );
};

export default AccountSwitcherFooter;
