import React from 'react';
import { useStore } from '@/hooks/useStore';
import './api-token-disconnect.scss';

const ApiTokenDisconnect = () => {
    const { client } = useStore() ?? {};

    const handleDisconnect = () => {
        client?.logout?.();
    };

    return (
        <button className='api-token-disconnect' onClick={handleDisconnect} title='Disconnect API token'>
            Disconnect
        </button>
    );
};

export default ApiTokenDisconnect;
