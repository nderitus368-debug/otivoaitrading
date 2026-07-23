const GEMINI_API_KEY = "AIzaSyCnZ71r6bWYmVDvxQuEhcDsVe8hjm4PpSI";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

export const generateBotXML = async (prompt: string): Promise<string | null> => {
    try {
        const systemInstruction = `
You are an expert Deriv Bot builder AI.
The user will describe a trading strategy in natural language.
You MUST output ONLY a valid Blockly XML structure for a Deriv DBot implementing this logic.
Do not output ANY explanations. Do not use markdown like \`\`\`xml or \`\`\`.
Your response MUST start exactly with <xml xmlns="http://www.w3.org/1999/xhtml" collection="false" is_dbot="true"> and end with </xml>.

A standard Deriv DBot XML has 4 mandatory top-level blocks:
1. "trade_definition" block (Trade parameters)
2. "before_purchase" block (Purchase conditions)
3. "after_purchase" block (Sell conditions)
4. "during_purchase" block (Restart trading conditions)

Example minimal valid structure:
<xml xmlns="http://www.w3.org/1999/xhtml" collection="false" is_dbot="true">
  <block type="trade_definition" id="trade_1" x="0" y="0">
    <statement name="TRADE_OPTIONS">
      <block type="trade_definition_market" deletable="false" movable="false">
        <field name="MARKET_LIST">synthetic_index</field>
        <field name="SUBMARKET_LIST">random_index</field>
        <field name="SYMBOL_LIST">R_100</field>
        <next>
          <block type="trade_definition_tradetype" deletable="false" movable="false">
            <field name="TRADETYPECAT_LIST">callput</field>
            <field name="TRADETYPE_LIST">callput</field>
            <next>
              <block type="trade_definition_contracttype" deletable="false" movable="false">
                <field name="TYPE_LIST">both</field>
                <next>
                  <block type="trade_definition_candleinterval" deletable="false" movable="false">
                    <field name="CANDLEINTERVAL_LIST">60</field>
                    <next>
                      <block type="trade_definition_restartbuysell" deletable="false" movable="false">
                        <field name="TIME_MACHINE_ENABLED">FALSE</field>
                        <next>
                          <block type="trade_definition_restartonerror" deletable="false" movable="false">
                            <field name="RESTARTONERROR">TRUE</field>
                          </block>
                        </next>
                      </block>
                    </next>
                  </block>
                </next>
              </block>
            </next>
          </block>
        </next>
      </block>
    </statement>
    <statement name="SUBMARKET">
      <block type="trade_definition_tradeoptions">
        <mutation has_first_barrier="false" has_second_barrier="false" has_prediction="false"></mutation>
        <field name="DURATIONTYPE_LIST">t</field>
        <field name="CURRENCY_LIST">USD</field>
        <value name="DURATION"><shadow type="math_number_positive"><field name="NUM">1</field></shadow></value>
        <value name="AMOUNT"><shadow type="math_number_positive"><field name="NUM">1</field></shadow></value>
      </block>
    </statement>
  </block>
  <block type="before_purchase" id="before_purchase_1">
    <statement name="BEFOREPURCHASE_STACK">
      <block type="purchase" id="purchase_1"><field name="PURCHASE_LIST">CALL</field></block>
    </statement>
  </block>
  <block type="during_purchase" id="during_purchase_1">
    <statement name="DURING_PURCHASE_STACK">
      <block type="controls_if"><value name="IF0"><block type="check_sell"></block></value></block>
    </statement>
  </block>
  <block type="after_purchase" id="after_purchase_1">
    <statement name="AFTERPURCHASE_STACK">
      <block type="trade_again" id="trade_again_1"></block>
    </statement>
  </block>
</xml>

Output the absolute closest bot based on the user's description. If the description is vague, guess standard parameters (e.g. Volatility 10, Rise/Fall, Stake 1, 1 Tick). 
CRITICAL RULES:
1. Output ONLY the <xml>...</xml> string.
2. DO NOT include ANY XML comments (<!-- -->) or text outside the tags.
3. Ensure the XML is perfectly well-formed and valid Blockly XML. Escape any ampersands (&amp;) or brackets if they appear inside field values.
        `;

        const response = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `${systemInstruction}\nUser Strategy: ${prompt}`
                    }]
                }]
            })
        });

        if (!response.ok) {
            console.error('Gemini API Error:', await response.text());
            return null;
        }

        const data = await response.json();
        
        let xmlOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        // Clean up markdown if AI includes it
        if (xmlOutput.startsWith('\`\`\`xml')) {
            xmlOutput = xmlOutput.replace(/\`\`\`xml\n/, '').replace(/\n\`\`\`$/, '');
        } else if (xmlOutput.startsWith('\`\`\`')) {
            xmlOutput = xmlOutput.replace(/\`\`\`\n/, '').replace(/\n\`\`\`$/, '');
        }

        // Robust extraction: Find the first <xml> and last </xml>
        const startIndex = xmlOutput.indexOf('<xml');
        const endIndex = xmlOutput.lastIndexOf('</xml>');

        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            xmlOutput = xmlOutput.substring(startIndex, endIndex + 6);
        }

        return xmlOutput.trim();

    } catch (error) {
        console.error('Failed to generate bot from Gemini:', error);
        return null;
    }
};
