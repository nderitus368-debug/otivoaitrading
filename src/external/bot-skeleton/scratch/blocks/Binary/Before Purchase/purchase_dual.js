import { localize } from '@deriv-com/translations';
import { config } from '../../../../constants/config';
import { excludeOptionFromContextMenu, modifyContextMenu } from '../../../utils';

window.Blockly.Blocks.purchase_dual = {
    init() {
        this.jsonInit(this.definition());

        // Ensure one of this type per statement-stack
        this.setNextStatement(false);
    },
    definition() {
        return {
            message0: localize('Purchase Dual {{ contract_type1 }} and {{ contract_type2 }}', { 
                contract_type1: '%1',
                contract_type2: '%2'
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'PURCHASE_LIST_1',
                    options: [
                        [localize('Rise'), 'CALL'],
                        [localize('Fall'), 'PUT'],
                        [localize('Matches'), 'DIGITMATCH'],
                        [localize('Differs'), 'DIGITDIFF'],
                        [localize('Over'), 'DIGITOVER'],
                        [localize('Under'), 'DIGITUNDER'],
                        [localize('Even'), 'DIGITEVEN'],
                        [localize('Odd'), 'DIGITODD'],
                    ],
                },
                {
                    type: 'field_dropdown',
                    name: 'PURCHASE_LIST_2',
                    options: [
                        [localize('Rise'), 'CALL'],
                        [localize('Fall'), 'PUT'],
                        [localize('Matches'), 'DIGITMATCH'],
                        [localize('Differs'), 'DIGITDIFF'],
                        [localize('Over'), 'DIGITOVER'],
                        [localize('Under'), 'DIGITUNDER'],
                        [localize('Even'), 'DIGITEVEN'],
                        [localize('Odd'), 'DIGITODD'],
                    ],
                },
            ],
            previousStatement: null,
            colour: window.Blockly.Colours.Special1.colour,
            colourSecondary: window.Blockly.Colours.Special1.colourSecondary,
            colourTertiary: window.Blockly.Colours.Special1.colourTertiary,
            tooltip: localize('This block purchases two contracts of specified types simultaneously.'),
            category: window.Blockly.Categories.Before_Purchase,
        };
    },
    meta() {
        return {
            display_name: localize('Purchase Dual'),
            description: localize(
                'Use this block to purchase two contracts at the same time. This block can only be used within the Purchase conditions block.'
            ),
            key_words: localize('buy dual'),
        };
    },
    onchange(event) {
        if (!this.workspace || window.Blockly.derivWorkspace.isFlyoutVisible || this.workspace.isDragging()) {
            return;
        }

        if (event.type === window.Blockly.Events.BLOCK_CREATE && event.ids.includes(this.id)) {
            this.populatePurchaseList(event);
        } else if (event.type === window.Blockly.Events.BLOCK_CHANGE) {
            if (event.name === 'TYPE_LIST' || event.name === 'TRADETYPE_LIST') {
                this.populatePurchaseList(event);
            }
        } else if (event.type === window.Blockly.Events.BLOCK_DRAG && !event.isStart && event.blockId === this.id) {
            ['PURCHASE_LIST_1', 'PURCHASE_LIST_2'].forEach(fieldName => {
                const purchase_type_list = this.getField(fieldName);
                const purchase_options = purchase_type_list.menuGenerator_; // eslint-disable-line

                if (purchase_options[0][0] === '') {
                    this.populatePurchaseList(event);
                }
            });
        }
    },
    populatePurchaseList(event) {
        const opposites = config().opposites;
        const all_options = [];
        
        Object.keys(opposites).forEach(key => {
            const group = opposites[key];
            group.forEach(option => {
                const internal_value = Object.keys(option)[0];
                const human_readable = option[internal_value];
                if (!all_options.find(o => o[1] === internal_value)) {
                    all_options.push([human_readable, internal_value]);
                }
            });
        });

        if (all_options.length > 0) {
            ['PURCHASE_LIST_1', 'PURCHASE_LIST_2'].forEach(field_name => {
                const purchase_type_list = this.getField(field_name);
                const purchase_type = purchase_type_list.getValue();
                purchase_type_list.updateOptions(all_options, {
                    default_value: purchase_type,
                    event_group: event?.group,
                    should_pretend_empty: true,
                });
            });
        }
    },
    customContextMenu(menu) {
        const menu_items = [localize('Enable Block'), localize('Disable Block')];
        excludeOptionFromContextMenu(menu, menu_items);
        modifyContextMenu(menu);
    },
    restricted_parents: ['before_purchase'],
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.purchase_dual = block => {
    const type1 = block.getFieldValue('PURCHASE_LIST_1');
    const type2 = block.getFieldValue('PURCHASE_LIST_2');

    const code = `Bot.purchaseDual('${type1}', '${type2}');\n`;
    return code;
};
