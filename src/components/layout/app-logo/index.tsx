import { useDevice } from '@deriv-com/ui';
import './app-logo.scss';

export const AppLogo = () => {
    const { isDesktop } = useDevice();

    if (!isDesktop) return null;
    return (
        <div className='app-header__logo app-header__logo--otivo'>
            <img src='/logo.png' alt='OTIVO AI' className='app-header__logo-img' />
            <span className='app-header__logo-text'>OTIVO AI</span>
        </div>
    );
};
