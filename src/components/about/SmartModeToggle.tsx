import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SmartModeToggle: React.FC = () => {
  const [isSmartMode, setIsSmartMode] = useState(false);

  useEffect(() => {
    if (isSmartMode) {
      document.documentElement.classList.add('smart-mode');
    } else {
      document.documentElement.classList.remove('smart-mode');
    }
  }, [isSmartMode]);

  return (
    <div className="fixed bottom-8 right-8 z-50">
      <motion.button
        onClick={() => setIsSmartMode(!isSmartMode)}
        className={`relative w-48 h-14 rounded-full p-1 backdrop-blur-xl border border-white/20 shadow-2xl transition-all duration-500 ${
          isSmartMode ? 'bg-blue-600/20' : 'bg-teal/20'
        }`}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <div className="flex items-center justify-between px-4 h-full relative z-10">
          <span className={`text-xs font-bold transition-opacity duration-300 ${isSmartMode ? 'opacity-40' : 'opacity-100 text-teal'}`}>THE CRAFT</span>
          <span className={`text-xs font-bold transition-opacity duration-300 ${isSmartMode ? 'opacity-100 text-blue-400' : 'opacity-40'}`}>THE BRAIN</span>
        </div>
        
        <motion.div
          className={`absolute top-1 left-1 bottom-1 w-1/2 rounded-full shadow-lg ${
            isSmartMode ? 'bg-blue-500' : 'bg-teal'
          }`}
          animate={{ x: isSmartMode ? '90%' : '0%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      </motion.button>

      {/* Mode Status Indicator */}
      <AnimatePresence>
        {isSmartMode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-20 right-0 bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-2xl pointer-events-none"
          >
            GENAI ENGINE ACTIVE
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        :root.smart-mode {
          --color-soft-gray: #0f172a;
          --color-white: #020617;
          --color-charcoal: #f8fafc;
        }
        :root.smart-mode body {
          background-color: #020617;
          color: #f8fafc;
        }
        .smart-mode .glass-surface {
          background: rgba(30, 41, 59, 0.4) !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        .smart-mode .text-teal {
          color: #60a5fa !important;
        }
        .smart-mode .bg-teal {
          background-color: #3b82f6 !important;
        }
      `}} />
    </div>
  );
};

export default SmartModeToggle;
