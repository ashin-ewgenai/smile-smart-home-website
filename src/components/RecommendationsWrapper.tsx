import React, { useEffect, useRef, createContext, useContext, useState } from 'react';
import { DevicesProvider, useDevices } from '../contexts/DevicesContext';
import { DeviceRecommendationsForm } from './DeviceRecommendationsForm';
import { Activity, Shield, AlertTriangle, TrendingUp, TrendingDown, Users, Sparkles, CheckCircle, Info, AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Auth Mode Context for managing signin/signup toggle
type AuthMode = 'signin' | 'signup';

interface AuthModeContextType {
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  toggleAuthMode: () => void;
}

const AuthModeContext = createContext<AuthModeContextType | undefined>(undefined);

export function useAuthMode(): AuthModeContextType {
  const context = useContext(AuthModeContext);
  if (!context) {
    throw new Error('useAuthMode must be used within an AuthModeProvider');
  }
  return context;
}

/**
 * Custom SVG Sparkline for Health History
 */
const HealthSparkline: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 200;
  const height = 40;
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <motion.polyline
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, ease: "easeInOut" } as any}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className="opacity-30"
      />
    </svg>
  );
};

const AdminOverview: React.FC = () => {
  const { adminHealthStats, fetchAdminHealthOverview, uid, isAdmin } = useDevices();

  useEffect(() => {
    // Only fetch if the user is signed in
    if (uid) {
      fetchAdminHealthOverview();
    }
  }, [uid, fetchAdminHealthOverview]);

  // Don't show for guests, non-admins, or until stats load
  if (!uid || !isAdmin || !adminHealthStats) return null;

  // Standard entry variants
  const entryVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 10 },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: { type: 'spring', damping: 25, stiffness: 200 }
    }
  };

  return (
    <motion.div 
      variants={entryVariants as any}
      initial="hidden"
      animate="visible"
      className="max-w-4xl mx-auto px-4 mb-8"
    >
      <div className="bg-white dark:bg-charcoal rounded-3xl p-6 shadow-xl border border-slate-100 dark:border-gray-800 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        <div>
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Users size={16} />
            <span className="text-xs font-bold uppercase tracking-wider">Fleet Status</span>
          </div>
          <div className="text-3xl font-black text-slate-800 dark:text-white">
            {adminHealthStats.onlineCount}/{adminHealthStats.totalDevices}
            <span className="text-sm font-medium text-slate-400 ml-2">Devices Online</span>
          </div>
          <div className="flex items-center gap-1 mt-2 text-emerald-500">
            <TrendingUp size={14} />
            <span className="text-xs font-bold">+2.4% from yesterday</span>
          </div>
        </div>

        <div className="border-x border-slate-100 dark:border-gray-800 px-6">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Shield size={16} />
            <span className="text-xs font-bold uppercase tracking-wider">Avg Fleet Health</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-black text-teal">
              {adminHealthStats.aggregatedScore}%
            </div>
            <HealthSparkline data={[85, 82, 88, 84, 91, 89, 92]} color="#14b8a6" />
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl p-4 border border-amber-100 dark:border-amber-900/20">
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <AlertTriangle size={16} />
            <span className="text-xs font-bold uppercase tracking-wider">Pending Alerts</span>
          </div>
          <div className="text-2xl font-black text-amber-700 dark:text-amber-400">
            {adminHealthStats.alertCount} High Priority
          </div>
          <p className="text-[10px] text-amber-600/60 mt-1 uppercase font-bold">Proactive support recommended</p>
        </div>
      </div>
    </motion.div>
  );
};

const WrapperContent: React.FC = () => {
  const { recommendations, visualizationData, showNotification, hideNotification, notification, error } = useDevices();
  const modalRef = useRef<HTMLDivElement>(null);

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
      <AdminOverview />
      <DeviceRecommendationsForm />

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
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  
  const toggleAuthMode = () => {
    setAuthMode(prev => prev === 'signin' ? 'signup' : 'signin');
  };

  return (
    <AuthModeContext.Provider value={{ authMode, setAuthMode, toggleAuthMode }}>
      <DevicesProvider>
        <WrapperContent />
      </DevicesProvider>
    </AuthModeContext.Provider>
  );
};

