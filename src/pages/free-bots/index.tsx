import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Download, Zap, TrendingUp, TrendingDown, Hash, Percent, ArrowUpRight, ArrowDownRight, Activity, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

const STORAGE_KEY = 'bot_builder_persistent_workspace';

const BOTS = [
  {
    id: 'AUTO C4',
    name: 'AUTO C4 Strategy',
    description: 'A simple strategy that consistently purchases Under 9 contracts.',
    icon: TrendingDown,
    color: 'text-green-500',
    xmlUrl: '/bots/auto_c4_otivo.xml'
  },
  {
    id: 'Accumulator',
    name: 'Accumulator Barrier',
    description: 'A simple strategy that consistently purchases Accumulator contracts.',
    icon: TrendingUp,
    color: 'text-red-500',
    xmlUrl: '/bots/accumulator_barrier.xml'
  },
  {
    id: 'matches',
    name: 'Digit Matches',
    description: 'Predicts that the last digit will match your prediction.',
    icon: Hash,
    color: 'text-blue-500',
    xmlUrl: '/bots/matches_bot.xml'
  },
  {
    id: 'differs',
    name: 'Digit Differs',
    description: 'Predicts that the last digit will differ from your prediction.',
    icon: Activity,
    color: 'text-purple-500',
    xmlUrl: '/bots/differs_bot.xml'
  },
  {
    id: 'Over 2',
    name: 'Over 2 pro',
    description: 'Analyzes that If the last digits will be 0,1,2. If it is, it buys an Over 2 contract.',
    icon: Percent,
    color: 'text-green-500',
    xmlUrl: '/bots/over_2_pro.xml'
  },
  {
    id: 'Differ_Accumulator BB',
    name: 'Differ Accumulator BB',
    description: 'Trades Accumulator using price Barrier then after loss it uses Digit Differs.',
    icon: ArrowDownRight,
    color: 'text-orange-500',
    xmlUrl: '/bots/Differ_Accumulator_BB.xml'
  },
  {
    id: 'even',
    name: 'Digit Even',
    description: 'Predicts that the last digit will be an even number.',
    icon: Percent,
    color: 'text-indigo-500',
    xmlUrl: '/bots/even_odd.xml'
  },
  {
    id: 'Hybrid bot',
    name: 'Hybrid Bot',
    description: 'This switches different contract types.',
    icon: Hash,
    color: 'text-pink-500',
    xmlUrl: '/bots/hybrid-strategy.xml'
  },
  {
    id: 'Accumulator 2 consecutive knocks',
    name: 'Accumulator 2 Consecutive Knock out',
    description: 'Uses accumulator contracts using price barrier analysis.',
    icon: Zap,
    color: 'text-cyan-500',
    xmlUrl: '/bots/accumulator_2_consecutive_knocks.xml'
  },
  {
    id: 'Even_Odd Counter',
    name: 'Even_Odd Counter',
    description: 'A more advanced Even_Odd Counter Strategy.',
    icon: Activity,
    color: 'text-emerald-500',
    xmlUrl: '/bots/Even_Odd_Counter.xml'
  }
];

