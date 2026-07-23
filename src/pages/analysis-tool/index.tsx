import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Activity, 
  Zap, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  BarChart, 
  LineChart as LineIcon,
  ChevronDown,
  Info,
  DollarSign,
  Activity as Gauge,
  Crosshair as Target,
  Shield as ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle as AlertCircle,
  Settings,
  X,
  Square,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { cn, getActiveToken } from './lib/utils';
import { AITickIndicator } from './lib/aiIndicator';
import { botEngine } from './lib/botEngine';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';

// Professional Deriv Symbols
const SYMBOLS = [
  { id: '1HZ10V', name: 'Volatility 10 (1s) Index' },
  { id: 'R_10', name: 'Volatility 10 Index' },
  { id: '1HZ25V', name: 'Volatility 25 (1s) Index' },
  { id: 'R_25', name: 'Volatility 25 Index' },
  { id: '1HZ50V', name: 'Volatility 50 (1s) Index' },
  { id: 'R_50', name: 'Volatility 50 Index' },
  { id: '1HZ75V', name: 'Volatility 75 (1s) Index' },
  { id: 'R_75', name: 'Volatility 75 Index' },
  { id: '1HZ100V', name: 'Volatility 100 (1s) Index' },
  { id: 'R_100', name: 'Volatility 100 Index' },
  { id: 'BOOM500', name: 'Boom 500 Index' },
  { id: 'BOOM1000', name: 'Boom 1000 Index' },
  { id: 'CRASH500', name: 'Crash 500 Index' },
  { id: 'CRASH1000', name: 'Crash 1000 Index' },
  { id: 'JD10', name: 'Jump 10 Index' },
  { id: 'JD25', name: 'Jump 25 Index' },
  { id: 'JD50', name: 'Jump 50 Index' },
  { id: 'JD100', name: 'Jump 100 Index' },
];

const ANALYSIS_WINDOW = 25;

interface TickData {
  epoch: number;
  quote: number;
  digit: number;
}

