import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calculator, 
  Zap, 
  Leaf, 
  TrendingUp, 
  IndianRupee, 
  Home, 
  Cpu, 
  ArrowRight,
  Info,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip,
  Sector
} from 'recharts';
import { useDeviceRecommendations } from '../hooks/useDeviceRecommendations';
import { useDevices } from '../contexts/DevicesContext';
import { SavingsBreakdownPieChart } from './SavingsBreakdownPieChart';
import { SavingsComparisonCards } from './SavingsComparisonCards';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

/**
 * Animated Gauge Component using Recharts and Framer Motion
 */
const SavingsGauge = ({ value, maxValue, label }: { value: number; maxValue: number; label: string }) => {
  const percentage = Math.min((value / maxValue) * 100, 100);
  const data = [
    { value: percentage, color: '#14b8a6' },
    { value: 100 - percentage, color: 'rgba(20, 184, 166, 0.1)' }
  ];

  return (
    <div className="relative w-full h-[300px] flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={80}
            outerRadius={100}
            startAngle={225}
            endAngle={-45}
            paddingAngle={0}
            dataKey="value"
            stroke="none"
            cornerRadius={10}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-5xl font-black text-teal drop-shadow-[0_0_15px_rgba(20,184,166,0.3)]">
          {percentage.toFixed(0)}%
        </span>
        <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">
          {label}
        </span>
      </div>

      <div className="absolute bottom-10 left-0 right-0 flex justify-between px-10 text-[10px] font-black text-slate-400 uppercase tracking-tighter">
        <span>0% Efficiency</span>
        <span>100% Optimized</span>
      </div>
    </div>
  );
};

