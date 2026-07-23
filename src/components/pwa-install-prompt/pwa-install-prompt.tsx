import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

let hasInteractedGlobal = false;
let deferredPromptGlobal: any = null;

export const PWAInstallPrompt: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    const handler = (e: Event) => {
      if (hasInteractedGlobal) return;
      console.log('beforeinstallprompt event fired');
      e.preventDefault();
      deferredPromptGlobal = e;
      setIsReady(true);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Fallback/Engagement timer
    const timer = setTimeout(() => {
      if (hasInteractedGlobal) return;
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      if (!isStandalone) {
        setIsVisible(true);
      }
    }, 5000);

    // Auto-hide timer: If the prompt is visible, hide it after 15 seconds of no interaction
    let autoHideTimer: NodeJS.Timeout;
    if (isVisible && !hasInteractedGlobal) {
      autoHideTimer = setTimeout(() => {
        setIsVisible(false);
      }, 15000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      clearTimeout(timer);
      if (autoHideTimer) clearTimeout(autoHideTimer);
    };
  }, [isVisible]);

  const handleInstall = async () => {
    hasInteractedGlobal = true;
    
    if (isIOS) {
      alert('To install OTIVO AI on iOS: Tap the "Share" icon (square with arrow) and then select "Add to Home Screen".');
      setIsVisible(false);
      return;
    }

    if (deferredPromptGlobal) {
      deferredPromptGlobal.prompt();
      const { outcome } = await deferredPromptGlobal.userChoice;
      console.log(`User response to install: ${outcome}`);
      deferredPromptGlobal = null;
      setIsVisible(false);
    } else {
      alert('To install OTIVO AI, please use your browser menu (three dots ⋮) and select "Install app" or "Add to Home Screen".');
      setIsVisible(false);
    }
  };

  const handleDismiss = () => {
    hasInteractedGlobal = true;
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed inset-0 z-[99999] pointer-events-none flex items-end justify-center md:items-start md:justify-end p-4 md:p-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.8, x: 100, y: 100, rotate: 10 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 100, y: 100, rotate: 10 }}
            transition={{ type: "spring", damping: 20, stiffness: 150 }}
            className="pointer-events-auto bg-[#0a0a0a] rounded-[32px] md:rounded-[40px] p-6 md:p-8 w-full max-w-[400px] shadow-[0_20px_80px_rgba(255,68,79,0.25)] border border-white/10 relative overflow-hidden group"
          >
            {/* Background Effects */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#ff444f]/10 via-transparent to-[#00a79e]/5 opacity-50" />
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#ff444f]/20 blur-[60px] rounded-full group-hover:bg-[#ff444f]/30 transition-all duration-1000" />
            
            {/* Close Button */}
            <button 
              onClick={handleDismiss}
              className="absolute top-4 right-4 p-2 text-white/20 hover:text-white hover:bg-white/10 rounded-full transition-all z-10"
            >
              <X size={20} />
            </button>

            <div className="relative z-10">
              {/* Badge */}
              <div className="flex justify-center md:justify-start mb-6">
                <motion.div 
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="px-3 py-1 bg-[#ff444f] rounded-full shadow-[0_0_15px_rgba(255,68,79,0.4)]"
                >
                  <span className="text-white text-[10px] font-black uppercase tracking-widest">Official App</span>
                </motion.div>
              </div>

              <div className="flex flex-col md:flex-row items-center md:items-start gap-6 mb-8">
                {/* App Icon */}
                <div className="relative shrink-0">
                  <div className="absolute inset-0 bg-[#ff444f] blur-[15px] opacity-30 rounded-2xl" />
                  <div className="w-20 h-20 md:w-24 md:h-24 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] rounded-2xl md:rounded-3xl flex items-center justify-center relative border border-white/10 shadow-2xl overflow-hidden">
                    <img 
                      src="/app.png" 
                      alt="OTIVO AI" 
                      className="w-14 h-14 md:w-16 md:h-16 object-contain"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent" />
                  </div>
                </div>

                {/* Text Content */}
                <div className="text-center md:text-left">
                  <h2 className="text-white text-2xl md:text-3xl font-black tracking-tighter leading-none mb-2">
                    OTIVO AI
                  </h2>
                  <p className="text-gray-400 text-sm font-medium leading-tight mb-3">
                    Intelligent Automated Trading at your fingertips.
                  </p>
                  <div className="flex items-center justify-center md:justify-start gap-2">
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(i => (
                        <div key={i} className="w-3 h-3 bg-[#ff444f] rounded-full" style={{ clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' }} />
                      ))}
                    </div>
                    <span className="text-white/40 text-[10px] font-bold uppercase tracking-tighter">Top Rated</span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleInstall}
                className="w-full relative group/btn overflow-hidden bg-white text-black font-black py-4 px-6 rounded-2xl text-lg transition-all active:scale-95 shadow-[0_10px_30px_rgba(255,255,255,0.1)] hover:shadow-[0_10px_40px_rgba(255,68,79,0.3)]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#ff444f]/20 to-transparent -translate-x-full group-hover/btn:animate-shimmer" />
                <span className="relative flex items-center justify-center gap-3">
                  <Download size={20} />
                  INSTALL APP
                </span>
              </button>
              
              <p className="text-center text-white/20 text-[10px] mt-4 font-bold uppercase tracking-widest">
                Fast • Secure • Free
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
