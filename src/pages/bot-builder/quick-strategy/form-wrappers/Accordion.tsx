import React from 'react';
import classNames from 'classnames';

type TAccordionProps = {
    content_data: {
        header: string;
        content: React.ReactNode;
    };
    expanded?: boolean;
    is_cursive?: boolean;
    no_collapsible?: boolean;
    has_subtitle?: boolean;
    expanded_subtitles_storage?: { [key: string]: boolean };
    setExpandedSubtitlesStorage?: (value: { [key: string]: boolean }) => void;
    font_size?: string;
};

const Accordion = ({ 
    content_data, 
    expanded, 
    expanded_subtitles_storage, 
    setExpandedSubtitlesStorage 
}: TAccordionProps) => {
    const [is_expanded, setIsExpanded] = React.useState(expanded);

    const toggle = () => {
        const next = !is_expanded;
        setIsExpanded(next);
        if (setExpandedSubtitlesStorage && expanded_subtitles_storage) {
            setExpandedSubtitlesStorage({
                ...expanded_subtitles_storage,
                [content_data.header]: next
            });
        }
    };

    return (
        <div className={classNames('bot-accordion', { 'bot-accordion--expanded': is_expanded })}>
            <div className='bot-accordion__header' onClick={toggle}>
                {content_data.header}
            </div>
            {is_expanded && (
                <div className='bot-accordion__content'>
                    {content_data.content}
                </div>
            )}
        </div>
    );
};

export default Accordion;