const CalculatorContent: React.FC = () => {
  const [isMounted, setIsMounted] = useState(false);
  const { calculateSavings, savingsData } = useDeviceRecommendations();

  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  const [inputs, setInputs] = useState({
    monthlyBill: 5000,
    homeSize: 1500,
    applianceCount: 10
  });

  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    // Initial calculation
    if (typeof calculateSavings === 'function') {
      calculateSavings(inputs.monthlyBill, inputs.homeSize, inputs.applianceCount);
    }
  }, [calculateSavings]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numValue = Math.max(0, parseInt(value) || 0);
    setInputs(prev => ({ ...prev, [name]: numValue }));
  };

  const runCalculation = async () => {
    setIsCalculating(true);
    try {
      // Call backend for "Accuracy Report" as requested
      const calculateEnergySavings = httpsCallable(functions, 'calculateEnergySavings');
      const result = await calculateEnergySavings({
        monthlyBill: inputs.monthlyBill,
        homeSize: inputs.homeSize,
        applianceCount: inputs.applianceCount
      });
      
      console.log('Backend Savings Data:', result.data);
      // Local context will also update for real-time consistency
      calculateSavings(inputs.monthlyBill, inputs.homeSize, inputs.applianceCount);
    } catch (err) {
      console.error('Failed to fetch detailed accuracy report:', err);
      // Fallback to local calculation
      calculateSavings(inputs.monthlyBill, inputs.homeSize, inputs.applianceCount);
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 md:py-20">
      <div className="text-center mb-16">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal/10 text-teal border border-teal/20 text-xs font-bold uppercase tracking-widest mb-6"
        >
          <Zap size={14} className="animate-pulse" />
          Live Savings Calculator
        </motion.div>
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl md:text-display font-black text-slate-900 dark:text-white mb-6 leading-tight"
        >
          Watch Your Bills <span className="bg-gradient-to-r from-teal to-blue-500 bg-clip-text text-transparent italic">Shrink.</span>
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-slate-500 dark:text-gray-400 text-lg max-w-2xl mx-auto"
        >
          Input your current energy usage and see how Smile's AI-driven smart devices can optimize your home efficiency and reduce your carbon footprint.
        </motion.p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Col: Inputs */}
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-5 glass-surface rounded-[2rem] p-8 md:p-10 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-8 opacity-[0.03] dark:opacity-[0.05] pointer-events-none">
            <Calculator size={160} />
          </div>

          <h2 className="text-2xl font-black mb-8 text-slate-800 dark:text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-teal/10 text-teal flex items-center justify-center">
              <Calculator size={20} />
            </span>
            Usage Profile
          </h2>

          <div className="space-y-8 relative z-10">
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-bold text-slate-600 dark:text-gray-400 flex items-center gap-2 uppercase tracking-wide">
                  <IndianRupee size={16} className="text-teal" />
                  Monthly Bill (₹)
                </label>
                <span className="text-lg font-black text-teal">₹{inputs.monthlyBill}</span>
              </div>
              <input 
                type="range"
                name="monthlyBill"
                min="1000"
                max="50000"
                step="500"
                value={inputs.monthlyBill}
                onChange={handleInputChange}
                className="w-full h-1.5 bg-slate-100 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal border-none outline-none focus:ring-0"
              />
              <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase">Average urban home: ₹3,500 - ₹8,000</p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-bold text-slate-600 dark:text-gray-400 flex items-center gap-2 uppercase tracking-wide">
                  <Home size={16} className="text-teal" />
                  Home Size (sq.ft)
                </label>
                <span className="text-lg font-black text-teal">{inputs.homeSize}</span>
              </div>
              <input 
                type="range"
                name="homeSize"
                min="500"
                max="10000"
                step="100"
                value={inputs.homeSize}
                onChange={handleInputChange}
                className="w-full h-1.5 bg-slate-100 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal border-none outline-none focus:ring-0"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-bold text-slate-600 dark:text-gray-400 flex items-center gap-2 uppercase tracking-wide">
                  <Cpu size={16} className="text-teal" />
                  Appliance Count
                </label>
                <span className="text-lg font-black text-teal">{inputs.applianceCount}</span>
              </div>
              <input 
                type="range"
                name="applianceCount"
                min="1"
                max="50"
                step="1"
                value={inputs.applianceCount}
                onChange={handleInputChange}
                className="w-full h-1.5 bg-slate-100 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal border-none outline-none focus:ring-0"
              />
            </div>

            <button 
              onClick={runCalculation}
              disabled={isCalculating}
              className="w-full py-5 rounded-2xl bg-gradient-to-r from-teal to-blue-500 text-white font-black text-lg shadow-xl shadow-teal/30 hover:shadow-teal/40 transform hover:scale-[1.02] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {isCalculating ? (
                <>
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full"
                  />
                  Recalculating...
                </>
              ) : (
                <>
                  Generate Accuracy Report
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </div>
        </motion.div>

        {/* Right Col: Results */}
        <motion.div 
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-7"
        >
          <div className="bg-white dark:bg-charcoal/40 backdrop-blur-3xl rounded-[2rem] p-8 md:p-12 text-slate-900 dark:text-white shadow-2xl relative overflow-hidden h-full flex flex-col border border-white/40 dark:border-white/10">
            {/* Background Accent */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-teal/10 blur-[100px]" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-blue-600/10 blur-[100px]" />

            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center flex-1">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-white border border-slate-200 dark:border-white/10 text-[10px] font-black uppercase tracking-widest mb-8">
                  <TrendingUp size={12} className="text-teal" />
                  Projected Annual Efficiency
                </div>
                
                <h3 className="text-2xl font-black mb-2">Annual Savings</h3>
                <div className="text-6xl font-black text-teal mb-6 flex items-baseline gap-2">
                  <span className="text-3xl font-bold">₹</span>
                  {savingsData?.annualSavings?.toLocaleString() || '0'}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10">
                    <div className="w-12 h-12 rounded-xl bg-teal/10 text-teal flex items-center justify-center shrink-0">
                      <Leaf size={24} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Carbon Neutrality</div>
                      <div className="text-lg font-black">{savingsData?.co2Reduction || '0'} kg CO2 / year</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                      <TrendingUp size={24} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Return on Investment</div>
                      <div className="text-lg font-black">{savingsData?.roiMonths || '0'} Months Avg.</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center">
                {isMounted ? (
                  <SavingsBreakdownPieChart data={{
                    lightingSavings: savingsData?.lightingSavings || 0,
                    hvacSavings: savingsData?.hvacSavings || 0,
                    standbySavings: savingsData?.standbySavings || 0
                  }} />
                ) : (
                  <div className="w-full h-[240px] flex items-center justify-center">
                    <div className="w-32 h-32 rounded-full border-8 border-teal/10 animate-pulse"></div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom: Comparison Cards */}
            <div className="mt-8 pt-8 border-t border-slate-100 dark:border-white/10">
              {isMounted ? (
                <SavingsComparisonCards 
                  currentBill={savingsData?.monthlyCurrent || inputs.monthlyBill} 
                  optimizedBill={savingsData?.monthlyOptimized || inputs.monthlyBill} 
                />
              ) : (
                <div className="grid grid-cols-2 gap-4 h-24">
                  <div className="bg-slate-50 dark:bg-white/5 rounded-2xl animate-pulse"></div>
                  <div className="bg-slate-50 dark:bg-white/5 rounded-2xl animate-pulse"></div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Featured Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20">
        {[
          {
            icon: <Zap size={24} />,
            title: "Smart Lighting",
            description: "AI-driven scheduling can reduce lighting costs by up to 60% through presence detection."
          },
          {
            icon: <Home size={24} />,
            title: "Climate Control",
            description: "Smart thermostats learn your schedule to optimize HVAC usage, saving 20-30% on heating and cooling."
          },
          {
            icon: <Cpu size={24} />,
            title: "Standby Power",
            description: "Eliminate phantom energy drain from idle appliances with intelligent power management."
          }
        ].map((insight, idx) => (
          <motion.div 
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            viewport={{ once: true }}
            className="p-8 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 hover:border-teal/30 transition-colors group"
          >
            <div className="w-14 h-14 rounded-2xl bg-white dark:bg-white/10 text-teal flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform">
              {insight.icon}
            </div>
            <h4 className="text-xl font-black mb-3 text-slate-800 dark:text-white">{insight.title}</h4>
            <p className="text-sm text-slate-500 dark:text-gray-400 leading-relaxed">{insight.description}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export const EnergySavingsCalculator: React.FC = () => {
  return <CalculatorContent />;
};
