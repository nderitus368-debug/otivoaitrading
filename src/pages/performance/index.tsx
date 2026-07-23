import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { observer } from 'mobx-react-lite';
import RootStore from '../../stores/root-store';
import { useStore } from '../../hooks/useStore';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Calendar, 
  Clock, 
  BarChart, 
  Zap, 
  Bot,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Filter,
  Trash2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { cn, getUserIdentity, getTimeBasedGreeting, getActiveAccountType } from './lib/utils';
import { generateDynamicMessage } from './lib/gemini';

interface TradeHistory {
  botId: string;
  botName: string;
  profit: number;
  result: 'win' | 'loss';
  timestamp: number;
  accountType?: string;
}

interface BotPerformance {
  id: string;
  name: string;
  type: 'pre-built' | 'saved';
  daily: number;
  weekly: number;
  monthly: number;
  totalTrades: number;
  winRate: number;
  lastUsed: number | null;
}

const PRE_BUILT_BOTS = [
  { id: 'scanner_bot', name: 'AI Scanner Bot' },
  { id: '/bots/auto_c4_otivo.xml', name: 'AUTO C4 Strategy' },
  { id: '/bots/accumulator_barrier.xml', name: 'Accumulator Barrier' },
  { id: '/bots/matches_bot.xml', name: 'Digit Matches' },
  { id: '/bots/differs_bot.xml', name: 'Digit Differs' },
  { id: '/bots/over_2_pro.xml', name: 'Over 2 pro' },
  { id: '/bots/Differ_Accumulator_BB.xml', name: 'Differ Accumulator BB' },
  { id: '/bots/even_odd.xml', name: 'Digit Even' },
  { id: '/bots/hybrid-strategy.xml', name: 'Hybrid Bot' },
  { id: '/bots/accumulator_2_consecutive_knocks.xml', name: 'Accumulator 2 Consecutive Knock out' },
  { id: '/bots/Even_Odd_Counter.xml', name: 'Even_Odd Counter' }
];

