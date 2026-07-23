import { ComponentProps } from 'react';

type TToggleButton = {
    onClick: ComponentProps<'button'>['onClick'];
};

const ToggleButton = ({ onClick }: TToggleButton) => (
    <button onClick={onClick} className="flex items-center gap-2 px-1">
        <img src="/logo.png" alt="OTIVO AI" className="w-8 h-8 object-contain" />
        <span className="text-white font-black text-lg tracking-tighter">OTIVO AI</span>
    </button>
);

export default ToggleButton;
