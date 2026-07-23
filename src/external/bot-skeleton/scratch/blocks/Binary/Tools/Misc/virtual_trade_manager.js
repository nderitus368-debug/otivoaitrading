import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../../utils';

window.Blockly.Blocks.virtual_trade_manager = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Virtual Trade Manager'),
            message1: localize('Virtual losses threshold: %1'),
            args1: [
                {
                    type: 'field_number',
                    name: 'VIRTUAL_LOSS_THRESHOLD',
                    value: 2,
                    min: 1,
                },
            ],
            message2: localize('Real trades count: %1'),
            args2: [
                {
                    type: 'field_number',
                    name: 'REAL_TRADE_COUNT',
                    value: 1,
                    min: 1,
                },
            ],
            message3: localize('Virtual losses after real loss: %1'),
            args3: [
                {
                    type: 'field_number',
                    name: 'VIRTUAL_LOSS_AFTER_REAL_LOSS',
                    value: 1,
                    min: 0,
                },
            ],
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Manages virtual to real trading transition based on losses.'),
            category: window.Blockly.Categories.Miscellaneous,
            nextStatement: null,
            previousStatement: null,
        };
    },
    meta() {
        return {
            display_name: localize('Virtual Trade Manager'),
            description: localize(
                'This block monitors virtual wins/losses and switches to real trading using a backend API token once the threshold is reached.'
            ),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.virtual_trade_manager = block => {
    const threshold = block.getFieldValue('VIRTUAL_LOSS_THRESHOLD');
    const count = block.getFieldValue('REAL_TRADE_COUNT');
    const after = block.getFieldValue('VIRTUAL_LOSS_AFTER_REAL_LOSS');

    const code = `Bot.initVirtualTradeManager({
        threshold: ${threshold},
        count: ${count},
        after: ${after},
        token: '6dbFYX2vGooSLGg'
    });\n`;
    return code;
};