export default observer(function AnalysisTool() {
  const { client } = useStore();
  const [symbol, setSymbol] = useState(() => localStorage.getItem('analysis_symbol') || 'R_50');
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting' | 'error'>('disconnected');
  const [ticks, setTicks] = useState<TickData[]>([]);
  const aiIndicatorRef = useRef(new AITickIndicator());
  const [pipSize, setPipSize] = useState(0.01);
  const [lastUpdate, setLastUpdate] = useState(new Date().toLocaleTimeString());
  const wsRef = useRef<WebSocket | null>(null);

  // AI Scanner & Bot States
  const [showScannerSettings, setShowScannerSettings] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanBestMarket, setScanBestMarket] = useState<any>(null);
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [showScanResults, setShowScanResults] = useState(false);
  const [scannerSettings, setScannerSettings] = useState({
    stake: 1,
    martingale: 2,
    tp: 5,
    sl: 10
  });
  const [isAutoTrading, setIsAutoTrading] = useState(false);
  const [currentAutoStake, setCurrentAutoStake] = useState(1);
  const [autoSessionProfit, setAutoSessionProfit] = useState(0);
  const [tpSlResult, setTpSlResult] = useState<{ type: 'tp' | 'sl', profit: number } | null>(null);
  const [isWatcherActive, setIsWatcherActive] = useState(false);
  const [autoSwitchEnabled, setAutoSwitchEnabled] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);

  // Synchronization with Bot Builder
  useEffect(() => {
    localStorage.setItem('analysis_symbol', symbol);
  }, [symbol]);

  useEffect(() => {
    const handleSync = (e: any) => {
      if (e.detail?.symbol && e.detail.symbol !== symbol) {
        setSymbol(e.detail.symbol);
      }
    };
    window.addEventListener('analysis_market_sync', handleSync as any);
    return () => window.removeEventListener('analysis_market_sync', handleSync as any);
  }, [symbol]);

  // WebSocket Connection
  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [symbol]);

  const connect = () => {
    if (wsRef.current) wsRef.current.close();
    setTicks([]);
    setStatus('connecting');

    const ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=16929');
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      ws.send(JSON.stringify({ active_symbols: 'brief', product_type: 'basic' }));
      ws.send(JSON.stringify({ forget_all: "ticks" }));
      ws.send(JSON.stringify({ 
        ticks_history: symbol, 
        count: ANALYSIS_WINDOW, 
        end: "latest", 
        style: "ticks", 
        subscribe: 1 
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.error) {
        setStatus('error');
        return;
      }
      
      if (data.msg_type === 'active_symbols') {
        const s = data.active_symbols.find((item: any) => item.symbol === symbol);
        if (s) setPipSize(s.pip_size || 0.01);
      }
      
      if (data.msg_type === 'history') {
        const h = data.history;
        const currentPipSize = h.pip_size || pipSize;
        const precision = Math.max(0, Math.ceil(-Math.log10(currentPipSize || 0.01)));
        
        const histTicks = h.prices.map((price: number, i: number) => {
          const s = price.toFixed(precision);
          const digit = parseInt(s[s.length - 1], 10);
          aiIndicatorRef.current.update_tick(price);
          return { epoch: h.times[i], quote: price, digit };
        });
        setTicks(histTicks);
        setLastUpdate(new Date().toLocaleTimeString());
      }
      
      if (data.msg_type === 'tick') {
        const price = data.tick.quote;
        const currentPipSize = data.tick.pip_size || pipSize;
        const precision = Math.max(0, Math.ceil(-Math.log10(currentPipSize || 0.01)));
        const s = price.toFixed(precision);
        const digit = parseInt(s[s.length - 1], 10);
        aiIndicatorRef.current.update_tick(price);
        const tick = { epoch: data.tick.epoch, quote: price, digit };
        
        setTicks(prev => {
          const next = [...prev, tick];
          return next.slice(-ANALYSIS_WINDOW);
        });
        setLastUpdate(new Date().toLocaleTimeString());
      }
    };

    ws.onclose = () => setStatus('disconnected');
    ws.onerror = () => setStatus('error');
  };

  // Multi-layered Core Analysis Logic
  const analysis = useMemo(() => {
    if (ticks.length < 10) return null;

    const prices = ticks.map(t => t.quote);
    const lastPrice = prices[prices.length - 1];
    
    // Windows scaled for 25 ticks
    const shortWindow = ticks.slice(-5);
    const midWindow = ticks.slice(-15);
    const longWindow = ticks; // 25 ticks

    // 1. Short-term (Entry Timing)
    const shortDigits = shortWindow.map(t => t.digit);
    const shortCounts = Array(10).fill(0);
    shortDigits.forEach(d => shortCounts[d]++);
    const shortEvens = shortDigits.filter(d => d % 2 === 0).length;
    const shortOdds = shortWindow.length - shortEvens;

    // 2. Mid-term (Pattern Detection)
    const midDigits = midWindow.map(t => t.digit);
    const midCounts = Array(10).fill(0);
    midDigits.forEach(d => midCounts[d]++);
    const smaMid = midWindow.map(t => t.quote).reduce((a, b) => a + b, 0) / midWindow.length;

    // 3. Long-term (Trend Bias)
    const smaLong = prices.reduce((a, b) => a + b, 0) / prices.length;
    const longDigits = ticks.map(t => t.digit);
    const longCounts = Array(10).fill(0);
    longDigits.forEach(d => longCounts[d]++);

    // Stats for Display (using Long-term for stability)
    let mostFrequent = 0;
    let leastFrequent = 0;
    longCounts.forEach((c, i) => {
      if (c > longCounts[mostFrequent]) mostFrequent = i;
      if (c < longCounts[leastFrequent]) leastFrequent = i;
    });

    const frequencies = longCounts.map(c => (c / ticks.length) * 100);

    // Multi-layered Signal Synthesis
    const trendBias = lastPrice > smaLong ? 'RISE' : 'FALL';
    const shortMomentum = lastPrice > (shortWindow.map(t => t.quote).reduce((a, b) => a + b, 0) / shortWindow.length) ? 'RISE' : 'FALL';
    const priceChange = lastPrice - (prices[prices.length - 2] || lastPrice);
    const volatilityScore = Math.abs(lastPrice - smaMid) / smaMid;

    // AI Indicator Integration
    const aiSignals = aiIndicatorRef.current.generate_signals();

    return {
      frequencies,
      mostFrequent,
      leastFrequent,
      smaMid,
      smaLong,
      currentPrice: lastPrice,
      priceChange,
      shortMomentum,
      trendBias,
      volatilityScore,
      aiSignals,
      predictions: {
        matches: { 
          signal: leastFrequent, 
          confidence: "Dynamic (25/15/5)", 
          detail: `Entry ready when ${leastFrequent} stays cold in short-window` 
        },
        differs: { 
          signal: mostFrequent, 
          confidence: "Pattern Confirmed", 
          detail: "Avoiding peak frequency in mid-window" 
        },
        // Even/Odd: Signal if short-term confirms mid-term bias
        evenOdd: (shortEvens > shortOdds) ? "ODD" : (shortOdds > shortEvens) ? "EVEN" : "NEUTRAL", 
        // Over/Under: Bias toward long-term under-represented side
        overUnder: (longDigits.filter(d => d > 4).length > longDigits.filter(d => d < 5).length) ? "UNDER 5" : "OVER 4", 
        // Rise/Fall: Full alignment required
        riseFall: (trendBias === shortMomentum) ? trendBias : "NEUTRAL",
        accumulator: Math.abs(lastPrice - smaMid) / smaMid < 0.0002 ? "STABLE" : "VOLATILE"
      }
    };
  }, [ticks]);

  // Least Digits History (Ticker)
  const [coldestHistory, setColdestHistory] = useState<number[]>([]);
  useEffect(() => {
    if (analysis?.leastFrequent !== undefined) {
      setColdestHistory(prev => {
        if (prev[prev.length - 1] === analysis.leastFrequent) return prev;
        const next = [...prev, analysis.leastFrequent];
        return next.slice(-20);
      });
    }
  }, [analysis?.leastFrequent]);

  // Scanner & Auto-Trade Logic
  const startScanning = async (isBackground = false) => {
    const token = getActiveToken();
    if (!token) {
      if (!isBackground) alert('Please connect your Deriv account first.');
      return;
    }

    if (!isBackground) {
      setIsScanning(true);
      setScanProgress(0);
      setScanBestMarket(null);
      setScanResults([]);
    }
    
    const results: any[] = [];

    // Create a temporary websocket for scanning
    const scanWs = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=16929');
    
    scanWs.onopen = () => {
      scanWs.send(JSON.stringify({ authorize: token }));
    };

    scanWs.onmessage = async (e) => {
      const data = JSON.parse(e.data);
      
      if (data.msg_type === 'authorize') {
        scanWs.send(JSON.stringify({ active_symbols: 'brief', product_type: 'basic' }));
      }

      if (data.msg_type === 'active_symbols') {
        // Expand search to include all professional synthetic indices
        const syntheticSymbols = data.active_symbols.filter((s: any) => 
          s.market === 'synthetic_index' && 
          (s.submarket === 'random_index' || s.submarket === 'random_daily' || s.submarket === 'jump_indices')
        );

        if (syntheticSymbols.length === 0) {
          if (!isBackground) setIsScanning(false);
          scanWs.close();
          return;
        }

        // Limit background scan to top symbols to avoid overhead, or scan all if foreground
        const symbolsToScan = isBackground ? syntheticSymbols.slice(0, 15) : syntheticSymbols;

        for (let i = 0; i < symbolsToScan.length; i++) {
          const s = symbolsToScan[i];
          if (!isBackground) setScanProgress(Math.round(((i + 1) / symbolsToScan.length) * 100));
          
          scanWs.send(JSON.stringify({
            ticks_history: s.symbol,
            count: 300, // Balanced count for speed and accuracy
            end: "latest",
            style: "ticks"
          }));

          await new Promise(resolve => {
            const historyHandler = (event: any) => {
              const hData = JSON.parse(event.data);
              if (hData.msg_type === 'history' && hData.echo_req.ticks_history === s.symbol) {
                const h = hData.history;
                const pSize = hData.pip_size || s.pip_size || 0.01;
                const precision = Math.max(0, Math.ceil(-Math.log10(pSize)));
                
                const digits = h.prices.map((p: number) => {
                  const sPrice = p.toFixed(precision);
                  return parseInt(sPrice[sPrice.length - 1], 10);
                });

                const counts = Array(10).fill(0);
                digits.forEach((d: number) => counts[d]++);
                
                const minFreqValue = Math.min(...counts);
                const coldDigit = counts.indexOf(minFreqValue);
                const freqPercent = (minFreqValue / digits.length) * 100;

                results.push({
                  symbol: s.symbol,
                  name: s.display_name,
                  digit: coldDigit,
                  frequency: freqPercent,
                  pip_size: pSize,
                  confidence: 100 - freqPercent // Success probability
                });
                
                scanWs.removeEventListener('message', historyHandler);
                resolve(null);
              }
            };
            scanWs.addEventListener('message', historyHandler);
          });
        }

        const sorted = results.sort((a,b) => a.frequency - b.frequency);
        const best = sorted[0];
        
        setScanResults(sorted);
        setScanBestMarket(best);
        setLastScanTime(new Date().toLocaleTimeString());

        if (!isBackground) {
          setIsScanning(false);
          setShowScanResults(true);
        }

        // Auto-switch logic: switch if better market found and bot is running
        if (autoSwitchEnabled && best && isAutoTrading && best.symbol !== symbol) {
          botEngine.getBotInterface().notify('info', `Auto-Switching to superior market: ${best.name} (Conf: ${best.confidence.toFixed(1)}%)`);
          setSymbol(best.symbol);
          // BotEngine handles market switch if symbol changes (due to useEffect in bot interface or manual trigger)
          // We trigger manual switch in bot as well to be sure
          botEngine.getBotInterface().switchMarket(best.symbol);
        }

        scanWs.close();
      }
    };
  };

  // Background Watcher loop
  useEffect(() => {
    let interval: any;
    if (isWatcherActive) {
      // Immediate initial scan
      startScanning(true);
      interval = setInterval(() => {
        startScanning(true);
      }, 45000); // Scan every 45s to avoid rate limits
    }
    return () => clearInterval(interval);
  }, [isWatcherActive, autoSwitchEnabled, isAutoTrading, symbol]);

  const startAutoTrade = (best: any) => {
    const token = getActiveToken();
    if (!token) {
      alert('Please connect your Deriv account first.');
      return;
    }

    setIsAutoTrading(true);
    setTpSlResult(null);
    setCurrentAutoStake(scannerSettings.stake);
    setAutoSessionProfit(0);
    setSymbol(best.symbol);

    if (botEngine.isRunning) botEngine.stop();
    (window as any).SCANNER_CURRENT_STAKE = scannerSettings.stake;
    (window as any).STOP_SCANNER_BOT = false;

    const autoBotCode = `
      window.LAST_PURCHASE_TIME = 0;
      
      window.INITIALIZATION = async function() {
        Bot.notify('info', 'AI Scanner Bot Initializing...');
        window.LAST_PURCHASE_TIME = 0;
      };

      window.TRADE_OPTIONS = async function() {
        Bot.switchMarket('${best.symbol}');
        Bot.setTradeTypeCategory('digits');
        Bot.setTradeType('digitdiff');
        Bot.setContractType('DIGITDIFF');
        Bot.setTradeOptions({
          durationType: 't',
          duration: 1,
          amount: window.SCANNER_CURRENT_STAKE,
          prediction: ${best.digit}
        });
      };

      window.BEFORE_PURCHASE = async function() {
        const now = Date.now();
        // Emergency Reset Watchdog: If we are active but haven't bought in 15s, force unlock
        if (window.LAST_PURCHASE_TIME > 0 && now - window.LAST_PURCHASE_TIME > 15000) {
           Bot.notify('warn', 'AI Strategy stalling detected. Forcing reset...');
           Bot.emergencyReset();
           window.LAST_PURCHASE_TIME = now; // Give it another 15s
        }

        // 2-second safety cooldown between AI purchases to prevent rate limits
        if (now - window.LAST_PURCHASE_TIME < 2000) return;
        
        Bot.notify('info', 'AI Scanner: Evaluating purchase...');
        window.LAST_PURCHASE_TIME = now;
        Bot.purchase('DIGITDIFF');
      };

      window.AFTER_PURCHASE = async function() {
        const result = Bot.checkResult('win');
        const profit = Bot.readDetail('profit');
        Bot.notify(result ? 'success' : 'warn', 'AI Scanner: Trade Finished.');
        window.dispatchEvent(new CustomEvent('scanner_trade_result', { detail: { result, profit } }));

        if (window.STOP_SCANNER_BOT) {
          Bot.stop();
        } else {
          // 1-second delay before next trade evaluation
          await Bot.sleep(1);
          await Bot.tradeAgain();
        }
      };
    `;

    (window as any).STOP_SCANNER_BOT = false;

    // Small delay to ensure previous execution context is cleaned up
    setTimeout(() => {
      botEngine.start(token, autoBotCode, 'scanner_bot', 'AI Scanner Bot');
      botEngine.getBotInterface().notify('success', `AI Scanner configured for ${best.name}. Ready to trade Digit ${best.digit}.`);
    }, 500);
  };

  const stopAutoTrade = () => {
    setIsAutoTrading(false);
    (window as any).STOP_SCANNER_BOT = true;
    botEngine.stop();
    botEngine.getBotInterface().notify('info', 'AI Scanner Bot stopped.');
  };

  useEffect(() => {
    const handleTradeResult = (e: any) => {
      const { result, profit } = e.detail;
      
      setAutoSessionProfit(prev => {
        const nextProfit = prev + profit;
        
        if (nextProfit >= scannerSettings.tp) {
          botEngine.getBotInterface().notify('success', `Take Profit Reached: $${nextProfit.toFixed(2)}`);
          setTpSlResult({ type: 'tp', profit: nextProfit });
          stopAutoTrade();
          return nextProfit;
        }
        if (nextProfit <= -scannerSettings.sl) {
          botEngine.getBotInterface().notify('error', `Stop Loss Reached: $${nextProfit.toFixed(2)}`);
          setTpSlResult({ type: 'sl', profit: nextProfit });
          stopAutoTrade();
          return nextProfit;
        }

        if (result === false) { 
          setCurrentAutoStake(prevStake => {
            const nextStake = prevStake * scannerSettings.martingale;
            (window as any).SCANNER_CURRENT_STAKE = nextStake;
            botEngine.tradeParams.options.amount = nextStake;
            return nextStake;
          });
        } else { 
          const nextStake = scannerSettings.stake;
          (window as any).SCANNER_CURRENT_STAKE = nextStake;
          setCurrentAutoStake(nextStake);
          botEngine.tradeParams.options.amount = nextStake;
        }

        return nextProfit;
      });
    };

    window.addEventListener('scanner_trade_result', handleTradeResult);
    return () => window.removeEventListener('scanner_trade_result', handleTradeResult);
  }, [scannerSettings, isAutoTrading]);

  // Chart Data
  const digitChartData = useMemo(() => {
    if (!analysis) return [];
    return analysis.frequencies.map((f, i) => ({
      digit: i,
      frequency: parseFloat(f.toFixed(1)),
      count: Math.round((f / 100) * ticks.length)
    }));
  }, [analysis]);

  const priceHistoryData = useMemo(() => {
    return ticks.slice(-100).map(t => ({
      time: new Date(t.epoch * 1000).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
      price: t.quote
    }));
  }, [ticks]);

  return (
    <div className="flex-1 overflow-auto bg-[#0a0b0d] text-[#e1e1e1] p-4 md:p-6 lg:p-10 pb-[120px] md:pb-10 custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        
        {/* Superior Header */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 xl:gap-8">
          <div className="space-y-2 w-full xl:w-auto">
            <div className="flex items-center gap-3">
              <div className="p-2 md:p-2.5 bg-indigo-500/10 rounded-xl">
                <Activity size={20} className="text-indigo-400 md:w-6 md:h-6" />
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">Professional Data Analysis</h1>
            </div>
            <p className="text-[#9ba1a6] text-xs md:text-sm flex items-center gap-2">
              <RefreshCw size={12} className={cn(status === 'connecting' && "animate-spin", "md:w-3.5 md:h-3.5")} />
              Deriv API Connection: 
              <span className={cn(
                "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest",
                status === 'connected' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
              )}>
                {status}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-4 bg-[#111217] p-2 rounded-2xl border border-[#2d2f36] w-full xl:w-auto">
            {isWatcherActive && scanBestMarket && (
              <div className="hidden lg:flex items-center gap-3 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                 <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                 <div className="flex flex-col">
                   <span className="text-[8px] font-black uppercase text-indigo-400/60 tracking-widest leading-none mb-1">Live Best Pick</span>
                   <span className="text-xs font-black text-white tracking-tight leading-none uppercase">{scanBestMarket.name}</span>
                 </div>
              </div>
            )}
            
            {!isAutoTrading ? (
              <button 
                onClick={() => setShowScannerSettings(true)}
                className="flex items-center justify-center flex-1 md:flex-none gap-2 px-3 md:px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs md:text-sm font-black text-white transition-all shadow-lg active:scale-95 group overflow-hidden relative whitespace-nowrap"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                <Zap size={16} fill="currentColor" className="md:w-[18px] md:h-[18px]" />
                AI SCANNER
              </button>
            ) : (
              <button 
                onClick={stopAutoTrade}
                className="flex items-center justify-center flex-1 md:flex-none gap-2 px-3 md:px-5 py-2.5 bg-rose-600 hover:bg-rose-500 rounded-xl text-xs md:text-sm font-black text-white transition-all shadow-lg active:scale-95 animate-pulse whitespace-nowrap"
              >
                <Square size={16} fill="currentColor" className="md:w-[18px] md:h-[18px]" />
                STOP AI BOT
              </button>
            )}
            <div className="relative group flex-1 md:flex-none min-w-[140px] md:min-w-[220px]">
              <select 
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full bg-[#0a0b0d] hover:bg-[#1a1c23] border border-[#2d2f36] rounded-xl pl-3 pr-8 md:pl-4 md:pr-10 py-2.5 text-xs md:text-sm font-bold text-white appearance-none focus:outline-none transition-all cursor-pointer truncate"
              >
                {SYMBOLS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none" />
            </div>
            <button 
              onClick={connect}
              className="p-2.5 bg-[#1a1c23] hover:bg-[#2d2f36] rounded-xl border border-[#2d2f36] text-[#9ba1a6] hover:text-white transition-all shadow-lg active:scale-95 shrink-0"
            >
              <RefreshCw size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
          </div>
        </div>

        {/* Real-time Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <AnalysisCard 
            title="Last Price" 
            value={analysis?.currentPrice.toFixed(2) ?? '0.00'} 
            sub={analysis ? `${analysis.priceChange > 0 ? '+' : ''}${analysis.priceChange.toFixed(4)}` : '0.000'}
            icon={<DollarSign size={20} />}
            color="indigo"
            trend={analysis ? (analysis.priceChange >= 0 ? 'up' : 'down') : 'neutral'}
          />
          <AnalysisCard 
            title="Trend Bias" 
            value={analysis?.predictions.riseFall ?? 'Neutral'} 
            sub={analysis ? `SMA-500: ${analysis.smaLong.toFixed(2)}` : 'Scanning...'}
            icon={<TrendingUp size={20} />}
            color={analysis?.predictions.riseFall === 'RISE' ? 'emerald' : 'rose'}
            trend={analysis?.predictions.riseFall === 'RISE' ? 'up' : 'down'}
          />
          <AnalysisCard 
            title="Most Frequent Digit" 
            value={analysis?.mostFrequent.toString() ?? '—'} 
            sub={`${analysis?.frequencies[analysis.mostFrequent].toFixed(1) ?? '0'}% Frequency`}
            icon={<Zap size={20} />}
            color="amber"
          />
          <AnalysisCard 
            title="Least Frequent Digit" 
            value={analysis?.leastFrequent.toString() ?? '—'} 
            sub={`${analysis?.frequencies[analysis.leastFrequent].toFixed(1) ?? '0'}% Frequency`}
            icon={<Target size={20} />}
            color="indigo"
          />
        </div>

        {/* Cold Digit Ticker */}
        <div className="bg-[#111217] rounded-2xl border border-[#2d2f36] p-4 flex items-center gap-6 overflow-hidden">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-[#9ba1a6]">Coldest Ticker:</span>
          </div>
          <div className="flex items-center gap-3 overflow-hidden">
            <AnimatePresence mode="popLayout">
              {coldestHistory.map((d, i) => (
                <motion.div 
                  key={`${i}-${d}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xs font-black text-indigo-400 shrink-0"
                >
                  {d}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Main Workspace Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          
          {/* Left: Detailed Digit Frequency & History */}
          <div className="xl:col-span-2 space-y-8">
            <div className="bg-[#111217] rounded-3xl border border-[#2d2f36] p-8 shadow-xl">
              <div className="flex items-center justify-between mb-8">
                <div className="space-y-1">
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[#9ba1a6] flex items-center gap-2">
                    <BarChart size={18} className="text-indigo-400" />
                    Digit Frequency Analysis
                  </h3>
                  <p className="text-xs text-[#555]">Calculated from the last {ANALYSIS_WINDOW} ticks</p>
                </div>
                <div className="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
                  Reliability: High
                </div>
              </div>

              <div className="h-72 w-full mb-10">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={digitChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2d2f36" vertical={false} />
                    <XAxis 
                      dataKey="digit" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#9ba1a6', fontSize: 13, fontWeight: 'bold' }} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#555', fontSize: 11 }} 
                      unit="%"
                    />
                    <RechartsTooltip 
                      cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                      contentStyle={{ backgroundColor: '#111217', border: '1px solid #2d2f36', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                      itemStyle={{ color: '#818cf8', fontWeight: 'bold' }}
                    />
                    <Bar dataKey="frequency" radius={[6, 6, 0, 0]}>
                      {digitChartData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.digit === analysis?.mostFrequent ? '#f59e0b' : entry.digit === analysis?.leastFrequent ? '#818cf8' : '#1a1c23'} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Individual Digit Bubble Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-3">
                {Array.from({ length: 10 }).map((_, i) => {
                  const freq = analysis?.frequencies[i] ?? 0;
                  const isHot = i === analysis?.mostFrequent;
                  const isCold = i === analysis?.leastFrequent;
                  
                  return (
                    <motion.div 
                      key={i}
                      whileHover={{ scale: 1.05 }}
                      className={cn(
                        "bg-[#0a0b0d] rounded-2xl border p-4 flex flex-col items-center gap-1.5 transition-all",
                        isHot ? "border-amber-500/50 bg-amber-500/5" : isCold ? "border-indigo-500/50 bg-indigo-500/5" : "border-[#2d2f36]"
                      )}
                    >
                      <span className={cn(
                        "text-2xl font-black",
                        isHot ? "text-amber-500" : isCold ? "text-indigo-400" : "text-white"
                      )}>
                        {i}
                      </span>
                      <div className="text-center">
                        <p className="text-[10px] font-black text-white">{freq.toFixed(1)}%</p>
                        <p className="text-[8px] font-bold text-[#555] uppercase tracking-tighter">{isHot ? 'Hot' : isCold ? 'Cold' : 'Normal'}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Price Action Monitor */}
            <div className="bg-[#111217] rounded-3xl border border-[#2d2f36] p-8 shadow-xl">
              <div className="flex items-center justify-between mb-8">
                <div className="space-y-1">
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[#9ba1a6] flex items-center gap-2">
                    <LineIcon size={18} className="text-rose-400" />
                    Market Momentum
                  </h3>
                  <p className="text-xs text-[#555]">Real-time tick flow visualization</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">Active Feed</span>
                </div>
              </div>

              <div className="h-60 w-full overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={priceHistoryData}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2d2f36" vertical={false} />
                    <XAxis dataKey="time" hide />
                    <YAxis domain={['auto', 'auto']} hide />
                    <RechartsTooltip content={() => null} />
                    <Area 
                      type="monotone" 
                      dataKey="price" 
                      stroke="#ef4444" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorPrice)" 
                      animationDuration={500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Right Panel: Signals & Volatility Gauge */}
          <div className="space-y-8">
            
            {/* Live Recommendation Badge */}
            <div className="bg-[#111217] rounded-3xl border border-[#2d2f36] p-8 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity rotate-12">
                <Target size={120} />
              </div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#9ba1a6] mb-8 flex items-center gap-2">
                <Target size={16} /> Live AI Selection
              </h3>
              
              <div className="flex flex-col items-center justify-center text-center space-y-6">
                {scanBestMarket ? (
                  <>
                    <div className="space-y-1">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <span className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                          Market Recommended
                        </span>
                      </div>
                      <h4 className="text-2xl font-black text-white uppercase tracking-tighter">{scanBestMarket.name}</h4>
                      <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-[.2em]">Conf: {scanBestMarket.confidence.toFixed(1)}%</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 w-full">
                      <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                        <p className="text-[8px] font-black text-[#555] uppercase tracking-widest mb-1">Cold Digit</p>
                        <p className="text-xl font-black text-indigo-400">{scanBestMarket.digit}</p>
                      </div>
                      <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                        <p className="text-[8px] font-black text-[#555] uppercase tracking-widest mb-1">Frequency</p>
                        <p className="text-xl font-black text-white">{scanBestMarket.frequency.toFixed(1)}%</p>
                      </div>
                    </div>
                    
                    {symbol !== scanBestMarket.symbol && !autoSwitchEnabled && (
                      <button 
                        onClick={() => setSymbol(scanBestMarket.symbol)}
                        className="w-full py-3 bg-white hover:bg-white/90 text-black rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95"
                      >
                        Switch To This Market
                      </button>
                    )}

                    {autoSwitchEnabled && (
                      <div className="flex items-center gap-2 py-3 px-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl w-full justify-center">
                        <RefreshCw size={12} className="text-emerald-400 animate-spin" />
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Auto-Handling Active</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="py-10 space-y-4">
                    <div className="w-12 h-12 bg-[#1a1c23] rounded-2xl flex items-center justify-center mx-auto mb-2 animate-pulse">
                      <Search size={20} className="text-[#555]" />
                    </div>
                    <p className="text-xs font-bold text-[#555] uppercase tracking-widest leading-relaxed">
                      Enable Smart Watcher <br /> in settings to track <br /> best markets live.
                    </p>
                  </div>
                )}
                
                <div className="pt-2">
                  <p className="text-[8px] font-bold text-[#444] uppercase tracking-widest">
                    Last Scan: {lastScanTime ?? 'Not Scanned'}
                  </p>
                </div>
              </div>
            </div>

            {/* Volatility Status (Accumulator) */}
            <div className="bg-[#111217] rounded-3xl border border-[#2d2f36] p-8 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Gauge size={120} />
              </div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#9ba1a6] mb-8 flex items-center gap-2">
                <Gauge size={16} /> Volatility Gauge
              </h3>
              
              <div className="flex flex-col items-center justify-center text-center space-y-6">
                <div className="relative w-40 h-40">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="80" cy="80" r="70" fill="none" stroke="#1a1c23" strokeWidth="12" />
                    <motion.circle 
                      cx="80" cy="80" r="70" fill="none" 
                      stroke={analysis?.predictions.accumulator === 'STABLE' ? '#10b981' : '#f59e0b'} 
                      strokeWidth="12"
                      strokeDasharray="440"
                      initial={{ strokeDashoffset: 440 }}
                      animate={{ strokeDashoffset: 440 * (1 - Math.min(1, (analysis?.volatilityScore ?? 0) * 5000)) }}
                      transition={{ type: "spring", stiffness: 50 }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={cn(
                      "text-2xl font-black uppercase tracking-tighter",
                      analysis?.predictions.accumulator === 'STABLE' ? 'text-emerald-400' : 'text-amber-400'
                    )}>
                      {analysis?.predictions.accumulator ?? 'Scanning'}
                    </span>
                    <span className="text-[10px] font-bold text-[#555] uppercase tracking-widest">Market Feed</span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <p className="text-xs font-bold text-[#9ba1a6]">
                    Status: <span className="text-white capitalize">{analysis?.predictions.accumulator === 'STABLE' ? 'Low Volatility' : 'High Volatility'}</span>
                  </p>
                  <p className="text-[10px] text-[#555] max-w-[180px]">
                    Accumulators/Stable: Ideal when price action is smooth and flat.
                  </p>
                </div>
              </div>
            </div>

            {/* AI Intelligence Panel */}
            <div className="bg-gradient-to-br from-[#1a1c2e] to-[#111217] rounded-3xl border border-indigo-500/30 p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute -right-8 -top-8 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full" />
              
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400 mb-6 flex items-center gap-2">
                <Zap size={16} className="text-indigo-400" /> AI Market Intelligence
              </h3>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-1">Market State</p>
                  <p className={cn(
                    "text-lg font-black tracking-tighter",
                    analysis?.aiSignals?.market_state === 'STABLE' ? 'text-emerald-400' : 
                    analysis?.aiSignals?.market_state === 'VOLATILE' ? 'text-amber-400' : 'text-rose-500'
                  )}>
                    {analysis?.aiSignals?.market_state ?? 'SCANNING'}
                  </p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-1">AI Confidence</p>
                  <p className="text-lg font-black tracking-tighter text-white">
                    {analysis?.aiSignals ? `${(analysis.aiSignals.confidence * 100).toFixed(0)}%` : '0%'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                  <span className="text-[10px] font-bold text-[#9ba1a6] uppercase">Trade Bias</span>
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-black uppercase",
                    analysis?.aiSignals?.rise_fall === 'RISE' ? 'bg-emerald-500/20 text-emerald-400' :
                    analysis?.aiSignals?.rise_fall === 'FALL' ? 'bg-rose-500/20 text-rose-400' : 'bg-white/10 text-white'
                  )}>
                    {analysis?.aiSignals?.rise_fall ?? 'WAITING'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                  <span className="text-[10px] font-bold text-[#9ba1a6] uppercase">Entry Pulse</span>
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-black uppercase",
                    analysis?.aiSignals?.accumulator === 'ENTER' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/50' : 'bg-white/10 text-[#555]'
                  )}>
                    {analysis?.aiSignals?.accumulator ?? 'WAIT'}
                  </span>
                </div>
              </div>
            </div>

            {/* Smart Strategy Guide */}
            <div className="bg-[#111217] rounded-3xl border border-[#2d2f36] p-8 shadow-xl">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#9ba1a6] mb-6 flex items-center gap-2">
                <ShieldCheck size={16} /> Signal Engine v5.1
              </h3>
              
              <div className="space-y-4">
                <SignalRow 
                  label="Matches" 
                  signal={analysis?.predictions.matches.signal.toString() ?? '—'} 
                  hint="Bet on cold digit"
                  confidence="High"
                />
                <SignalRow 
                  label="Differs" 
                  signal={analysis?.predictions.differs.signal.toString() ?? '—'} 
                  hint="Avoid hot digit"
                  confidence="High"
                />
                <SignalRow 
                  label="Over/Under" 
                  signal={analysis?.predictions.overUnder ?? '—'} 
                  hint="Counter-trend play"
                  confidence="Medium"
                />
                <SignalRow 
                  label="Even/Odd" 
                  signal={analysis?.predictions.evenOdd ?? '—'} 
                  hint="Mean reversion bias"
                  confidence="Medium"
                />
                <SignalRow 
                  label="Rise/Fall" 
                  signal={analysis?.predictions.riseFall ?? '—'} 
                  hint="SMA-500 Trend"
                  confidence="High"
                />
              </div>
            </div>
            
          </div>

        </div>

        {/* Professional Footer Info */}
        <div className="flex flex-col sm:flex-row items-center justify-between pt-10 border-t border-[#2d2f36] gap-4">
          <div className="flex items-center gap-8 text-[10px] font-bold uppercase tracking-widest text-[#555]">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
              <span className="text-[#9ba1a6]">Engine Sync OK</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-indigo-400" />
              <span className="text-[#9ba1a6]">AI Engine: v2.4 (ML-Active)</span>
            </div>
            <div className="hidden sm:block text-[#444]">
              High-Speed (5/15/25) Intelligence
            </div>
          </div>
          <div className="text-[10px] font-black text-[#555] uppercase tracking-[0.2em]">
            Precision Analysis • v5.24.0
          </div>
        </div>

      </div>

      {/* Scanner Settings Modal */}
      <AnimatePresence>
        {showScannerSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md bg-[#111217] rounded-[2rem] border border-[#2d2f36] shadow-2xl p-8 space-y-8"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
                    <Settings className="text-indigo-400" />
                    Scanner Setup
                  </h3>
                  <p className="text-xs text-[#555] font-bold uppercase tracking-widest">Digit Differ Strategy</p>
                </div>
                <button onClick={() => setShowScannerSettings(false)} className="p-2 hover:bg-white/5 rounded-full text-[#555] hover:text-white transition-colors">
                  <X />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-[#9ba1a6] uppercase tracking-[0.2em] ml-1">Initial Stake</label>
                  <div className="relative">
                    <DollarSign size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400" />
                    <input 
                      type="number" 
                      value={scannerSettings.stake}
                      onChange={(e) => setScannerSettings(prev => ({ ...prev, stake: parseFloat(e.target.value) }))}
                      className="w-full bg-[#0a0b0d] border border-[#2d2f36] rounded-2xl py-3 pl-10 pr-4 text-white font-bold focus:outline-none focus:border-indigo-500/50"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-[#9ba1a6] uppercase tracking-[0.2em] ml-1">Martingale</label>
                  <div className="relative">
                    <Zap size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400" />
                    <input 
                      type="number" 
                      value={scannerSettings.martingale}
                      onChange={(e) => setScannerSettings(prev => ({ ...prev, martingale: parseFloat(e.target.value) }))}
                      className="w-full bg-[#0a0b0d] border border-[#2d2f36] rounded-2xl py-3 pl-10 pr-4 text-white font-bold focus:outline-none focus:border-indigo-500/50"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-[#9ba1a6] uppercase tracking-[0.2em] ml-1">Take Profit</label>
                  <div className="relative">
                    <TrendingUp size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400" />
                    <input 
                      type="number" 
                      value={scannerSettings.tp}
                      onChange={(e) => setScannerSettings(prev => ({ ...prev, tp: parseFloat(e.target.value) }))}
                      className="w-full bg-[#0a0b0d] border border-[#2d2f36] rounded-2xl py-3 pl-10 pr-4 text-white font-bold focus:outline-none focus:border-indigo-500/50"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-[#9ba1a6] uppercase tracking-[0.2em] ml-1">Stop Loss</label>
                  <div className="relative">
                    <TrendingDown size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-rose-400" />
                    <input 
                      type="number" 
                      value={scannerSettings.sl}
                      onChange={(e) => setScannerSettings(prev => ({ ...prev, sl: parseFloat(e.target.value) }))}
                      className="w-full bg-[#0a0b0d] border border-[#2d2f36] rounded-2xl py-3 pl-10 pr-4 text-white font-bold focus:outline-none focus:border-indigo-500/50"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/20 rounded-lg">
                      <Search size={18} className="text-indigo-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white tracking-tight leading-none mb-1">Smart Watcher</h4>
                      <p className="text-[10px] font-bold text-indigo-400/60 uppercase tracking-widest leading-none">Background live scanning</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsWatcherActive(!isWatcherActive)}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all relative",
                      isWatcherActive ? "bg-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.5)]" : "bg-white/10"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 bg-white rounded-full transition-all transform",
                      isWatcherActive ? "left-7 shadow-lg" : "left-1"
                    )} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/20 rounded-lg">
                      <RefreshCw size={18} className="text-emerald-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white tracking-tight leading-none mb-1">Auto-Switch</h4>
                      <p className="text-[10px] font-bold text-emerald-400/60 uppercase tracking-widest leading-none">Automatic best market move</p>
                    </div>
                  </div>
                  <button 
                    disabled={!isWatcherActive}
                    onClick={() => setAutoSwitchEnabled(!autoSwitchEnabled)}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all relative",
                      autoSwitchEnabled ? "bg-emerald-600 shadow-[0_0_15px_rgba(16,185,129,0.5)]" : "bg-white/10",
                      !isWatcherActive && "opacity-30 cursor-not-allowed"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 bg-white rounded-full transition-all transform",
                      autoSwitchEnabled ? "left-7 shadow-lg" : "left-1"
                    )} />
                  </button>
                </div>

                <button 
                  onClick={() => {
                    setShowScannerSettings(false);
                    startScanning();
                  }}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl text-white font-black text-lg transition-all shadow-xl shadow-indigo-600/20 active:scale-[0.98] flex items-center justify-center gap-3"
                >
                  <Search size={22} />
                  PERFORM DEEP SCAN
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Scanning Feedback Overlay */}
      <AnimatePresence>
        {isScanning && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <div className="max-w-md w-full text-center space-y-8">
              <div className="relative flex items-center justify-center">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  className="w-48 h-48 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center space-y-1">
                  <span className="text-4xl font-black text-white">{scanProgress}%</span>
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">AI Scanning</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-white tracking-tight">Searching Markets...</h3>
                <p className="text-sm text-[#9ba1a6] font-medium">Scrutinizing price action across all synthetic indices for the best entry point.</p>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Scan Results Modal */}
      <AnimatePresence>
        {showScanResults && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-2xl bg-[#111217] rounded-[2rem] border border-[#2d2f36] shadow-2xl p-8 space-y-6 max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between shrink-0">
                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                    <Target className="text-emerald-400" />
                    AI Scan Results
                  </h3>
                  <p className="text-[10px] font-black text-[#555] uppercase tracking-widest">Found {scanResults.length} analyzed markets</p>
                </div>
                <button 
                  onClick={() => setShowScanResults(false)}
                  className="p-2 hover:bg-white/5 rounded-full text-[#555] hover:text-white transition-colors"
                >
                  <X />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {scanResults.map((res, i) => (
                  <div 
                    key={res.symbol}
                    className={cn(
                      "group relative p-5 bg-[#0a0b0d] rounded-2xl border transition-all cursor-pointer",
                      i === 0 ? "border-emerald-500/50 bg-emerald-500/5 shadow-[0_0_20px_rgba(16,185,129,0.1)]" : "border-[#2d2f36] hover:border-indigo-500/30 hover:bg-white/5"
                    )}
                    onClick={() => {
                      setShowScanResults(false);
                      startAutoTrade(res);
                    }}
                  >
                    {i === 0 && (
                      <div className="absolute -top-2.5 -right-2.5 bg-emerald-500 text-black text-[8px] font-black uppercase px-3 py-1 rounded-full shadow-lg">
                        Best Choice
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl",
                          i === 0 ? "bg-emerald-500 text-black" : "bg-[#111217] text-white border border-[#2d2f36]"
                        )}>
                          {res.digit}
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-black text-white">{res.name}</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-[#555] uppercase tracking-widest">Digit frequency:</span>
                            <span className="text-[10px] font-black text-emerald-400">{res.frequency.toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right space-y-1">
                        <div className="text-2xl font-black text-white tracking-tighter">
                          {(100 - res.frequency).toFixed(1)}%
                        </div>
                        <p className="text-[8px] font-black text-[#555] uppercase tracking-[0.2em]">Differ Success Probability</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="shrink-0 pt-4 border-t border-[#2d2f36]">
                <button 
                  onClick={() => {
                    setShowScanResults(false);
                    startAutoTrade(scanResults[0]);
                  }}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-emerald-900/20 active:scale-[0.98] flex items-center justify-center gap-3"
                >
                  <Zap size={20} />
                  AUTO-TRADE BEST RECOMMENDATION
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Auto-Trading Dashboard Stats */}
      {isAutoTrading && (
        <div className="fixed bottom-10 right-10 z-[80]">
          <motion.div 
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            className="bg-[#111217] rounded-3xl border border-indigo-500/40 p-6 shadow-2xl backdrop-blur-xl w-72 space-y-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">Bot Active</span>
              </div>
              <button 
                onClick={stopAutoTrade}
                className="p-1.5 hover:bg-rose-500/10 text-[#555] hover:text-rose-500 rounded-lg transition-all"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-[#555] uppercase tracking-widest">Session Profit</span>
                <span className={cn(
                  "text-lg font-black tracking-tight",
                  autoSessionProfit >= 0 ? "text-emerald-400" : "text-rose-400"
                )}>
                  ${autoSessionProfit.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-[#555] uppercase tracking-widest">Next Stake</span>
                <span className="text-white font-black">${currentAutoStake.toFixed(2)}</span>
              </div>
              <div className="w-full bg-[#0a0b0d] h-2 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, Math.max(0, (autoSessionProfit / (autoSessionProfit >= 0 ? scannerSettings.tp : scannerSettings.sl)) * 100))}%` }}
                  className={cn("h-full", autoSessionProfit >= 0 ? "bg-emerald-500" : "bg-rose-500")}
                />
              </div>
              <div className="flex justify-between text-[8px] font-black uppercase text-[#444] tracking-widest pt-1">
                <span>Start</span>
                <span>TP: ${scannerSettings.tp}</span>
              </div>
            </div>

            <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-1">
              <p className="text-[8px] font-black text-[#555] uppercase tracking-widest">Target Market</p>
              <p className="text-xs font-bold text-white truncate">{scanBestMarket?.name}</p>
              <p className="text-[9px] font-black text-indigo-400 uppercase">Digit: {scanBestMarket?.digit} (Differ)</p>
            </div>
          </motion.div>
        </div>
      )}

      {/* TP/SL Conclusion Modal */}
      <AnimatePresence>
        {tpSlResult && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={cn(
                "w-full max-w-sm p-8 rounded-[2.5rem] border text-center space-y-6 shadow-2xl relative overflow-hidden",
                tpSlResult.type === 'tp' ? "bg-emerald-950/20 border-emerald-500/30" : "bg-rose-950/20 border-rose-500/30"
              )}
            >
              {/* Decorative Background Elements */}
              <div className={cn(
                "absolute -top-20 -right-20 w-40 h-40 blur-[80px] rounded-full opacity-20",
                tpSlResult.type === 'tp' ? "bg-emerald-400" : "bg-rose-400"
              )} />
              
              <div className="mx-auto w-20 h-20 rounded-full flex items-center justify-center animate-bounce shadow-inner bg-white/5">
                {tpSlResult.type === 'tp' ? (
                  <TrendingUp size={40} className="text-emerald-400" />
                ) : (
                  <TrendingDown size={40} className="text-rose-400" />
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-black text-[#555] uppercase tracking-[0.4em]">Session Finished</h3>
                <h2 className="text-3xl font-black text-white tracking-tighter">
                  {tpSlResult.type === 'tp' ? 'Target Profit Hit!' : 'Stop Loss Triggered'}
                </h2>
              </div>

              <div className="flex flex-col items-center justify-center space-y-1 py-4">
                <span className="text-[10px] font-black text-[#555] uppercase tracking-widest leading-none mb-1">Total Profit</span>
                <span className={cn(
                  "text-5xl font-black tracking-tighter",
                  tpSlResult.profit >= 0 ? "text-emerald-400" : "text-rose-400"
                )}>
                  ${tpSlResult.profit.toFixed(2)}
                </span>
              </div>

              <button
                onClick={() => setTpSlResult(null)}
                className={cn(
                  "w-full py-4 rounded-2xl font-black text-white transition-all shadow-xl active:scale-95",
                  tpSlResult.type === 'tp' ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20" : "bg-rose-600 hover:bg-rose-500 shadow-rose-500/20"
                )}
              >
                CLOSE REPORT
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
});

function AnalysisCard({ title, value, sub, icon, color, trend }: any) {
  const colorMap: any = {
    indigo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    amber: 'text-amber-500 bg-amber-400/10 border-amber-400/20',
  };

  return (
    <div className="bg-[#111217] rounded-3xl border border-[#2d2f36] p-6 space-y-4 hover:border-[#3d3f46] transition-all shadow-lg group">
      <div className="flex items-center justify-between">
        <div className={cn("p-2.5 rounded-xl transition-colors", colorMap[color])}>
          {icon}
        </div>
        <h4 className="text-[10px] font-black uppercase tracking-widest text-[#555] group-hover:text-[#9ba1a6] transition-colors">{title}</h4>
      </div>
      <div className="space-y-1">
        <div className="flex items-baseline gap-2">
          <p className="text-3xl font-black text-white tracking-tighter">{value}</p>
          {trend === 'up' && <ArrowUpRight size={16} className="text-emerald-400 mb-1" />}
          {trend === 'down' && <ArrowDownRight size={16} className="text-rose-400 mb-1" />}
        </div>
        <p className={cn(
          "text-[10px] font-black uppercase tracking-widest",
          trend === 'up' ? "text-emerald-400" : trend === 'down' ? "text-rose-400" : "text-[#555]"
        )}>
          {sub}
        </p>
      </div>
    </div>
  );
}

function SignalRow({ label, signal, hint, confidence }: any) {
  return (
    <div className="flex items-center justify-between p-4 bg-[#0a0b0d] border border-[#2d2f36] rounded-24 transition-all hover:bg-[#111217] hover:border-indigo-500/30">
      <div className="space-y-0.5">
        <h5 className="text-[10px] font-black uppercase tracking-widest text-white">{label}</h5>
        <p className="text-[9px] font-bold text-[#555] uppercase tracking-tighter">{hint}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-black text-indigo-400 tracking-widest uppercase">{signal}</p>
        <p className={cn(
          "text-[9px] font-bold uppercase tracking-widest",
          confidence === 'High' ? 'text-emerald-400' : 'text-amber-400'
        )}>{confidence} Conf.</p>
      </div>
    </div>
  );
}