export default observer(function Performance() {
  const store = useStore();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [performanceData, setPerformanceData] = useState<BotPerformance[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'pre-built' | 'saved'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [confirmingBotId, setConfirmingBotId] = useState<string | null>(null);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [dynamicComment, setDynamicComment] = useState<string>("");
  
  const userIdentity = getUserIdentity();
  const greetingPrefix = getTimeBasedGreeting();

  useEffect(() => {
    calculatePerformance();
    // Refresh every 30 seconds for live feel
    const interval = setInterval(calculatePerformance, 30000);
    
    // Real-time clock
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(clockInterval);
    };
  }, [store.client.accountType]);

  const calculatePerformance = () => {
    try {
      const historyJson = localStorage.getItem('bot_performance_history');
      const allHistory: TradeHistory[] = historyJson ? JSON.parse(historyJson) : [];
      
      const activeType = store.client.accountType;
      const history = allHistory.filter(t => t.accountType === activeType);
      
      const userBotsJson = localStorage.getItem('user_ready_bots');
      const userBots = userBotsJson ? JSON.parse(userBotsJson) : [];
      
      const allBots = [
        ...PRE_BUILT_BOTS.map(b => ({ ...b, type: 'pre-built' as const })),
        ...userBots.map((b: any) => ({ id: b.id, name: b.name, type: 'saved' as const }))
      ];

      const now = new Date();
      
      // Daily: Since 00:00:00 of today
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      
      // Weekly: Since 00:00:00 of the most recent Monday
      const dayOfWeek = now.getDay(); // 0 (Sun) to 6 (Sat)
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday).getTime();
      
      // Monthly: Since 00:00:00 of the 1st of the current month
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

      const calculatedData: BotPerformance[] = allBots.map(bot => {
        const botTrades = history.filter(t => t.botId === bot.id);
        
        const dailyTrades = botTrades.filter(t => t.timestamp >= startOfToday);
        const weeklyTrades = botTrades.filter(t => t.timestamp >= startOfWeek);
        const monthlyTrades = botTrades.filter(t => t.timestamp >= startOfMonth);

        const dailyProfit = dailyTrades.reduce((acc, t) => acc + t.profit, 0);
        const weeklyProfit = weeklyTrades.reduce((acc, t) => acc + t.profit, 0);
        const monthlyProfit = monthlyTrades.reduce((acc, t) => acc + t.profit, 0);

        const wins = botTrades.filter(t => t.result === 'win').length;
        const winRate = botTrades.length > 0 ? (wins / botTrades.length) * 100 : 0;
        
        const lastTrade = botTrades.length > 0 ? Math.max(...botTrades.map(t => t.timestamp)) : null;

        return {
          id: bot.id,
          name: bot.name,
          type: bot.type,
          daily: dailyProfit,
          weekly: weeklyProfit,
          monthly: monthlyProfit,
          totalTrades: botTrades.length,
          winRate,
          lastUsed: lastTrade
        };
      });

      setPerformanceData(calculatedData);
      setIsLoading(false);
    } catch (e) {
      console.error('Error calculating performance:', e);
      setIsLoading(false);
    }
  };

  const filteredData = performanceData.filter(bot => {
    const matchesSearch = bot.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === 'all' || bot.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const totalDaily = performanceData.reduce((acc, b) => acc + b.daily, 0);
  const totalWeekly = performanceData.reduce((acc, b) => acc + b.weekly, 0);
  const totalMonthly = performanceData.reduce((acc, b) => acc + b.monthly, 0);

  const scannerBot = performanceData.find(b => b.id === 'scanner_bot');
  const aiTradeCount = scannerBot ? scannerBot.totalTrades : 0;

  const bestPerformingBots = [...performanceData]
    .filter(b => b.totalTrades > 0)
    .sort((a, b) => b.winRate - a.winRate || b.daily - a.daily)
    .slice(0, 3);

  useEffect(() => {
    const fetchDynamicComment = async () => {
      if (performanceData.length === 0) return;

      const topBot = bestPerformingBots[0]?.name || "otivo-strategy Over 2";
      const statsSummary = `Daily: ${totalDaily.toFixed(2)}, Weekly: ${totalWeekly.toFixed(2)}, Monthly: ${totalMonthly.toFixed(2)}. Top Bot: ${topBot}.`;
      
      const comment = await generateDynamicMessage(
        `Generate a short, professional, and highly motivational trading performance commentary for ${userIdentity}. 
         Stats: ${statsSummary}. 
         Use relevant emojis (e.g., 🚀, 📈 for wins; 💪, 🛡️ for losses). 
         If profit is positive, celebrate the success. If negative, provide a strong motivational boost to keep going and refine the strategy. 
         Keep it under 30 words and make it feel fresh and different each time.`
      );

      if (comment) {
        setDynamicComment(comment);
      }
    };

    fetchDynamicComment();
    
    // Refresh comment every 5 minutes
    const interval = setInterval(fetchDynamicComment, 300000);
    return () => clearInterval(interval);
  }, [performanceData.length]);

  const getPerformanceComment = () => {
    if (dynamicComment) return dynamicComment;

    const topBot = bestPerformingBots[0]?.name || "otivo-strategy Over 2";
    
    if (totalMonthly > 0) {
      return `Great performance this month, ${userIdentity}! Your strategies are yielding solid results.`;
    } else if (totalMonthly < 0) {
      return `Tough market, ${userIdentity}. I recommend reviewing the ${topBot}.`;
    } else {
      return `Welcome back, ${userIdentity}! Analyzing your recent trades... Ready to launch your first bot?`;
    }
  };

  const handleClearBotHistory = (botId: string) => {
    try {
      const historyJson = localStorage.getItem('bot_performance_history');
      const history: TradeHistory[] = historyJson ? JSON.parse(historyJson) : [];
      const updatedHistory = history.filter(t => t.botId !== botId);
      localStorage.setItem('bot_performance_history', JSON.stringify(updatedHistory));
      calculatePerformance();
      setConfirmingBotId(null);
    } catch (e) {
      console.error('Error clearing bot history:', e);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0e0e0e] text-white custom-scrollbar">
      {/* Sticky Header Section */}
      <div className="sticky top-0 z-20 bg-[#0e0e0e] px-4 md:px-6 lg:px-12 pt-4 border-b border-[#2d2f2f]/30">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-end mb-2">
            <button 
              onClick={() => setIsHeaderVisible(!isHeaderVisible)}
              className="p-1.5 hover:bg-[#2d2f2f] rounded-lg transition-colors text-[#aaaaaa] hover:text-white flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
              title={isHeaderVisible ? "Hide Header" : "Show Header"}
            >
              {isHeaderVisible ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              {isHeaderVisible ? "Hide" : "Show Stats"}
            </button>
          </div>

          <AnimatePresence>
            {isHeaderVisible && (
              <motion.header 
                initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                animate={{ height: 'auto', opacity: 1, marginBottom: 48 }}
                exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 pb-4">
                  <div>
                    <h1 className="text-2xl md:text-4xl font-bold mb-2 md:mb-4 flex items-center">
                      {greetingPrefix}, <span className="text-[#ff444f] ml-2">{userIdentity}</span>
                    </h1>
                    <div className="flex items-center gap-4 text-[#aaaaaa] text-sm md:text-base mb-2">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={14} className="text-[#ff444f]" />
                        {currentTime.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock size={14} className="text-[#ff444f]" />
                        {currentTime.toLocaleTimeString()}
                      </div>
                    </div>
                    <p className="text-[#aaaaaa] text-sm md:text-lg max-w-2xl">
                      {getPerformanceComment()}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 md:gap-4">
                    <div className="bg-[#151717] border border-[#2d2f2f] rounded-lg md:rounded-xl p-2 md:p-4 min-w-[80px] md:min-w-[120px]">
                      <span className="text-[8px] md:text-[10px] text-[#666666] uppercase font-bold block mb-0.5 md:mb-1">Daily</span>
                      <span className={cn("text-xs md:text-lg font-bold", totalDaily >= 0 ? "text-[#00a79e]" : "text-[#ff444f]")}>
                        {totalDaily >= 0 ? '+' : ''}{totalDaily.toFixed(2)}
                      </span>
                    </div>
                    <div className="bg-[#151717] border border-[#2d2f2f] rounded-lg md:rounded-xl p-2 md:p-4 min-w-[80px] md:min-w-[120px]">
                      <span className="text-[8px] md:text-[10px] text-[#666666] uppercase font-bold block mb-0.5 md:mb-1">Weekly</span>
                      <span className={cn("text-xs md:text-lg font-bold", totalWeekly >= 0 ? "text-[#00a79e]" : "text-[#ff444f]")}>
                        {totalWeekly >= 0 ? '+' : ''}{totalWeekly.toFixed(2)}
                      </span>
                    </div>
                    <div className="bg-[#151717] border border-[#2d2f2f] rounded-lg md:rounded-xl p-2 md:p-4 min-w-[80px] md:min-w-[120px]">
                      <span className="text-[8px] md:text-[10px] text-[#666666] uppercase font-bold block mb-0.5 md:mb-1">Monthly</span>
                      <span className={cn("text-xs md:text-lg font-bold", totalMonthly >= 0 ? "text-[#00a79e]" : "text-[#ff444f]")}>
                        {totalMonthly >= 0 ? '+' : ''}{totalMonthly.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* AI Scanner Highlights */}
                <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-1 bg-gradient-to-br from-[#1a1c2e] to-[#111217] border border-indigo-500/30 rounded-2xl p-6 relative overflow-hidden group shadow-lg flex flex-col justify-between">
                    <div className="absolute -right-4 -top-4 w-20 h-20 bg-indigo-500/10 blur-2xl rounded-full group-hover:bg-indigo-500/20 transition-all" />
                    <div className="relative space-y-1">
                      <div className="flex items-center gap-2 text-indigo-400 mb-2">
                        <Zap size={16} fill="currentColor" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">AI Intelligence</span>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between items-end border-b border-white/5 pb-2">
                          <span className="text-[9px] font-black text-[#555] uppercase tracking-widest leading-none">Daily</span>
                          <span className={cn("text-lg font-black tracking-tighter leading-none", (scannerBot?.daily || 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                            {(scannerBot?.daily || 0) >= 0 ? '+' : ''}{(scannerBot?.daily || 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between items-end border-b border-white/5 pb-2">
                          <span className="text-[9px] font-black text-[#555] uppercase tracking-widest leading-none">Weekly</span>
                          <span className={cn("text-sm font-black tracking-tighter leading-none", (scannerBot?.weekly || 0) >= 0 ? "text-white" : "text-rose-400")}>
                            {(scannerBot?.weekly || 0) >= 0 ? '+' : ''}{(scannerBot?.weekly || 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between items-end">
                          <span className="text-[9px] font-black text-[#555] uppercase tracking-widest leading-none">Monthly</span>
                          <span className={cn("text-sm font-black tracking-tighter leading-none", (scannerBot?.monthly || 0) >= 0 ? "text-indigo-400" : "text-rose-400")}>
                            {(scannerBot?.monthly || 0) >= 0 ? '+' : ''}{(scannerBot?.monthly || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                       <span className="text-[8px] font-black text-[#555] uppercase tracking-widest leading-none">Total Trades</span>
                       <span className="text-[8px] font-black text-white uppercase tracking-widest leading-none">{aiTradeCount} Exp.</span>
                    </div>
                  </div>

                  <div className="md:col-span-3 bg-[#111217] border border-[#2d2f2f] rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden relative">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-black text-white tracking-tight uppercase tracking-widest">Scanner Intelligence Status</h4>
                      <p className="text-xs text-[#aaaaaa] max-w-lg">
                        Trades executed via the High-Speed digit-diff scanner. Performance is tracked separately to evaluate AI-driven market intelligence effectiveness.
                      </p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <span className="text-[8px] font-black text-[#555] uppercase tracking-widest block mb-1">AI Win Rate</span>
                        <span className="text-xl font-black text-emerald-400 tracking-tighter">
                          {scannerBot ? scannerBot.winRate.toFixed(1) : '0.0'}%
                        </span>
                      </div>
                      <div className="h-10 w-[1px] bg-[#2d2f2f]" />
                      <div className="text-right">
                        <span className="text-[8px] font-black text-[#555] uppercase tracking-widest block mb-1">Last Sync</span>
                        <span className="text-xl font-black text-white tracking-tighter">
                          {scannerBot?.lastUsed ? new Date(scannerBot.lastUsed).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.header>
            )}
          </AnimatePresence>

          <div className="flex flex-col md:flex-row gap-3 md:gap-4 pb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666666]" size={18} />
              <input 
                type="text" 
                placeholder="Search bots..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#151717] border border-[#2d2f2f] rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#ff444f] transition-colors"
              />
            </div>
            <div className="flex gap-2">
              {(['all', 'pre-built', 'saved'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={cn(
                    "px-4 py-2.5 rounded-lg text-sm font-bold capitalize transition-all",
                    filterType === type 
                      ? "bg-[#ff444f] text-white" 
                      : "bg-[#151717] border border-[#2d2f2f] text-[#aaaaaa] hover:text-white"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content Section */}
      <div className="px-4 md:px-6 lg:px-12 py-8 pb-[120px] md:pb-8">
        <div className="max-w-7xl mx-auto">
          {bestPerformingBots.length > 0 && (
            <div className="mb-12">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <TrendingUp className="text-[#00a79e]" size={20} />
                Top Performing Strategies
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {bestPerformingBots.map((bot) => (
                  <div key={bot.id} className="bg-[#151717] border border-[#00a79e]/30 rounded-xl p-5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                      <TrendingUp size={48} className="text-[#00a79e]" />
                    </div>
                    <h3 className="font-bold text-lg mb-1 truncate pr-8">{bot.name}</h3>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-[#00a79e]/10 text-[#00a79e] border border-[#00a79e]/20">
                        Top Performer
                      </span>
                    </div>
                    <div className="flex justify-between items-end">
                      <div>
                        <span className="text-[10px] text-[#666666] uppercase font-bold block mb-1">Win Rate</span>
                        <span className="text-2xl font-bold text-[#00a79e]">{bot.winRate.toFixed(0)}%</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-[#666666] uppercase font-bold block mb-1">Daily Profit</span>
                        <span className={cn("text-lg font-bold", bot.daily >= 0 ? "text-[#00a79e]" : "text-[#ff444f]")}>
                          {bot.daily >= 0 ? '+' : ''}{bot.daily.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Activity className="animate-spin text-[#ff444f] mr-3" />
              <span className="text-[#aaaaaa]">Calculating performance data...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredData.length > 0 ? (
                filteredData.map((bot, idx) => (
                <motion.div
                  key={bot.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="bg-[#151717] border border-[#2d2f2f] rounded-xl p-6 hover:border-[#ff444f]/30 transition-all group"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                    <div className="flex items-center gap-4 min-w-[250px]">
                      <div className={cn(
                        "p-3 rounded-lg bg-[#0e0e0e]",
                        bot.type === 'pre-built' ? "text-[#00a79e]" : "text-[#ff444f]"
                      )}>
                        {bot.type === 'pre-built' ? <Zap size={24} /> : <Bot size={24} />}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold group-hover:text-[#ff444f] transition-colors">
                          {bot.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-[#0e0e0e] text-[#666666] border border-[#2d2f2f]">
                            {bot.type}
                          </span>
                          {bot.lastUsed ? (
                            <span className="text-[10px] text-[#666666] flex items-center">
                              <Clock size={10} className="mr-1" />
                              Last used: {new Date(bot.lastUsed).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-[10px] text-orange-500 font-bold uppercase tracking-wider">
                              Not Used
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-[#0e0e0e] p-3 rounded-lg border border-[#2d2f2f]">
                        <span className="text-[10px] text-[#666666] uppercase font-bold block mb-1">Daily</span>
                        <div className="flex items-center gap-1">
                          {bot.daily !== 0 ? (
                            bot.daily > 0 ? <ArrowUpRight size={14} className="text-[#00a79e]" /> : <ArrowDownRight size={14} className="text-[#ff444f]" />
                          ) : null}
                          <span className={cn("font-bold", bot.daily > 0 ? "text-[#00a79e]" : bot.daily < 0 ? "text-[#ff444f]" : "text-[#666666]")}>
                            {bot.daily === 0 ? '0.00' : `${bot.daily > 0 ? '+' : ''}${bot.daily.toFixed(2)}`}
                          </span>
                        </div>
                      </div>
                      <div className="bg-[#0e0e0e] p-3 rounded-lg border border-[#2d2f2f]">
                        <span className="text-[10px] text-[#666666] uppercase font-bold block mb-1">Weekly</span>
                        <div className="flex items-center gap-1">
                          {bot.weekly !== 0 ? (
                            bot.weekly > 0 ? <ArrowUpRight size={14} className="text-[#00a79e]" /> : <ArrowDownRight size={14} className="text-[#ff444f]" />
                          ) : null}
                          <span className={cn("font-bold", bot.weekly > 0 ? "text-[#00a79e]" : bot.weekly < 0 ? "text-[#ff444f]" : "text-[#666666]")}>
                            {bot.weekly === 0 ? '0.00' : `${bot.weekly > 0 ? '+' : ''}${bot.weekly.toFixed(2)}`}
                          </span>
                        </div>
                      </div>
                      <div className="bg-[#0e0e0e] p-3 rounded-lg border border-[#2d2f2f]">
                        <span className="text-[10px] text-[#666666] uppercase font-bold block mb-1">Monthly</span>
                        <div className="flex items-center gap-1">
                          {bot.monthly !== 0 ? (
                            bot.monthly > 0 ? <ArrowUpRight size={14} className="text-[#00a79e]" /> : <ArrowDownRight size={14} className="text-[#ff444f]" />
                          ) : null}
                          <span className={cn("font-bold", bot.monthly > 0 ? "text-[#00a79e]" : bot.monthly < 0 ? "text-[#ff444f]" : "text-[#666666]")}>
                            {bot.monthly === 0 ? '0.00' : `${bot.monthly > 0 ? '+' : ''}${bot.monthly.toFixed(2)}`}
                          </span>
                        </div>
                      </div>
                      <div className="bg-[#0e0e0e] p-3 rounded-lg border border-[#2d2f2f]">
                        <span className="text-[10px] text-[#666666] uppercase font-bold block mb-1">Win Rate</span>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-[#2d2f2f] rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[#00a79e]" 
                              style={{ width: `${bot.winRate}%` }}
                            />
                          </div>
                          <span className="font-bold text-xs">{bot.winRate.toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 lg:pl-6 lg:border-l lg:border-[#2d2f2f]">
                      <div className="text-right">
                        <span className="text-[10px] text-[#666666] uppercase font-bold block mb-1">Total Trades</span>
                        <span className="text-xl font-bold">{bot.totalTrades}</span>
                      </div>
                      
                      {confirmingBotId === bot.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleClearBotHistory(bot.id)}
                            className="px-2 py-1 bg-[#ff444f] text-white text-[10px] font-bold rounded hover:bg-[#ff444f]/90 transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmingBotId(null)}
                            className="px-2 py-1 bg-[#2d2f2f] text-[#aaaaaa] text-[10px] font-bold rounded hover:text-white transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmingBotId(bot.id)}
                          className="p-2 text-[#666666] hover:text-[#ff444f] hover:bg-[#ff444f]/10 rounded-lg transition-all"
                          title="Clear History"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="bg-[#151717] border border-[#2d2f2f] rounded-xl p-20 text-center">
                <Bot size={48} className="mx-auto mb-4 text-[#2d2f2f]" />
                <h3 className="text-xl font-bold mb-2">No bots found</h3>
                <p className="text-[#666666]">Try adjusting your search or filter to find what you're looking for.</p>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
});
