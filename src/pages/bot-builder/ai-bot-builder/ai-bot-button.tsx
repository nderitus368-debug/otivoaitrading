import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Loader2, MessageSquare, Brain, Layout, Code, CheckCircle, ChevronDown, ChevronUp, Square, History, FileCode, ThumbsUp, ThumbsDown, RotateCcw, Eye, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import * as Blockly from 'blockly';
import classNames from 'classnames';
import Markdown from 'react-markdown';
import './ai-bot-builder.scss';

type ThinkingState = 'idle' | 'dreaming' | 'blueprinting' | 'cooking' | 'tasting' | 'completed';

const buildSteps = [
  { id: 'dreaming', label: "Architecting Logic...", icon: Brain },
  { id: 'blueprinting', label: "Mapping XML Blocks...", icon: Layout },
  { id: 'cooking', label: "Assembling Blocks...", icon: Code },
  { id: 'tasting', label: "Validating Schema...", icon: CheckCircle }
];

interface Message {
  role: 'user' | 'ai';
  content: string;
  explanation?: string;
  actionTaken?: string;
}

const AIBotButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingState, setThinkingState] = useState<ThinkingState>('idle');
  const [isLogsOpen, setIsLogsOpen] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isLoading) {
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isLoading]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(idx);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const generateStrategy = async () => {
    const workspace = (window as any).Blockly?.derivWorkspace;
    console.log("Generate strategy called. Prompt:", prompt, "Workspace:", !!workspace);
    if (!prompt.trim() || !workspace) {
      if (!workspace) console.warn("Workspace is not ready yet.");
      return;
    }

    const userMessage = prompt;
    const currentXml = workspace ? Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspace)) : '';
    
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setPrompt('');
    setIsLoading(true);
    setThinkingState('dreaming');
    
    abortControllerRef.current = new AbortController();

    try {
      console.log("Initializing Gemini API...");
      const API_KEYS = [
        (import.meta as any).env?.VITE_GEMINI_API_KEY || (process.env as any).GEMINI_API_KEY,
        (import.meta as any).env?.VITE_GEMINI_API_KEY_2 || (process.env as any).GEMINI_API_KEY_2,
        (import.meta as any).env?.VITE_GEMINI_API_KEY_3 || (process.env as any).GEMINI_API_KEY_3,
      ].filter((key: any) => !!key && key !== "undefined" && key !== "");
      
      if (API_KEYS.length === 0) {
        console.error("Gemini API Key is missing.");
        setMessages(prev => [...prev, { role: 'ai', content: "Error: Gemini API Key is missing. Please ensure it is set in the environment variables." }]);
        setIsLoading(false);
        return;
      }

      let response: { text: string } | null = null;
      let lastError: any = null;
      const systemInstruction = `
        You are an expert Binary/Deriv Bot developer for the Otivo AI project. Your task is to intelligently modify or generate Blockly XML for a trading strategy based on the user's request.
        
        CURRENT WORKSPACE XML:
        ${currentXml}
        
        MODIFICATION GUIDELINES:
        1. Analyze the CURRENT WORKSPACE XML carefully.
        2. If the user wants to "update", "change", "add", or "modify" something, you MUST return the FULL XML of the workspace.
        3. CRITICAL: Preserve all existing blocks, their positions (x, y coordinates), and their connections exactly as they are in the current workspace, UNLESS the user explicitly asked to change them.
        4. If adding new logic (e.g., a new indicator or a new condition), find a logical place to insert it within the existing structure.
        5. Do NOT remove blocks that the user didn't ask to remove.
        6. If the user's request is a complete replacement (e.g., "build a new bot"), you can start from scratch, but otherwise, always build upon the current XML.
        
        THINKING PROCESS:
        Before generating the XML, think through:
        - What is the current strategy doing?
        - What specific part did the user ask to change?
        - How can I apply this change with minimal disruption to the existing blocks?
        - Are there any variables I need to preserve or create?
        
        CRITICAL CONSTRAINTS:
        - For setting trade predictions (especially in "before_purchase"): ALWAYS use the "set_prediction_single" block. Never use variables (like "prediction_val") for this purpose unless specifically asked to store the value for other uses.
        1. Number of Ticks: For "Rise/Fall" (callput) contracts, the DURATION must be between 5 and 10 ticks. Default to 5 if not specified.
        2. Prediction Barrier: The "PREDICTION" input in "trade_definition_tradeoptions" should ONLY be used for "Over/Under" (overunder) and "Matches/Differs" (matchdiff) contract types. For other types, do not include the PREDICTION value input.
        3. Digit Over/Under Ranges: For "Over/Under" (DIGITOVER/DIGITUNDER) purchase types, ensure the PREDICTION is within these valid ranges to avoid broker validation errors:
           - Over (DIGITOVER): Must be between 0 and 8 (Over 8 expects digit 9). NEVER use 9.
           - Under (DIGITUNDER): Must be between 1 and 9 (Under 1 expects digit 0). NEVER use 0.
        4. Block Arrangement: Ensure all blocks are correctly nested. The "trade_definition" is the root.
        
        AVAILABLE BLOCKS:
        - trade_definition: Root block. Inputs: INITIALIZATION (statement), TRADE_OPTIONS (statement), SUBMARKET (statement).
        - trade_definition_market: Fields "MARKET_LIST", "SUBMARKET_LIST", "SYMBOL_LIST".
        - trade_definition_tradetype: Fields "TRADETYPECAT_LIST", "TRADETYPE_LIST".
        - trade_definition_contracttype: Field "TYPE_LIST".
        - trade_definition_candleinterval: Field "CANDLEINTERVAL_LIST".
        - trade_definition_restartbuysell: Field "TIME_MACHINE_ENABLED" (TRUE/FALSE).
        - trade_definition_restartonerror: Field "RESTARTONERROR" (TRUE/FALSE).
        - trade_definition_switch_market: Field "SYMBOL_LIST" (R_10, R_25, R_50, R_75, R_100, 1HZ10V, 1HZ25V, 1HZ50V, 1HZ75V, 1HZ100V, JD10, JD25, JD50, JD75, JD100, RDBULL, RDBEAR).
        - trade_definition_tradeoptions: 
            - Field "DURATIONTYPE_LIST" (t, s, m, h, d). Use 't' for ticks.
            - Field "BARRIER_TYPE" (offset_plus, offset_minus, absolute).
            - Value input "DURATION": Number of ticks/seconds.
            - Value input "AMOUNT": Stake amount.
            - Value input "TAKE_PROFIT": Take profit amount in USD.
            - Value input "STOP_LOSS": Stop loss amount in USD.
            - Value input "PREDICTION": Only for digits/overunder.
            - Value input "BARRIER": Only for higherlower.
        - trade_definition_accumulator:
            - Field "GROWTHRATE_LIST" (0.01, 0.02, 0.03, 0.04, 0.05).
            - Value input "AMOUNT": Stake amount.
            - Value input "TAKE_PROFIT": Take profit amount in USD.
        - trade_definition_multiplier:
            - Field "MULTIPLIERTYPE_LIST" (10, 20, 40, 100, 200).
            - Field "CURRENCY_LIST" (USD).
            - Value input "AMOUNT": Stake amount.
        - accu_tp_limit: Calculates Expected Profit based on a percentage of the current stake. Value input "AMOUNT" (Percentage). Output: Number.
        - multiplier_take_profit: Value input "AMOUNT".
        - multiplier_stop_loss: Value input "AMOUNT".
        - smaa_statement: Field "VARIABLE". Statement input "STATEMENT" (usually a list of ticks).
        - bba_statement: Field "VARIABLE", "BBRESULT_LIST" (Upper, Middle, Lower). Statement input "STATEMENT".
        - emaa_statement: Field "VARIABLE". Statement input "STATEMENT".
        - rsia_statement: Field "VARIABLE". Statement input "STATEMENT".
        - macda_statement: Field "VARIABLE", "MACDFIELDS_LIST" (MACD, Signal, Histogram). Statement input "STATEMENT".
        - std_dev_multiplier_up: Value input "UPMULTIPLIER".
        - std_dev_multiplier_down: Value input "DOWNMULTIPLIER".
        - fast_ema_period: Value input "FAST_EMA_PERIOD".
        - slow_ema_period: Value input "SLOW_EMA_PERIOD".
        - signal_ema_period: Value input "SIGNAL_EMA_PERIOD".
        - stat: Returns a statistical value.
        - stat_list: Returns a list of statistical values.
        - lastDigitList: Returns a list of the last 100 digits.
        - read_ohlc_obj: Field "OHLCFIELD_LIST" (open, high, low, close, epoch). Value input "OHLCOBJ".
        - ohlc_values_in_list: Field "OHLCFIELD_LIST". Value input "OHLCLIST".
        - sell_price: Returns the current sell price.
        - payout: Returns the potential payout.
        - ask_price: Returns the current ask price.
        - notify_telegram: Value inputs "TELEGRAM_ACCESS_TOKEN", "TELEGRAM_CHAT_ID", "TELEGRAM_MESSAGE".
        - epoch: Returns the current epoch time.
        - tick_delay: Value input "DELAY" (number of ticks).
        - totimestamp: Value input "DATETIME" (string). Returns timestamp.
        - todatetime: Value input "TIMESTAMP" (number). Returns datetime string.
        - before_purchase: Root block for purchase logic. Input "BEFOREPURCHASE_STACK" (statement).
        - purchase: Field "PURCHASE_LIST" (RISE, FALL, HIGHER, LOWER, DIGITMATCH, DIGITDIFF, DIGITOVER, DIGITUNDER, RUNHIGH, RUNLOW, ACCU, DIGITEVEN, DIGITODD). Use "DIGITDIFF" for "differ" bots. Use "RUNHIGH" for "Only Ups" and "RUNLOW" for "Only Downs".
        - purchase_dual: Fields "TYPE1", "TYPE2" (RISE, FALL, RUNHIGH, RUNLOW, DIGITEVEN, DIGITODD, DIGITOVER, DIGITUNDER, DIGITMATCH, DIGITDIFF). Use this to purchase two DIFFERENT contracts at the exact same time.
        - after_purchase: Root block for restart logic. Input "AFTERPURCHASE_STACK" (statement).
        - trade_again: Statement block to restart trading.
        - stop_bot: Statement block to stop the bot.
        - notify: Field "NOTIFICATION_TYPE" (success, warn, info, error). Field "NOTIFICATION_SOUND" (silent, announcement). Value input "MESSAGE".
        - text: Field "TEXT".
        - text_join: Statement input "STACK" (text_statement).
        - text_append: Field "VAR". Value input "TEXT".
        - text_length: Value input "VALUE".
        - text_isEmpty: Value input "VALUE".
        - text_indexOf: Field "END" (FIRST, LAST). Value inputs "VALUE", "FIND".
        - text_charAt: Field "WHERE" (FROM_START, FROM_END, FIRST, LAST, RANDOM). Value inputs "VALUE", "AT".
        - text_getSubstring: Field "WHERE1", "WHERE2". Value inputs "STRING", "AT1", "AT2".
        - text_changeCase: Field "CASE" (UPPERCASE, LOWERCASE, TITLECASE). Value input "TEXT".
        - text_trim: Field "MODE" (BOTH, LEFT, RIGHT). Value input "TEXT".
        - math_number: Field "NUM".
        - math_arithmetic: Fields "OP" (ADD, MINUS, MULTIPLY, DIVIDE). Inputs "A", "B".
        - math_trig: Field "OP" (SIN, COS, TAN, ASIN, ACOS, ATAN). Value input "NUM".
        - math_modulo: Value inputs "DIVIDEND", "DIVISOR".
        - math_constrain: Value inputs "VALUE", "LOW", "HIGH".
        - logic_compare: Fields "OP" (EQ, NEQ, LT, LTE, GT, GTE). Inputs "A", "B".
        - logic_operation: Fields "OP" (AND, OR). Inputs "A", "B".
        - controls_if: Statement input "IF0" (logic), "DO0" (statement). Use <mutation else="1"></mutation> inside the block to add an "ELSE" statement input "ELSE".
        - controls_repeat: Field "TIMES" (10, 20, 50, 100). Statement input "DO".
        - controls_repeat_ext: Value input "TIMES". Statement input "DO".
        - contract_check_result: Field "CHECK_RESULT" (win, loss). Output: Boolean.
        - variables_set: Field "VAR". Value input "VALUE".
        - variables_get: Field "VAR". Output: null.
        - digit_signal_pattern: Analyzes the last 4 digits for specific structural patterns (X,X,Y,X or X,Y,X,X) and returns the digit X if found, or -1. Output: Number.
        - digit_pattern: Receives a signal (usually from digit_signal_pattern) and allows selecting that digit for prediction. Value input "SIGNAL". Output: Number.
        - consecutive_digits: Returns the digit that has been consecutive for N times, or -1 if no such digit exists. Field "COUNT" (Number 1-10). Output: Number.
        - set_prediction_single: Sets a single trade prediction value. Value input: "PREDICTION".
        - set_prediction: Sets dual trade prediction values (for simultaneous dual trades). Value inputs: "PREDICTION" (Prediction 1), "PREDICTION2" (Prediction 2).
        - last_digit: Returns the last digit of the current tick. Output: Number.
        - least_digit: Returns the least frequent digit from the last 100 ticks (legacy). Output: Number.
        - least_frequent_digit: Returns the least frequent digit from the last 100 ticks. Output: Number.
        - most_frequent_digit: Returns the most frequent digit from the last 100 ticks. Output: Number.
        - rise_fall_signal: Returns 'RISE', 'FALL', or 'NEUTRAL'. Output: String.
        - even_odd_signal: Returns 'EVEN', 'ODD', or 'NEUTRAL'. Output: String.
        - over_under_signal: Returns 'OVER 4', 'UNDER 5', or 'NEUTRAL'. Output: String.
        - total_profit: Returns the total profit/loss. Output: Number.
        - total_runs: Returns the total number of runs. Output: Number.
        - total_win: Returns the total number of wins. Output: Number.
        - total_loss: Returns the total number of losses. Output: Number.
        - math_on_list: Field "OP" (SUM, MIN, MAX, AVERAGE, MEDIAN, MODE, STD_DEV, RANDOM). Value input "LIST". Output: Number.
        - math_single: Field "OP" (ROOT, ABS, NEG, LN, LOG10, EXP, POW10). Value input "NUM". Output: Number.
        - math_round: Field "OP" (ROUND, ROUNDUP, ROUNDDOWN). Value input "NUM". Output: Number.
        - timeout: Value input "SECONDS". Statement input "STACK" (then do).
        - procedures_defnoreturn: Root block for a function without return. Field "NAME". Input "STACK" (statement).
        - procedures_defreturn: Root block for a function with return. Field "NAME". Input "STACK" (statement). Input "RETURN" (value).
        - procedures_callnoreturn: Statement block to call a function. Field "NAME".
        - procedures_callreturn: Value block to call a function. Field "NAME". Output: null.
        - lists_create_with: STANDALONE Statement block to create a list and assign it to a variable. Use this ON ITS OWN, do NOT wrap it in variables_set.
            - Field "VARIABLE": The name of the variable to set.
            - Statement input "STACK": Chains "lists_statement" blocks.
        - lists_statement: Item block for lists_create_with.
            - Value input "VALUE": The value of the item.
            - Use <next> to chain multiple lists_statement blocks.
        - Example List XML:
          <block type="lists_create_with">
            <field name="VARIABLE">stakeList</field>
            <statement name="STACK">
              <block type="lists_statement">
                <value name="VALUE"><block type="math_number"><field name="NUM">0.35</field></block></value>
                <next>
                  <block type="lists_statement">
                    <value name="VALUE"><block type="math_number"><field name="NUM">0.39</field></block></value>
                  </block>
                </next>
              </block>
            </statement>
          </block>
        - lists_getIndex: Value block to get an item from a list. Field "MODE" (GET, GET_REMOVE, REMOVE). Field "WHERE" (FROM_START, FROM_END, FIRST, LAST, RANDOM). Value input "VALUE" (list). Output: null.
        - lists_setIndex: Statement block to set an item in a list. Field "MODE" (SET, INSERT). Field "WHERE" (FROM_START, FROM_END, FIRST, LAST, RANDOM). Input "LIST" (list). Input "TO" (value).
        - lists_repeat: Value inputs "ITEM", "NUM".
        - lists_isEmpty: Value input "VALUE".
        - lists_indexOf: Field "END" (FIRST, LAST). Value inputs "VALUE", "FIND".
        - lists_getSublist: Field "WHERE1", "WHERE2". Value inputs "LIST", "AT1", "AT2".
        - lists_split: Field "MODE" (SPLIT, JOIN). Value inputs "INPUT", "DELIM".
        - lists_sort: Field "TYPE" (NUMERIC, ALPHABETIC, IGNORE_CASE), "ORDER" (1, -1). Value input "LIST".
        - block_holder: Statement input "STACK".
        - tick_analysis: Root block for tick-by-tick analysis. Input "TICKANALYSIS_STACK" (statement).
        - console: Value input "MESSAGE".
        
        XML STRUCTURE RULES:
        - Use <xml xmlns="https://developers.google.com/blockly/xml"> as the root.
        - ALWAYS include a <variables> tag at the top of the XML if you are using any variables. Example: <variables><variable id="...">myVar</variable></variables>.
        - "trade_definition" should be at x="50", y="50".
        - Inside "SUBMARKET" statement of "trade_definition", chain: market -> tradetype -> contracttype -> candleinterval -> restartbuysell -> restartonerror.
        - Inside "TRADE_OPTIONS" statement of "trade_definition", use (tradeoptions OR trade_definition_accumulator).
        - For "Only Ups/Only Downs" trades:
            1. In "trade_definition_tradetype", set "TRADETYPECAT_LIST" to "runhighlow" and "TRADETYPE_LIST" to "runhighlow".
            2. In "trade_definition_contracttype", set "TYPE_LIST" to "runhigh" (for Only Ups) or "runlow" (for Only Downs).
            3. In "before_purchase", use "purchase" block with "RUNHIGH" or "RUNLOW" type.
        - For Martingale:
            1. Initialize a variable (e.g., "stake") in "INITIALIZATION" of "trade_definition".
            2. Use "variables_get" with the SAME variable name in "AMOUNT" of "trade_definition_tradeoptions" or "trade_definition_accumulator".
            3. In "after_purchase", use "controls_if" with "contract_check_result" to check for a loss.
            4. If loss, multiply the SAME "stake" variable. If win, reset it to initial value.
            5. ALWAYS use the same variable name (e.g., "stake") throughout the strategy.
        - For "Fixed Stake Martingale Bot Recovery Design" (Professional Design):
            1. In "INITIALIZATION", use the STANDALONE "lists_create_with" block (NOT wrapped in set variable) to create a variable named "stake_list" with these VALUES: [0.35, 0.39, 0.84, 1.68, 3.46, 7.14, 14.75, 30.38, 63.2, 130, 280].
            2. In "INITIALIZATION", following the list block, set these variables: "Expected Profit", "Stop Loss", "Loss" (set to 0), "nth_stake" (set to 1).
            3. In "trade_definition_tradeoptions", use "lists_getIndex" with "variables_get" for "stake_list" and "variables_get" for "nth_stake" (WHERE="FROM_START") as the "AMOUNT".
            4. In "after_purchase", handle Result is Win:
               - Use "variables_set" to reset "Loss" to 0.
               - Use "variables_set" to reset "nth_stake" to 1.
            5. In "after_purchase", handle Result is Loss:
               - Increment "Loss" by 1 using "math_arithmetic".
               - Increment "nth_stake" by 1 using "math_arithmetic".
            6. Add a separate "controls_if" for checks:
               - If (total_profit >= "Expected Profit") then notify Success and "stop_bot".
               - Else If (total_profit is Negative AND absolute(total_profit) >= "Stop Loss") then notify Error and "stop_bot".
            7. Ensure "stake_list" is used consistently as the list variable name.
        - For "Martingale after N losses":
            1. In "INITIALIZATION", set "Martingale After" variable (e.g., 2).
            2. In "after_purchase", handle "Result is Loss":
               - Use "controls_if" to check if (consecutive_loss_count >= "Martingale After").
               - If true, apply Martingale multiplier to the "stake".
               - This logic ensures martingale is only applied after a specific number of consecutive losses.
        - For "Handling Stalled Contracts":
            1. The "contract_check_result" block now includes a "Stalled" option.
            2. A result is "Stalled" when the engine cannot retrieve the outcome (e.g., network timeout) and moves to the next trade.
            3. In "after_purchase", you can use IF (Result is Stalled) THEN [Notify or handle stake].
        - For "least digit prediction":
            1. In "before_purchase", use the "set_prediction_single" block with the "least_digit" (or "least_frequent_digit") block as its "PREDICTION" input.
            2. This should happen right before the "purchase" block.
        - For "Accumulator Percentage Strategy" (Professional Design):
            1. In "INITIALIZATION", set variables: "Take Profit", "Stop Loss", "Win Amount", "Initial Amount" (set to Win Amount), "Martingale Multiplier", "Accumulator Rate" (e.g., 5 for 5%), "Limit Order" (if mentioned).
            2. In "before_purchase", use "purchase" block with "ACCU" type.
            3. In "after_purchase", handle Result is Loss (using contract_check_result):
               - Multiply "Initial Amount" by "Martingale Multiplier".
               - If "Initial Amount" > "Stop Loss", reset to "Win Amount".
            4. In "after_purchase", handle Result is Win (using contract_check_result):
               - Reset "Initial Amount" to "Win Amount".
            5. Add Total Profit check: if (total_profit >= "Take Profit") then notify "Target Hit" and STOP.
            6. Add Stop Loss check: if (total_profit < 0 AND absolute(total_profit) >= "Stop Loss") then notify "Stoploss hit" and STOP.
            7. If the user mentions a delay (e.g., "after 7 sec"), wrap the "purchase" block in "before_purchase" with a "timeout" block.
        - For "Volatility Spike Accumulator Strategy" (Professional Design):
            1. This strategy uses the Accumulator trade type, which has a dynamic channel defined by the "Growth Rate".
            2. It identifies high volatility moments (spikes) to trigger trades, betting on subsequent low volatility.
            3. In "INITIALIZATION", set variables: "+-Barrier" (e.g., 0.3), "Tick1", "Tick2".
            4. In "tick_analysis", update "Tick2" to "Tick1", then "Tick1" to the current "tick".
            5. In "before_purchase", calculate the difference: (Tick1 - Tick2).
            6. Trigger purchase of "ACCU" if:
               - (Tick1 - Tick2) >= "+-Barrier" (Upward spike)
               - OR (Tick1 - Tick2) <= -"+-Barrier" (Downward spike)
            7. CRITICAL: Ensure "Tick2" is initialized or checked (e.g., Tick2 > 0) to avoid false triggers on the first tick.
            8. Use "notify" to display the current difference (Tick1 - Tick2) for monitoring.
            9. The "analysis" object in the Run Panel now displays real-time "Upper Barrier" and "Lower Barrier" from the Deriv Trading Engine when an Accumulator contract is active.
        - For "delayed purchase":
            1. In "before_purchase", wrap the "purchase" block inside a "timeout" block to wait for a specific number of seconds before buying.
        - For "Last Digits Sequence Strategy" (Professional Design):
            1. This strategy triggers a trade when the last few digits match a specific sequence (e.g., 1, 2, 3).
            2. To keep the strategy clean (the "thin" design), use the "tick_analysis" block to set variables for the last digits.
            3. In "tick_analysis":
               - Set "L1" to "lists_getIndex" (MODE="GET", WHERE="LAST", list="lastDigitList").
               - Set "L2" to "lists_getIndex" (MODE="GET", WHERE="FROM_END", AT="2", list="lastDigitList").
               - Set "L3" to "lists_getIndex" (MODE="GET", WHERE="FROM_END", AT="3", list="lastDigitList").
            4. In "before_purchase", use a "controls_if" block with "logic_compare" (EQ) and "logic_operation" (AND) using the variables "L1", "L2", "L3".
            5. Example trigger: (L3 == 1 AND L2 == 2 AND L1 == 3).
            6. If the user provides multiple sequences (e.g., "123 or 321"), use "logic_operation" (OR) to combine the sequence checks.
            7. "tick_analysis" should be at x="50", y="400".
        - For "Consecutive Digits Differ Strategy" (Professional Design):
            1. This strategy triggers a "Digit Differ" trade when a digit repeats N times consecutively (e.g., 8, 8, 8).
            2. In "INITIALIZATION", set "Count" variable (e.g., 3).
            3. In "before_purchase", use "variables_set" to set a "signalDigit" variable to the value of "consecutive_digits" block (with COUNT input connected to the "Count" variable or fixed number).
            4. Add "controls_if" to check if "signalDigit" >= 0 (meaning a consecutive sequence was found).
            5. Inside IF:
               - Use "set_prediction_single" block with the "signalDigit" variable as input.
               - Use "purchase" block with "DIGITDIFF" type.
            6. This ensures the bot always trades the exact digit that was consecutive.
        - For "Digit Pattern Strategy" (Professional Design):
            1. This strategy uses the "Digit Signal Pattern" block to detect specific sequences (X,X,Y,X or X,Y,X,X).
            2. In "before_purchase", use "variables_set" to set a "signal" variable to the value of "digit_signal_pattern" block.
            3. Add "controls_if" to check if "signal" >= 0.
            4. Inside IF:
               - Use "set_prediction_single" block. For its "PREDICTION" input, use the "digit_pattern" block with the "signal" variable connected to its "SIGNAL" input.
               - Use "purchase" block with "DIGITDIFF" (or the requested type).
        - For "Higher/Lower" trades:
            1. In "trade_definition_tradetype", set "TRADETYPECAT_LIST" to "higherlower" and "TRADETYPE_LIST" to "higherlower".
            2. In "trade_definition_tradeoptions", use "BARRIER" input and "BARRIER_TYPE" field.
            3. In "before_purchase", use "purchase" block with "HIGHER" or "LOWER" type.
        - For simultaneous Dual Purchases:
            1. Use the "purchase_dual" block instead of "purchase".
            2. This block triggers two separate contracts at the exact same moment.
            3. If specific predictions are needed for each contract (e.g., Over 5 and Under 4), use the "set_prediction" block with both inputs filled. "Prediction 1" applies to "Type 1" and "Prediction 2" applies to "Type 2". If only one prediction is needed for both, you can still use "set_prediction_single".
        - For "Switch Market" logic:
            1. Use the "trade_definition_switch_market" block inside "SUBMARKET" of "trade_definition" or anywhere in the strategy to change the symbol dynamically.
        - For "Analysis-Based Triggering" (Professional Signal Design):
            1. This pattern ensures the bot WAITS for the exact signal from the Analysis Tool before purchasing.
            2. In "before_purchase", use "controls_if" with "logic_compare" (EQ) to match the signal.
            3. Signal Values:
               - rise_fall_signal returns: 'RISE', 'FALL', 'NEUTRAL'.
               - even_odd_signal returns: 'EVEN', 'ODD', 'NEUTRAL'.
               - over_under_signal returns: 'OVER 4', 'UNDER 5', 'NEUTRAL'.
               - most_frequent_digit and least_frequent_digit return numbers (0-9).
            4. Example: To trade "Over 4" ONLY when the analysis gives an "OVER 4" signal:
               - IF (over_under_signal == 'OVER 4') THEN purchase "DIGITOVER".
            5. Example: To trade "Rise" ONLY when the analysis gives a "RISE" signal:
               - IF (rise_fall_signal == 'RISE') THEN purchase "RISE".
            6. ALWAYS use the exact string values (all caps) for comparisons.
            7. The "NEUTRAL" signal means the bot must WAIT and do nothing.
        - ALWAYS include "trade_again" at the end of the "AFTERPURCHASE_STACK" in "after_purchase".
        - ALWAYS include "Expected Profit" and "Stop Loss" variables in the "INITIALIZATION" block of "trade_definition".
        - Connect these variables to the "TAKE_PROFIT" and "STOP_LOSS" inputs of the "trade_definition_tradeoptions" block.
        - In "after_purchase", handle Result is Win (using contract_check_result):
           - If (total_profit >= "Expected Profit") then use "notify" (type: success, sound: win) with message "Profit Achieved!!!" and use "stop_bot".
        - In "after_purchase", handle Result is Loss (using contract_check_result):
           - If (total_profit < 0 AND absolute(total_profit) >= "Stop Loss") then use "notify" (type: error, sound: loss) with message "Stop Loss Reached!!!" and use "stop_bot".
        - "before_purchase" should be at x="50", y="600".
        - "after_purchase" should be at x="550", y="250".
        
        EXAMPLE MARTINGALE XML (in after_purchase):
        <block type="after_purchase">
          <statement name="AFTERPURCHASE_STACK">
            <block type="controls_if">
              <value name="IF0">
                <block type="contract_check_result">
                  <field name="CHECK_RESULT">loss</field>
                </block>
              </value>
              <statement name="DO0">
                <block type="variables_set">
                  <field name="VAR">stake</field>
                  <value name="VALUE">
                    <block type="math_arithmetic">
                      <field name="OP">MULTIPLY</field>
                      <value name="A"><block type="variables_get"><field name="VAR">stake</field></block></value>
                      <value name="B"><block type="math_number"><field name="NUM">2</field></block></value>
                    </block>
                  </value>
                </block>
              </statement>
              <next>
                <block type="controls_if">
                  <value name="IF0">
                    <block type="contract_check_result">
                      <field name="CHECK_RESULT">win</field>
                    </block>
                  </value>
                  <statement name="DO0">
                    <block type="variables_set">
                      <field name="VAR">stake</field>
                      <value name="VALUE"><block type="math_number"><field name="NUM">1</field></block></value>
                    </block>
                  </statement>
                  <next>
                    <block type="trade_again"></block>
                  </next>
                </block>
              </next>
            </block>
          </statement>
        </block>
        
        EXAMPLE ACCUMULATOR XML:
        <block type="trade_definition_accumulator">
          <field name="GROWTH_RATE">0.05</field>
          <value name="AMOUNT"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
          <value name="TAKE_PROFIT"><shadow type="math_number"><field name="NUM">0.1</field></shadow></value>
        </block>
        
        OUTPUT ONLY THE XML FIRST, followed by a brief explanation of the changes you made in markdown format.
        
        Example response format:
        <xml>...</xml>
        
        ### Changes Made:
        - Added a Martingale multiplier...
        - Updated the stake variable...
      `;

      const modelsToTry = ["gemini-3.1-pro-preview", "gemini-3-flash-preview"];

      // Try each model
      for (const modelName of modelsToTry) {
        if (abortControllerRef.current?.signal.aborted) break;

        // Try each API key for the current model
        for (const apiKey of API_KEYS) {
          if (abortControllerRef.current?.signal.aborted) break;
          
          try {
            const ai = new GoogleGenAI({ apiKey });

            const history = messages.map(msg => ({
              role: msg.role === 'ai' ? 'model' : 'user',
              parts: [{ text: msg.content }]
            }));

            const stream = await ai.models.generateContentStream({
              model: modelName,
              contents: [...history, { role: 'user', parts: [{ text: userMessage }] }],
              config: {
                systemInstruction: systemInstruction,
                thinkingConfig: {
                  thinkingLevel: ThinkingLevel.HIGH
                }
              }
            });
            
            let fullText = '';
            let hasStartedThinking = false;
            let hasStartedAnswering = false;

            for await (const chunk of stream) {
              if (abortControllerRef.current?.signal.aborted) break;

              // Check for thought parts
              const thoughtPart = chunk.candidates?.[0]?.content?.parts?.find((p: any) => p.thought);
              if (thoughtPart && !hasStartedThinking) {
                hasStartedThinking = true;
                setThinkingState('blueprinting');
              }

              // Check for text parts
              const textPart = chunk.candidates?.[0]?.content?.parts?.find((p: any) => p.text);
              if (textPart && !hasStartedAnswering) {
                hasStartedAnswering = true;
                setThinkingState('cooking');
              }

              if (chunk.text) {
                fullText += chunk.text;
              }
            }
            
            if (fullText) {
              response = { text: fullText };
              break; 
            }
          } catch (err: any) {
            if (err.name === 'AbortError') {
              console.log("Generation aborted by user.");
              return;
            }
            console.error(`Error with model ${modelName}:`, err);
            lastError = err;
            
            if (err.message?.includes("404") || err.message?.includes("not found")) {
              console.warn(`Model ${modelName} not found. Skipping to next model.`);
              break;
            }
          }
        }
        if (response) break; 
        
        console.log(`Failed all keys for ${modelName}. Trying next fallback model if available...`);
      }

      if (abortControllerRef.current?.signal.aborted) return;

      if (!response) {
        let errorMessage = "All API keys and models failed.";
        if (lastError) {
          try {
            const errJson = typeof lastError.message === 'string' ? JSON.parse(lastError.message.substring(lastError.message.indexOf('{'))) : lastError;
            errorMessage = errJson.error?.message || lastError.message || errorMessage;
          } catch (e) {
            errorMessage = lastError.message || errorMessage;
          }
        }
        
        setMessages(prev => [...prev, { role: 'ai', content: `Error: The AI Assistant is currently unavailable. Details: ${errorMessage}. This is likely due to API quota limits. Please try again in a few minutes or check your API keys in the settings.` }]);
        setIsLoading(false);
        return;
      }

      console.log("Gemini response received:", response);
      setThinkingState('tasting');
      
      await new Promise(resolve => setTimeout(resolve, 1500));

      const rawText = response.text.trim();
      
      // More robust XML extraction
      const startTag = "<xml";
      const endTag = "</xml>";
      const startIndex = rawText.indexOf(startTag);
      const endIndex = rawText.lastIndexOf(endTag);
      
      let xmlText = "";
      if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        xmlText = rawText.substring(startIndex, endIndex + endTag.length);
      }
      
      const explanationText = rawText.replace(xmlText, '').trim();
      
      if (xmlText) {
        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlText, "text/xml");
          
          // Check for parsing errors
          const parseError = xmlDoc.getElementsByTagName("parsererror");
          if (parseError.length > 0) {
            throw new Error(parseError[0].textContent || "Invalid XML format");
          }

          workspace.clear();
          
          // Process variables first to avoid "variable not defined" errors
          const variables = xmlDoc.getElementsByTagName('variables')[0];
          if (variables) {
            Blockly.Xml.domToVariables(variables, workspace);
          }
          
          // Inject the blocks
          const xmlElement = xmlDoc.documentElement;
          Blockly.Xml.domToWorkspace(xmlElement, workspace);
          
          if (typeof (workspace as any).cleanUp === 'function') {
            (workspace as any).cleanUp();
          }
          
          setMessages(prev => [...prev, { 
            role: 'ai', 
            content: "Strategy generated and loaded successfully.",
            explanation: explanationText || "I've architected the complete strategy and loaded it into your workspace.",
            actionTaken: "Architected Complete Bot"
          }]);
          setThinkingState('completed');
        } catch (err: any) {
          console.error("XML Injection Error:", err);
          setMessages(prev => [...prev, { 
            role: 'ai', 
            content: `I generated the strategy, but encountered an error while loading it: ${err.message || "Unknown error"}. Please try again with a simpler prompt.` 
          }]);
        }
      } else {
        setMessages(prev => [...prev, { role: 'ai', content: response.text }]);
        setThinkingState('completed');
      }

    } catch (error) {
      console.error("Gemini Error:", error);
      setMessages(prev => [...prev, { role: 'ai', content: "Sorry, I encountered an error while generating your strategy. Please check your API key or try again later." }]);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setThinkingState('idle');
      setMessages(prev => [...prev, { role: 'ai', content: "Generation stopped by user." }]);
    }
  };

  const isStepCompleted = (stepId: string) => {
    const states: ThinkingState[] = ['dreaming', 'blueprinting', 'cooking', 'tasting', 'completed'];
    const currentIndex = states.indexOf(thinkingState);
    const stepIndex = buildSteps.findIndex(s => s.id === stepId);
    return currentIndex > stepIndex;
  };

  const isStepActive = (stepId: string) => {
    return thinkingState === stepId;
  };

  return (
    <>
      <motion.button
        onClick={() => setIsOpen(true)}
        animate={{ 
          borderColor: ["#ff444f", "#00a79e", "#ffc107", "#ff444f"],
        }}
        transition={{ 
          duration: 4, 
          repeat: Infinity, 
          ease: "linear" 
        }}
        className="otivo-ai-button"
        title="OTIVO AI Assistant"
      >
        <img 
          src="/logo.png" 
          alt="Logo" 
          className="otivo-ai-button-img" 
          referrerPolicy="no-referrer" 
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://api.dicebear.com/7.x/bottts/svg?seed=Otivo';
          }}
        />
        <span className="otivo-ai-tooltip">
          <span className="font-jazz tracking-[0.1em]">OTIVO AI</span> Assistant
        </span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="otivo-ai-modal"
          >
            <div className="otivo-ai-header">
              <div className="header-left">
                <motion.div 
                  animate={{ 
                    borderColor: ["#d4af37", "#4af626", "#d4af37"],
                  }}
                  transition={{ 
                    duration: 4, 
                    repeat: Infinity, 
                    ease: "linear" 
                  }}
                  className="logo-container"
                >
                  <img 
                    src="/logo.png" 
                    alt="Logo" 
                    referrerPolicy="no-referrer" 
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://api.dicebear.com/7.x/bottts/svg?seed=Otivo';
                    }}
                  />
                </motion.div>
                <div className="title">
                  <h3>OTIVO AI</h3>
                  <p>Architect Assistant</p>
                </div>
              </div>
              <div className="header-right">
                  <button 
                    onClick={() => {
                      setMessages([]);
                      setThinkingState('idle');
                    }}
                    className="clear-btn"
                    title="Clear Conversation"
                  >
                    <RotateCcw size={14} />
                    <span>Clear</span>
                  </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="close-btn"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="otivo-ai-status-bar">
              <div 
                className="status-header"
                onClick={() => setIsLogsOpen(!isLogsOpen)}
              >
                <div className={classNames(
                  "spinner",
                  isLoading && "spin"
                )} />
                <span className="status-text">
                  {isLoading ? "Working" : thinkingState === 'completed' ? "Task Completed Successfully" : "OTIVO Architect Ready"}
                </span>
                {isLoading && (
                  <span className="timer-text">
                    Running for {seconds}s
                  </span>
                )}
                <div className="chevron">
                  {isLogsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </div>

              <AnimatePresence>
                {isLogsOpen && (isLoading || thinkingState !== 'idle') && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="status-steps"
                  >
                    <div className="steps-container">
                      {buildSteps.map((step) => {
                        const completed = isStepCompleted(step.id);
                        const active = isStepActive(step.id);
                        return (
                          <div 
                            key={step.id} 
                            className={classNames(
                              "step-item",
                              active ? "active" : "inactive"
                            )}
                          >
                            <span className="step-icon-wrapper">
                              {completed ? (
                                <CheckCircle size={14} className="icon-completed" />
                              ) : (
                                <step.icon size={14} className={active ? "icon-active" : "icon-inactive"} />
                              )}
                            </span>
                            <span>{step.label}</span>
                            {active && (
                              <motion.span 
                                animate={{ opacity: [0, 1, 0] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                                className="dot"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div 
              ref={scrollRef}
              className="otivo-ai-chat-area"
            >
              {messages.length === 0 && (
                <div className="empty-state">
                  <div className="icon-wrapper">
                    <MessageSquare size={40} />
                  </div>
                  <p>
                    Describe your strategy goals to begin the architecture process
                  </p>
                </div>
              )}
              {messages.map((msg, idx) => (
                <div 
                  key={idx}
                  className={classNames("message-row", msg.role === 'user' ? 'user' : 'ai')}
                >
                  <div className="message-bubble">
                    {msg.role === 'user' ? msg.content : (
                      <div className="ai-content">
                        {msg.actionTaken && (
                          <div className="action-card">
                            <div className="card-header">
                              <History size={14} />
                              <span>Action history</span>
                            </div>
                            <div className="card-body">
                              <p>Here are key actions taken for the app:</p>
                              <div className="action-item">
                                <div className="left">
                                  <FileCode size={16} />
                                  <div className="text-col">
                                    <span className="label">Edited Workspace</span>
                                    <span className="value">{msg.actionTaken}</span>
                                  </div>
                                </div>
                                <CheckCircle size={16} className="check-icon" />
                              </div>
                            </div>
                          </div>
                        )}
                        
                        <div className="markdown-body">
                          <Markdown>{msg.explanation || msg.content}</Markdown>
                        </div>

                        {msg.role === 'ai' && msg.actionTaken && (
                          <div className="message-footer">
                            <button className="action-btn">
                              <History size={14} /> Checkpoint
                            </button>
                            <div className="icon-btn-group">
                              <button className="icon-btn">
                                <ThumbsUp size={14} />
                              </button>
                              <button className="icon-btn">
                                <ThumbsDown size={14} />
                              </button>
                            </div>
                            <button className="action-btn primary">
                              <Eye size={14} /> View changes
                            </button>
                            <button className="action-btn">
                              <RotateCcw size={14} /> Restore
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="copy-area">
                      <button onClick={() => copyToClipboard(msg.content, idx)}>
                        {copiedId === idx ? (
                          <span className="copied">
                            <Check size={12} /> Copied
                          </span>
                        ) : (
                          <span>
                            <Copy size={12} /> Copy
                          </span>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="otivo-ai-footer">
              <div className="input-row">
                <div className="input-container">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        generateStrategy();
                      }
                    }}
                    placeholder="Ask OTIVO to build or update a bot..."
                  />
                </div>
                <button
                  onClick={isLoading ? handleStop : generateStrategy}
                  disabled={!isLoading && !prompt.trim()}
                  className={classNames(
                    "send-btn",
                    isLoading ? "danger" : "primary"
                  )}
                >
                  {isLoading ? <Square size={18} fill="currentColor" /> : <Send size={20} />}
                </button>
              </div>
              <div className="footer-text">
                <p className="brand">
                  Architecture Engine| Powered by OTIVO AI
                </p>
                <p className="warning">
                  OTIVO AI can make mistakes. Review the generated blocks carefully.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AIBotButton;
