import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  Wifi, 
  Battery, 
  AlertTriangle, 
  Clock, 
  ShieldCheck, 
  Zap, 
  CheckCircle2, 
  Loader2,
  AlertCircle,
  Cpu
} from 'lucide-react';
import { useDevices } from '../../../contexts/DevicesContext';

/** Returns a human-friendly relative time string */
function relativeTime(isoStr: string): string {
  try {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return 'unknown';
  }
}

/** Circular SVG progress ring for health score */
const ScoreRing: React.FC<{ score: number; color: string }> = ({ score, color }) => {
  const r = 24; 
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
      <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-slate-100 dark:text-gray-800" />
      <motion.circle
        cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
      />
    </svg>
  );
};

export const DeviceHealthDashboard: React.FC = () => {
  const { devices, loading, uid } = useDevices();

  if (!uid) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center text-center p-8">
        <div className="w-20 h-20 rounded-full bg-teal/10 flex items-center justify-center mb-6">
          <ShieldCheck className="text-teal" size={40} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Secure Access Required</h2>
        <p className="text-slate-500 max-w-sm">Please sign in to your Smile account to view your real-time device health and diagnostics.</p>
      </div>
    );
  }

  if (loading && devices.length === 0) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center text-center p-8">
        <Loader2 className="animate-spin text-teal mb-4" size={48} />
        <p className="text-slate-500 animate-pulse font-medium">Synchronizing with your Smart Home...</p>
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <Activity className="text-teal" />
            Device Health <span className="text-teal text-sm font-bold bg-teal/10 px-3 py-1 rounded-full">Live Telemetry</span>
          </h2>
          <p className="text-slate-500 mt-1">Real-time diagnostics and predictive maintenance forecasting.</p>
        </div>
        
        <div className="flex items-center gap-4 bg-white dark:bg-charcoal p-2 rounded-2xl border border-slate-100 dark:border-gray-800 shadow-sm">
          <div className="px-4 py-2 text-center">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Connected</div>
            <div className="text-xl font-black text-teal">{devices.filter(d => d.health?.status === 'Online').length}</div>
          </div>
          <div className="w-px h-8 bg-slate-100 dark:bg-gray-800" />
          <div className="px-4 py-2 text-center">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Attention</div>
            <div className="text-xl font-black text-amber-500">{devices.filter(d => (d.health?.score || 0) < 70).length}</div>
          </div>
        </div>
      </header>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        <AnimatePresence mode="popLayout">
          {devices.map((device) => {
            const health = device.health || { score: 0, status: 'Offline', batteryLevel: 0, signalStrength: -100, lastSeen: '', alerts: [], forecast: 'Unknown' };
            const isOnline = health.status === 'Online';
            const scoreColor = health.score > 85 ? '#10b981' : health.score > 60 ? '#f59e0b' : '#ef4444';
            
            return (
              <motion.div
                key={device.id}
                variants={itemVariants}
                layout
                className={`
                  relative overflow-hidden rounded-[2.5rem] p-6 border transition-all duration-500
                  ${isOnline 
                    ? 'bg-white dark:bg-charcoal border-slate-100 dark:border-gray-800 hover:shadow-2xl hover:shadow-teal/5' 
                    : 'bg-slate-50 dark:bg-gray-900/50 border-slate-200 dark:border-gray-800 grayscale-[0.5]'}
                `}
              >
                {/* Status Indicator */}
                <div className="absolute top-6 right-6 flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{health.status}</span>
                </div>

                <div className="flex items-start gap-5 mb-8">
                  <div className={`
                    w-16 h-16 rounded-3xl flex items-center justify-center shadow-inner
                    ${isOnline ? 'bg-teal/5 text-teal' : 'bg-slate-200 dark:bg-gray-800 text-slate-400'}
                  `}>
                    <Cpu size={32} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white truncate leading-tight">{device.deviceName || device.name}</h3>
                    <p className="text-xs text-slate-400 font-medium">{device.type} • {device.brand}</p>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                      <Clock size={12} />
                      Last sync: {relativeTime(health.lastSeen)}
                    </div>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-slate-50 dark:bg-gray-800/40 rounded-3xl p-4 border border-white/50 dark:border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <Battery size={14} className={health.batteryLevel < 20 ? 'text-red-500' : 'text-slate-400'} />
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Power</span>
                    </div>
                    <div className="text-xl font-black text-slate-900 dark:text-white">{health.batteryLevel}%</div>
                    <div className="w-full h-1 bg-slate-200 dark:bg-gray-700 rounded-full mt-2 overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${health.batteryLevel}%` }}
                        className={`h-full ${health.batteryLevel < 20 ? 'bg-red-500' : 'bg-teal'}`} 
                      />
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-gray-800/40 rounded-3xl p-4 border border-white/50 dark:border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <Wifi size={14} className="text-slate-400" />
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Signal</span>
                    </div>
                    <div className="text-xl font-black text-slate-900 dark:text-white">{health.signalStrength} <span className="text-[10px] text-slate-400">dBm</span></div>
                    <div className="flex gap-0.5 mt-2">
                      {[1, 2, 3, 4].map(b => (
                        <div key={b} className={`h-1 flex-1 rounded-full ${health.signalStrength > -60 ? 'bg-teal' : health.signalStrength > -80 ? 'bg-amber-500' : 'bg-red-500'} ${b > 3 ? 'opacity-30' : ''}`} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Score and Forecast Section */}
                <div className="flex items-center gap-6 p-5 bg-gradient-to-br from-slate-50 to-white dark:from-gray-800/50 dark:to-gray-800/20 rounded-[2rem] border border-slate-100 dark:border-gray-800 shadow-inner">
                  <div className="relative">
                    <ScoreRing score={health.score} color={scoreColor} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center pt-0.5">
                      <span className="text-base font-black leading-none text-slate-900 dark:text-white">{health.score}</span>
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                      <Zap size={10} className="text-amber-500" />
                      Predictive Forecast
                    </div>
                    <div className={`text-sm font-bold truncate ${health.forecast?.includes('Failure') ? 'text-red-500' : 'text-slate-700 dark:text-teal-400'}`}>
                      {health.forecast || 'Hardware Stable'}
                    </div>
                  </div>
                </div>

                {/* Alerts Footer */}
                <div className="mt-6 flex flex-wrap gap-2">
                  {health.alerts && health.alerts.length > 0 ? (
                    health.alerts.map((alert, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 bg-red-500/5 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-bold px-3 py-1.5 rounded-full border border-red-500/10">
                        <AlertCircle size={10} />
                        {alert}
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center gap-1.5 bg-emerald-500/5 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold px-3 py-1.5 rounded-full border border-emerald-500/10">
                      <CheckCircle2 size={10} />
                      Zero Issues Detected
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {devices.length === 0 && !loading && (
        <div className="bg-slate-50 dark:bg-gray-800/50 rounded-[3rem] p-16 text-center border-2 border-dashed border-slate-200 dark:border-gray-800">
          <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-6">
            <Activity className="text-slate-300" size={40} />
          </div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">No Devices Registered</h3>
          <p className="text-slate-500 max-w-sm mx-auto">Complete your smart home setup to begin seeing real-time health data and predictive analytics here.</p>
        </div>
      )}
    </div>
  );
};
