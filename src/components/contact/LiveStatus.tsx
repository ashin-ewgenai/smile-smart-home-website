import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, Users, Activity } from 'lucide-react';

const LiveStatus: React.FC = () => {
  const [responseTime, setResponseTime] = useState(5);
  const [activeExperts, setActiveExperts] = useState(5);

  // Simulate slight fluctuations in live data
  useEffect(() => {
    const interval = setInterval(() => {
      setResponseTime(prev => Math.max(3, Math.min(8, prev + (Math.random() > 0.5 ? 1 : -1))));
      setActiveExperts(prev => Math.max(3, Math.min(7, prev + (Math.random() > 0.7 ? 1 : -1))));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="inline-flex flex-wrap items-center gap-4 p-2 bg-white/50 dark:bg-gray-900/50 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
      {/* Live Heartbeat */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 rounded-xl border border-green-500/20">
        <div className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-green-600 dark:text-green-400">Live Team Status</span>
      </div>

      {/* Response Ticker */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Clock size={14} className="text-teal" />
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-charcoal dark:text-white uppercase leading-none">Avg. {responseTime}m</span>
          <span className="text-[8px] text-gray-500 uppercase tracking-tighter">Response Time</span>
        </div>
      </div>

      <div className="w-px h-4 bg-gray-200 dark:bg-gray-800 hidden sm:block" />

      {/* Active Experts */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Users size={14} className="text-blue-500" />
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-charcoal dark:text-white uppercase leading-none">{activeExperts} Experts</span>
          <span className="text-[8px] text-gray-500 uppercase tracking-tighter">Online Now</span>
        </div>
      </div>
    </div>
  );
};

export default LiveStatus;
