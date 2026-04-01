import React, { useEffect } from 'react';
import { DevicesProvider, useDevices } from '../contexts/DevicesContext';
import { DeviceRecommendationsForm } from './DeviceRecommendationsForm';
import { Activity, Shield, AlertTriangle, TrendingUp, TrendingDown, Users } from 'lucide-react';
import { motion } from 'framer-motion';

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
        transition={{ duration: 1.5, ease: "easeInOut" }}
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
  const { adminHealthStats, fetchAdminHealthOverview, uid } = useDevices();

  useEffect(() => {
    // Only fetch if the user is signed in
    if (uid) {
      fetchAdminHealthOverview();
    }
  }, [uid, fetchAdminHealthOverview]);

  // Don't show for guests or until stats load
  if (!uid || !adminHealthStats) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
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

export const RecommendationsWrapper: React.FC = () => {
  return (
    <DevicesProvider>
      <AdminOverview />
      <DeviceRecommendationsForm />
    </DevicesProvider>
  );
};

