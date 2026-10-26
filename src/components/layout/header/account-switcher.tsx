import React, { useEffect } from 'react';
import { lazy, Suspense, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { CurrencyIcon } from '@/components/currency/currency-icon';
import { addComma, getDecimalPlaces } from '@/components/shared';
import Popover from '@/components/shared_ui/popover';
import { api_base } from '@/external/bot-skeleton';
import { setAuthData } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { fetchAccounts, getOAuthAccessToken, useOauth2 } from '@/hooks/auth/useOauth2';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { isAccountDemo, parseAccountDetails } from '@/utils/auth-utils';
import { waitForDomElement } from '@/utils/dom-observer';
import { Analytics } from '@deriv-com/analytics';
import { localize } from '@deriv-com/translations';
import { AccountSwitcher as UIAccountSwitcher, Loader, useDevice } from '@deriv-com/ui';
import DemoAccounts from './common/demo-accounts';
import RealAccounts from './common/real-accounts';
import { TAccountSwitcher, TAccountSwitcherProps, TModifiedAccount } from './common/types';
import { LOW_RISK_COUNTRIES } from './utils';
import './account-switcher.scss';

const AccountInfoWallets = lazy(() => import('./wallets/account-info-wallets'));

const tabs_labels = {
    demo: localize('Demo'),
    real: localize('Real'),
};

const RenderAccountItems = ({
    isVirtual,
    modifiedCRAccountList,
    modifiedMFAccountList,
    modifiedVRTCRAccountList,
    switchAccount,
    activeLoginId,
    client,
}: TAccountSwitcherProps) => {
    const { oAuthLogout } = useOauth2({ handleLogout: async () => client.logout(), client });
    const is_low_risk_country = LOW_RISK_COUNTRIES().includes(client.account_settings?.country_code ?? '');
    const is_virtual = !!isVirtual;
    const residence = client.residence;

    useEffect(() => {
        const parent_container = document.getElementsByClassName('account-switcher-panel')?.[0] as HTMLDivElement;
        if (!isVirtual && parent_container) {
            parent_container.style.maxHeight = '70vh';
            waitForDomElement('.deriv-accordion__content', parent_container)?.then((accordionElement: unknown) => {
                const element = accordionElement as HTMLDivElement;
                if (element) {
                    element.style.maxHeight = '70vh';
                }
            });
        }
    }, [isVirtual]);

    if (is_virtual) {
        return (
            <>
                <DemoAccounts
                    modifiedVRTCRAccountList={modifiedVRTCRAccountList as TModifiedAccount[]}
                    switchAccount={switchAccount}
                    activeLoginId={activeLoginId}
                    isVirtual={is_virtual}
                    tabs_labels={tabs_labels}
                    oAuthLogout={oAuthLogout}
                    is_logging_out={client.is_logging_out}
                />
            </>
        );
    } else {
        return (
            <RealAccounts
                modifiedCRAccountList={modifiedCRAccountList as TModifiedAccount[]}
                modifiedMFAccountList={modifiedMFAccountList as TModifiedAccount[]}
                switchAccount={switchAccount}
                isVirtual={is_virtual}
                tabs_labels={tabs_labels}
                is_low_risk_country={is_low_risk_country}
                oAuthLogout={oAuthLogout}
                loginid={activeLoginId}
                is_logging_out={client.is_logging_out}
                upgradeable_landing_companies={client?.landing_companies?.all_company ?? null}
                residence={residence}
            />
        );
    }
};

const AccountSwitcher = observer(({ activeAccount }: TAccountSwitcher) => {
    const { isDesktop } = useDevice();
    const { accountList } = useApiBase();
    const { ui, run_panel, client } = useStore();
    const { accounts } = client;
    const { toggleAccountsDialog, is_accounts_switcher_on, account_switcher_disabled_message } = ui;
    const { is_stop_button_visible } = run_panel;
    const has_wallet = Object.keys(accounts).some(id => accounts[id].account_category === 'wallet');

    const modifiedAccountList = useMemo(() => {
        return accountList?.map(account => {
            const isVirtual = isAccountDemo(account);
            const currentAccBal =
                client.all_accounts_balance?.accounts?.[account?.loginid]?.balance ??
                (typeof (account as any).balance === 'number'
                    ? (account as any).balance
                    : parseFloat((account as any).balance || '0'));
            return {
                ...account,
                is_virtual: isVirtual ? 1 : 0,
                isVirtual,
                account_type: isVirtual ? 'demo' : 'real',
                balance: addComma((currentAccBal ?? 0).toFixed(getDecimalPlaces(account.currency))),
                currencyLabel: isVirtual
                    ? tabs_labels.demo
                    : (client.website_status?.currencies_config?.[account?.currency]?.name ?? account?.currency),
                icon: (
                    <CurrencyIcon
                        currency={account?.currency?.toLowerCase()}
                        isVirtual={isVirtual}
                    />
                ),
                isActive: account?.loginid === activeAccount?.loginid,
            };
        });
    }, [
        accountList,
        client.all_accounts_balance?.accounts,
        client.website_status?.currencies_config,
        activeAccount?.loginid,
    ]);

    const modifiedCRAccountList = useMemo(() => {
        return (
            modifiedAccountList?.filter(
                account => !isAccountDemo(account) && (account?.loginid?.includes('CR') || account?.loginid?.startsWith('ROT') || !account?.loginid?.includes('MF'))
            ) ?? []
        );
    }, [modifiedAccountList]);

    const modifiedMFAccountList = useMemo(() => {
        return (
            modifiedAccountList?.filter(
                account => !isAccountDemo(account) && account?.loginid?.includes('MF')
            ) ?? []
        );
    }, [modifiedAccountList]);

    const modifiedVRTCRAccountList = useMemo(() => {
        return (
            modifiedAccountList?.filter(isAccountDemo) ?? []
        );
    }, [modifiedAccountList]);

    const switchAccount = async (loginId: string | number) => {
        const targetLoginId = String(loginId);
        if (targetLoginId === activeAccount?.loginid) return;

        api_base.unsubscribeAllSubscriptions();

        const selected_account =
            accountList?.find(acc => acc.loginid === targetLoginId) ||
            modifiedAccountList?.find(acc => acc.loginid === targetLoginId);

        const isVirtual = isAccountDemo(selected_account);
        const accountType = isVirtual ? 'demo' : 'real';
        const targetCurrency = selected_account?.currency || 'USD';

        localStorage.setItem('active_loginid', targetLoginId);
        localStorage.setItem('active_account_type', accountType);

        const account_list = JSON.parse(localStorage.getItem('accountsList') ?? '{}');
        const token = account_list[targetLoginId] || localStorage.getItem('authToken');
        if (token) {
            localStorage.setItem('authToken', token);
        }

        const rawTargetBal = (selected_account as any)?.balance;
        const targetBalance =
            typeof rawTargetBal === 'number'
                ? rawTargetBal
                : parseFloat(String(rawTargetBal || '0'));

        try {
            const savedDetails: any[] = JSON.parse(localStorage.getItem('client_account_details') || '[]');
            const updated = savedDetails.map((acc: any) =>
                acc.loginid === targetLoginId
                    ? { ...acc, balance: targetBalance, currency: targetCurrency, is_virtual: isVirtual ? 1 : 0, account_type: accountType }
                    : acc
            );
            localStorage.setItem('client_account_details', JSON.stringify(updated));
        } catch {
            // ignore
        }

        setAuthData({
            loginid: targetLoginId,
            currency: targetCurrency,
            balance: targetBalance,
            is_virtual: isVirtual ? 1 : 0,
            account_list: accountList,
        } as any);

        client.setLoginId(targetLoginId);
        client.setCurrency(targetCurrency);
        client.setBalance((targetBalance ?? 0).toFixed(getDecimalPlaces(targetCurrency)));

        const existingAllBalance = client.all_accounts_balance;
        client.setAllAccountsBalance({
            ...(existingAllBalance ?? {}),
            balance: targetBalance,
            loginid: targetLoginId,
            accounts: {
                ...(existingAllBalance?.accounts ?? {}),
                [targetLoginId]: {
                    ...(existingAllBalance?.accounts?.[targetLoginId] ?? {}),
                    balance: targetBalance,
                    converted_amount: targetBalance,
                    currency: targetCurrency,
                    demo_account: isVirtual ? 1 : 0,
                    type: 'deriv',
                },
            },
        } as any);

        const isOAuth = Boolean(getOAuthAccessToken());
        if (isOAuth) {
            const oauthToken = getOAuthAccessToken();
            if (oauthToken) {
                fetchAccounts(oauthToken).then(async (freshAccounts: any[]) => {
                    if (!Array.isArray(freshAccounts)) return;
                    if (localStorage.getItem('active_loginid') !== targetLoginId) return;

                    const freshParsed = freshAccounts.map(parseAccountDetails);
                    const matched = freshParsed.find((a: any) => a.loginid === targetLoginId);
                    if (matched) {
                        localStorage.setItem('client_account_details', JSON.stringify(freshParsed));
                        setAccountList(freshParsed as any);
                        setAuthData({
                            loginid: matched.loginid,
                            currency: matched.currency,
                            balance: matched.balance,
                            is_virtual: matched.is_virtual,
                            account_list: freshParsed,
                        } as any);
                        client.setBalance(matched.balance.toFixed(getDecimalPlaces(matched.currency)));
                        client.setCurrency(matched.currency);
                    }
                }).catch(err => {
                    console.warn('[AccountSwitcher] Failed to refresh account balance:', err);
                });
            }
        }

        await api_base?.init(true);

        try {
            const ApiHelpers = (await import('@/external/bot-skeleton')).ApiHelpers;
            ApiHelpers?.instance?.contracts_for?.disposeCache?.();
            if (ApiHelpers?.instance?.active_symbols) {
                await ApiHelpers.instance.active_symbols.retrieveActiveSymbols(true);
            }
        } catch {
            // Non-critical if workspace not mounted yet
        }

        const account_type = targetLoginId.match(/[a-zA-Z]+/g)?.join('') || '';
        Analytics.setAttributes({ account_type });

        const search_params = new URLSearchParams(window.location.search);
        const account_param = isVirtual ? 'demo' : targetCurrency;
        search_params.set('account', account_param);
        sessionStorage.setItem('query_param_currency', account_param);
        window.history.pushState({}, '', `${window.location.pathname}?${search_params.toString()}`);
    };

    return (
        activeAccount &&
        (has_wallet ? (
            <Suspense fallback={<Loader />}>
                <AccountInfoWallets is_dialog_on={is_accounts_switcher_on} toggleDialog={toggleAccountsDialog} />
            </Suspense>
        ) : (
            <Popover
                className='run-panel__info'
                classNameBubble='run-panel__info--bubble'
                alignment='bottom'
                message={account_switcher_disabled_message}
                zIndex='5'
            >
                <UIAccountSwitcher
                    activeAccount={activeAccount}
                    isDisabled={is_stop_button_visible}
                    tabsLabels={tabs_labels}
                    modalContentStyle={{
                        content: {
                            top: isDesktop ? '30%' : '50%',
                            borderRadius: '10px',
                        },
                    }}
                >
                    <UIAccountSwitcher.Tab title={tabs_labels.real}>
                        <RenderAccountItems
                            modifiedCRAccountList={modifiedCRAccountList as TModifiedAccount[]}
                            modifiedMFAccountList={modifiedMFAccountList as TModifiedAccount[]}
                            switchAccount={switchAccount}
                            activeLoginId={activeAccount?.loginid}
                            client={client}
                        />
                    </UIAccountSwitcher.Tab>
                    <UIAccountSwitcher.Tab title={tabs_labels.demo}>
                        <RenderAccountItems
                            modifiedVRTCRAccountList={modifiedVRTCRAccountList as TModifiedAccount[]}
                            switchAccount={switchAccount}
                            isVirtual
                            activeLoginId={activeAccount?.loginid}
                            client={client}
                        />
                    </UIAccountSwitcher.Tab>
                </UIAccountSwitcher>
            </Popover>
        ))
    );
});

export default AccountSwitcher;
