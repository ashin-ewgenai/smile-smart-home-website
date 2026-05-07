import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Calculator, 
  Zap, 
  Leaf, 
  TrendingUp, 
  IndianRupee, 
  Home, 
  Cpu, 
  ArrowRight
} from 'lucide-react';
import { useDeviceRecommendations } from '../hooks/useDeviceRecommendations';
import { DevicesProvider } from '../contexts/DevicesContext';
import { AuthModeProvider } from '../contexts/AuthModeContext';
import { SavingsBreakdownPieChart } from './SavingsBreakdownPieChart';
import { SavingsComparisonCards } from './SavingsComparisonCards';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

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
      const calculateEnergySavings = httpsCallable(functions, 'calculateEnergySavings');
      await calculateEnergySavings({
        monthlyBill: inputs.monthlyBill,
        homeSize: inputs.homeSize,
        applianceCount: inputs.applianceCount
      });
      calculateSavings(inputs.monthlyBill, inputs.homeSize, inputs.applianceCount);
    } catch (err) {
      console.error('Calculation failed:', err);
      calculateSavings(inputs.monthlyBill, inputs.homeSize, inputs.applianceCount);
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 md:py-20">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal/10 text-teal border border-teal/20 text-xs font-bold uppercase tracking-widest mb-6">
          <Zap size={14} className="animate-pulse" />
          Live Savings Calculator
        </div>
        <h1 className="text-4xl md:text-display font-black text-slate-900 dark:text-white mb-6 leading-tight">
          Watch Your Bills <span className="bg-gradient-to-r from-teal to-blue-500 bg-clip-text text-transparent italic">Shrink.</span>
        </h1>
        <p className="text-slate-500 dark:text-gray-400 text-lg max-w-2xl mx-auto">
          Input your current energy usage and see how Smile's AI-driven smart devices can optimize your home efficiency.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Col: Inputs */}
        <div className="lg:col-span-5 glass-surface rounded-[2rem] p-8 md:p-10 relative overflow-hidden">
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
              {isCalculating ? "Recalculating..." : "Generate Accuracy Report"}
              {!isCalculating && <ArrowRight size={20} />}
            </button>
          </div>
        </div>

        {/* Right Col: Results */}
        <div className="lg:col-span-7">
          <div className="bg-white dark:bg-charcoal/40 backdrop-blur-3xl rounded-[2rem] p-8 md:p-12 text-slate-900 dark:text-white shadow-2xl relative overflow-hidden h-full flex flex-col border border-white/40 dark:border-white/10">
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center flex-1">
              <div>
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
                      <div className="text-lg font-black">{savingsData?.co2Reduction || '0'} kg CO2</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                      <TrendingUp size={24} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">ROI</div>
                      <div className="text-lg font-black">{savingsData?.roiMonths || '0'} Months</div>
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

            <div className="mt-8 pt-8 border-t border-slate-100 dark:border-white/10">
              {isMounted ? (
                <SavingsComparisonCards 
                  currentBill={savingsData?.monthlyCurrent || inputs.monthlyBill} 
                  optimizedBill={savingsData?.monthlyOptimized || inputs.monthlyBill} 
                />
              ) : (
                <div className="grid grid-cols-2 gap-4 h-24 bg-slate-50 dark:bg-white/5 rounded-2xl animate-pulse"></div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const EnergySavingsCalculator: React.FC = () => {
  return <CalculatorContent />;
};
