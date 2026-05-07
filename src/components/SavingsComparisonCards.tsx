import React from 'react';
import { motion } from 'framer-motion';
import { IndianRupee, Zap } from 'lucide-react';

interface SavingsComparisonCardsProps {
  currentBill: number;
  optimizedBill: number;
}

export const SavingsComparisonCards: React.FC<SavingsComparisonCardsProps> = ({ currentBill, optimizedBill }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
      {/* Current Bill */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="p-5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10"
      >
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Current Bill</div>
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold text-slate-400">₹</span>
          <span className="text-3xl font-black text-slate-600 dark:text-gray-300">{currentBill.toLocaleString()}</span>
        </div>
      </motion.div>

      {/* Optimized Bill */}
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="p-5 rounded-2xl bg-teal/5 border border-teal/20 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-4 text-teal opacity-10">
          <Zap size={40} />
        </div>
        <div className="text-[10px] font-black text-teal uppercase tracking-widest mb-2 flex items-center gap-2">
          New Monthly Bill
          <div className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold text-teal">₹</span>
          <span className="text-3xl font-black text-teal">{optimizedBill.toLocaleString()}</span>
        </div>
      </motion.div>
    </div>
  );
};
