import React, { useEffect, useRef, createContext, useContext, useState } from 'react';
import { DevicesProvider, useDevices } from '../contexts/DevicesContext';
import { DeviceRecommendationsForm } from './DeviceRecommendationsForm';
import { PersonalityQuiz } from './PersonalityQuiz';
import { TrendingUp, Sparkles, CheckCircle, Info, AlertCircle, X, Heart, Zap, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { AuthModeProvider, useAuthMode } from '../contexts/AuthModeContext';
import AdminRevenueDashboard from './AdminRevenueDashboard';
import { useDeviceRecommendations } from '../hooks/useDeviceRecommendations';
import { quoteTemplates } from '../data/quoteTemplates';

type RecommendationTab = 'personality-quiz' | 'consultant' | 'revenue';

const WrapperContent: React.FC = () => {
  const { recommendations, visualizationData, showNotification, hideNotification, notification, error, isAdmin } = useDevices();
  const { selectedTemplateId, applyTemplate } = useDeviceRecommendations();
  const modalRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<RecommendationTab>('personality-quiz');

  useEffect(() => {
    if (notification.isOpen && notification.mode === 'modal') {
      const previouslyFocused = document.activeElement as HTMLElement;
      modalRef.current?.focus();
      return () => {
        previouslyFocused?.focus();
      };
    }
  }, [notification.isOpen, notification.mode]);
  
  useEffect(() => {
    if (error) {
       showNotification({
         message: error,
         type: 'error'
       });
    }
  }, [error, showNotification]);

  // Standardized Variants (Inlined)
  const snackbarVariants = {
    hidden: { opacity: 0, x: 60, scale: 0.8, rotate: 5 },
    visible: { 
      opacity: 1, 
      x: 0, 
      scale: 1,
      rotate: 0,
      transition: { 
        type: 'spring', 
        damping: 16, 
        stiffness: 280,
        mass: 0.8
      }
    },
    exit: { 
      opacity: 0, 
      scale: 0.85, 
      x: 30, 
      transition: { duration: 0.25, ease: 'easeIn' } 
    }
  };

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 }
  };

  return (
    <div className="relative">

      {selectedTemplateId && activeTab === 'consultant' && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto px-4 mb-4"
        >
          <div className="bg-teal-500/10 border border-teal-500/20 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500 flex items-center justify-center text-white shadow-lg shadow-teal-500/20">
                <Sparkles size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-teal-900 dark:text-teal-100">
                  Quick Bundle Active: {quoteTemplates.find(t => t.id === selectedTemplateId)?.name}
                </h4>
                <p className="text-xs text-teal-700/70 dark:text-teal-300/60">
                  Customizing from the {quoteTemplates.find(t => t.id === selectedTemplateId)?.name.toLowerCase()}...
                </p>
              </div>
            </div>
            <button 
              onClick={() => applyTemplate('')}
              className="px-3 py-1.5 bg-white dark:bg-charcoal text-teal-600 rounded-lg text-xs font-bold border border-teal-500/20 hover:bg-teal-50 transition-colors"
            >
              Clear Template
            </button>
          </div>
        </motion.div>
      )}

      {/* Tab Switcher for Recommendation Tools */}
      <div className="max-w-4xl mx-auto px-4 mb-4">
        <div className="flex flex-wrap gap-2 md:flex-nowrap rounded-2xl bg-white dark:bg-charcoal p-1.5 shadow-lg border border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setActiveTab('personality-quiz')}
            className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'personality-quiz'
                ? 'bg-teal text-white shadow-md'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Heart size={18} />
            Personality Quiz
          </button>
          
          <button
            onClick={() => setActiveTab('consultant')}
            className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'consultant'
                ? 'bg-teal text-white shadow-md'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Sparkles size={18} />
            AI Consultant
          </button>


          {isAdmin && (
            <button
              onClick={() => setActiveTab('revenue')}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'revenue'
                  ? 'bg-teal text-white shadow-md'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border-l border-slate-100 dark:border-gray-800'
              }`}
            >
              <TrendingUp size={18} />
              Revenue Analytics
            </button>
          )}
        </div>
      </div>

      <div className="min-h-[400px]">
        <AnimatePresence mode="wait">
          {activeTab === 'personality-quiz' && (
            <motion.div
              key="personality-quiz"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <PersonalityQuiz />
            </motion.div>
          )}

          {activeTab === 'consultant' && (
            <motion.div
              key="consultant"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <DeviceRecommendationsForm forcedTab="consultant" />
            </motion.div>
          )}


          {activeTab === 'revenue' && (
            <motion.div
              key="revenue"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <div className="bg-white dark:bg-charcoal rounded-[3rem] p-6 shadow-2xl border border-slate-100 dark:border-gray-800">
                <AdminRevenueDashboard />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Promotional Banner for Savings Calculator */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5 }}
        className="max-w-4xl mx-auto px-4 mt-6 mb-12"
      >
        <a 
          href="/energy-calculator"
          className="block group relative overflow-hidden rounded-[2rem] p-8 bg-slate-900 text-white shadow-2xl transition-all hover:scale-[1.01]"
        >
          <div className="absolute top-0 right-0 p-8 text-teal opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110">
            <Zap size={100} />
          </div>
          
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal/20 text-teal border border-teal/20 text-[10px] font-black uppercase tracking-widest mb-4">
                <Sparkles size={12} />
                Exclusive Feature
              </div>
              <h3 className="text-2xl font-black mb-2 flex items-center justify-center md:justify-start gap-2">
                Calculate Real-Time Savings
                <ChevronRight size={24} className="text-teal group-hover:translate-x-1 transition-transform" />
              </h3>
              <p className="text-gray-400 text-sm max-w-md">
                Find out exactly how much you can save on your annual bills with Smile's AI auto-optimization.
              </p>
            </div>
            
            <div className="shrink-0 flex items-center justify-center w-20 h-20 rounded-2xl bg-teal text-white shadow-lg shadow-teal/20 group-hover:rotate-12 transition-transform">
              <TrendingUp size={40} />
            </div>
          </div>
        </a>
      </motion.div>

      {/* ── Global Notification UI (Strictly Top-Right) ── */}
      <AnimatePresence>
        {notification.isOpen && (
          <div className="fixed top-6 right-6 z-[10001] flex flex-col items-end gap-3 pointer-events-none">
            {notification.mode === 'snackbar' ? (
              <motion.div
                variants={snackbarVariants as any}
                initial="hidden"
                animate="visible"
                exit="exit"
                className={`
                  pointer-events-auto flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border
                  bg-white dark:bg-charcoal min-w-[320px] max-w-md
                  ${notification.type === 'error' ? 'border-red-500/20' : 'border-teal/20'}
                `}
              >
                <div className={`p-2 rounded-xl ${
                  notification.type === 'error' ? 'bg-red-500/10 text-red-500' :
                  notification.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' :
                  'bg-teal/10 text-teal'
                }`}>
                  {notification.type === 'error' && <AlertCircle size={20} />}
                  {notification.type === 'success' && <CheckCircle size={20} />}
                  {notification.type === 'info' && <Info size={20} />}
                  {notification.type === 'warning' && <AlertTriangle size={20} />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800 dark:text-white leading-tight">
                    {notification.message}
                  </p>
                </div>
                <button onClick={hideNotification} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={16} />
                </button>
              </motion.div>
            ) : (
              <div className="fixed inset-0 flex items-start justify-end p-6 pointer-events-none">
                <motion.div
                  variants={backdropVariants as any}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  onClick={hideNotification}
                  className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-auto"
                />
                <motion.div
                  ref={modalRef}
                  tabIndex={-1}
                  variants={snackbarVariants as any}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="relative w-full max-w-sm bg-white dark:bg-charcoal border border-gray-200 dark:border-gray-800 rounded-3xl shadow-2xl overflow-hidden mt-16 mr-0 pointer-events-auto focus:outline-none"
                >
                  <div className={`h-1.5 w-full ${
                    notification.type === 'error' ? 'bg-red-500' :
                    notification.type === 'success' ? 'bg-emerald-500' :
                    'bg-teal'
                  }`} />
                  <div className="p-8">
                    <div className="flex items-center gap-4 mb-6">
                      <div className={`p-3 rounded-2xl ${
                        notification.type === 'error' ? 'bg-red-500/10 text-red-500' :
                        notification.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' :
                        'bg-teal/10 text-teal'
                      }`}>
                        {notification.type === 'error' && <AlertCircle className="w-8 h-8" />}
                        {notification.type === 'success' && <CheckCircle className="w-8 h-8" />}
                      </div>
                      <h3 className="text-2xl font-black text-slate-800 dark:text-white leading-none">
                        {notification.title || 'Notification'}
                      </h3>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 text-lg leading-relaxed mb-8">
                      {notification.message}
                    </p>
                    <div className="flex justify-end">
                      <button
                        onClick={hideNotification}
                        className="px-8 py-3 rounded-xl font-bold bg-teal text-white hover:bg-teal/90 transition-all shadow-lg shadow-teal/20"
                      >
                        Got it
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const RecommendationsWrapper: React.FC = () => {
  return (
    <AuthModeProvider>
      <DevicesProvider>
        <WrapperContent />
      </DevicesProvider>
    </AuthModeProvider>
  );
};