export default function ReadyBots() {
  const navigate = useNavigate();
  const [userBots, setUserBots] = React.useState<any[]>([]);

  React.useEffect(() => {
    const saved = localStorage.getItem('user_ready_bots');
    if (saved) {
      try {
        setUserBots(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse user bots', e);
      }
    }
  }, []);

  const handleImport = async (xmlUrl: string) => {
    try {
      const response = await fetch(xmlUrl);
      if (!response.ok) throw new Error('Failed to fetch bot XML');
      const xmlText = await response.text();
      
      // Save to localStorage for BotBuilder to pick up
      localStorage.setItem(STORAGE_KEY, xmlText);
      localStorage.setItem('loaded_bot_info', JSON.stringify({ id: xmlUrl, name: BOTS.find(b => b.xmlUrl === xmlUrl)?.name || 'Pre-built Strategy' }));
      
      // Navigate to Bot Builder (root page)
      navigate('/');
    } catch (error) {
      console.error('Error importing bot:', error);
      alert('Failed to import bot. Please try again.');
    }
  };

  const handleImportXml = (bot: any) => {
    localStorage.setItem(STORAGE_KEY, bot.xml);
    localStorage.setItem('loaded_bot_info', JSON.stringify({ id: bot.id, name: bot.name }));
    navigate('/');
  };

  const deleteUserBot = (id: string) => {
    const updated = userBots.filter(b => b.id !== id);
    setUserBots(updated);
    localStorage.setItem('user_ready_bots', JSON.stringify(updated));
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0e0e0e] text-white p-4 md:p-6 lg:p-12 pb-[120px] md:pb-12 custom-scrollbar">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 md:mb-12">
          <h1 className="text-3xl md:text-4xl font-bold mb-3 md:mb-4">Ready Bots</h1>
          <p className="text-[#aaaaaa] text-lg max-w-2xl">
            Choose from our collection of pre-built strategies or your own saved bots. Click "Import" to load any bot directly into the Bot Builder.
          </p>
        </header>

        {userBots.length > 0 && (
          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-8 flex items-center">
              <Zap className="mr-3 text-[#ff444f]" />
              Your Saved Bots
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {userBots.map((bot, idx) => (
                <motion.div
                  key={bot.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-[#151717] border border-[#2d2f2f] rounded-xl p-6 hover:border-[#ff444f]/50 transition-all group relative"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 rounded-lg bg-[#0e0e0e] text-[#ff444f]">
                      <Activity size={24} />
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => deleteUserBot(bot.id)}
                        className="p-2 text-[#666666] hover:text-red-500 transition-colors"
                        title="Delete Bot"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        onClick={() => handleImportXml(bot)}
                        className="flex items-center space-x-2 bg-[#ff444f] hover:bg-[#ff444f]/90 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                      >
                        <Play size={16} />
                        <span>Import</span>
                      </button>
                    </div>
                  </div>
                  
                  <h3 className="text-xl font-bold mb-2 group-hover:text-[#ff444f] transition-colors">
                    {bot.name}
                  </h3>
                  <p className="text-[#aaaaaa] text-sm leading-relaxed">
                    {bot.description || 'Custom saved strategy'}
                  </p>

                  <div className="mt-6 pt-6 border-t border-[#2d2f2f] flex items-center justify-between text-xs text-[#666666]">
                    <span className="flex items-center">
                      <TrendingUp size={12} className="mr-1" />
                      Saved on {new Date(bot.timestamp).toLocaleDateString()}
                    </span>
                    <span className="bg-[#0e0e0e] px-2 py-1 rounded border border-[#2d2f2f]">
                      User Bot
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        <h2 className="text-2xl font-bold mb-8 flex items-center">
          <TrendingUp className="mr-3 text-[#00a79e]" />
          Pre-built Strategies
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {BOTS.map((bot, idx) => {
            const Icon = bot.icon;
            return (
              <motion.div
                key={bot.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-[#151717] border border-[#2d2f2f] rounded-xl p-6 hover:border-[#ff444f]/50 transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-lg bg-[#0e0e0e] ${bot.color}`}>
                    <Icon size={24} />
                  </div>
                  <button
                    onClick={() => handleImport(bot.xmlUrl)}
                    className="flex items-center space-x-2 bg-[#ff444f] hover:bg-[#ff444f]/90 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                  >
                    <Download size={16} />
                    <span>Import</span>
                  </button>
                </div>
                
                <h3 className="text-xl font-bold mb-2 group-hover:text-[#ff444f] transition-colors">
                  {bot.name}
                </h3>
                <p className="text-[#aaaaaa] text-sm leading-relaxed">
                  {bot.description}
                </p>

                <div className="mt-6 pt-6 border-t border-[#2d2f2f] flex items-center justify-between text-xs text-[#666666]">
                  <span className="flex items-center">
                    <Activity size={12} className="mr-1" />
                    Verified Strategy
                  </span>
                  <span className="bg-[#0e0e0e] px-2 py-1 rounded border border-[#2d2f2f]">
                    XML format
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
