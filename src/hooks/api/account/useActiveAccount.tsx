import { useMemo } from 'react';
import { CurrencyIcon } from '@/components/currency/currency-icon';
import { addComma, getDecimalPlaces } from '@/components/shared';
import { useApiBase } from '@/hooks/useApiBase';
import { isAccountDemo } from '@/utils/auth-utils';
import { Balance } from '@deriv/api-types';
import { localize } from '@deriv-com/translations';

/** A custom hook that returns the account object for the current active account. */
const useActiveAccount = ({ allBalanceData }: { allBalanceData: Balance | null }) => {
    const { accountList, activeLoginid } = useApiBase();

    const activeAccount = useMemo(() => {
        if (accountList && accountList.length > 0) {
            const found = accountList.find(account => account.loginid === activeLoginid);
            if (found) return found;
            return accountList[0];
        }
        // Fallback to localStorage if observable hasn't populated yet
        try {
            const saved = JSON.parse(localStorage.getItem('client_account_details') || '[]');
            if (Array.isArray(saved) && saved.length > 0) {
                const savedActiveId = localStorage.getItem('active_loginid') || saved[0]?.loginid;
                return saved.find((acc: any) => acc.loginid === savedActiveId) || saved[0];
            }
        } catch {
            // Ignore
        }
        return undefined;
    }, [activeLoginid, accountList]);

    const currentBalanceData = allBalanceData?.accounts?.[activeAccount?.loginid ?? ''];

    const modifiedAccount = useMemo(() => {
        if (!activeAccount) return undefined;

        const isVirtual = isAccountDemo(activeAccount);
        const currency = currentBalanceData?.currency || activeAccount.currency || 'USD';
        const rawBalance =
            currentBalanceData?.balance ??
            (typeof (activeAccount as any).balance === 'number'
                ? (activeAccount as any).balance
                : parseFloat((activeAccount as any).balance || '0'));
        const formattedBalance = addComma((rawBalance ?? 0).toFixed(getDecimalPlaces(currency)));

        return {
            ...activeAccount,
            balance: formattedBalance,
            currencyLabel: isVirtual ? localize('Demo') : activeAccount.currency,
            icon: (
                <CurrencyIcon
                    currency={activeAccount.currency?.toLowerCase()}
                    isVirtual={isVirtual}
                />
            ),
            isVirtual,
            is_virtual: isVirtual ? 1 : 0,
            account_type: isVirtual ? 'demo' : 'real',
            isActive: activeAccount.loginid === activeLoginid,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeAccount, activeLoginid, allBalanceData, currentBalanceData]);

    return {
        /** User's current active account. */
        data: modifiedAccount,
    };
};

export default useActiveAccount;
