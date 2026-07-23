import { localize } from '@deriv-com/translations';

window.Blockly.Blocks.set_prediction_dual = {
    init() {
        this.jsonInit(this.definition());
        this.setNextStatement(true);
        this.setPreviousStatement(true);
    },
    definition() {
        return {
            message0: localize('Set Prediction 1: %1'),
            message1: localize('Prediction 2 (Dual): %1'),
            args0: [
                {
                    type: 'input_value',
                    name: 'PREDICTION1',
                    check: 'Number',
                },
            ],
            args1: [
                {
                    type: 'input_value',
                    name: 'PREDICTION2',
                    check: 'Number',
                },
            ],
            colour: window.Blockly.Colours.Special1.colour,
            colourSecondary: window.Blockly.Colours.Special1.colourSecondary,
            colourTertiary: window.Blockly.Colours.Special1.colourTertiary,
            tooltip: localize('Set two different predictions for dual trades (e.g. for Over/Under or Matches/Differs).'),
            category: window.Blockly.Categories.Trade_Definition,
        };
    },
    meta() {
        return {
            display_name: localize('Set Dual Predictions'),
            description: localize('Set predictions for both sides of a dual trade strategy.'),
        };
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.set_prediction_dual = block => {
    const p1 = window.Blockly.JavaScript.javascriptGenerator.valueToCode(
        block,
        'PREDICTION1',
        window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC
    ) || '0';
    const p2 = window.Blockly.JavaScript.javascriptGenerator.valueToCode(
        block,
        'PREDICTION2',
        window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC
    ) || '0';

    return `Bot.setPredictionDual(${p1}, ${p2});\n`;
};
