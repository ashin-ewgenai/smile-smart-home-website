import React, { useState } from 'react';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import {
  TrendingUp, IndianRupee, Target, Calendar, Filter,
  ArrowUpRight, ArrowDownRight, Package, CreditCard, Activity, Sparkles, Loader2
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useRevenueAnalytics } from '../hooks/useRevenueAnalytics';
import * as ReactRouter from 'react-router-dom';
import ServiceHistoryTimeline from './ServiceHistoryTimeline';
import { useDevices } from '../contexts/DevicesContext';
import { useDarkMode } from '../lib/hooks';

const AdminRevenueDashboard: React.FC = () => {
  const { isDark } = useDarkMode();
  const location = typeof ReactRouter.useLocation === 'function' ? ReactRouter.useLocation() : { search: '' };
  const search = location.search || '';
  const queryParams = new URLSearchParams(search);
  const initialTab = queryParams.get('tab') === 'history' ? 'history' : 'analytics';

  const [activeTab, setActiveTab] = useState<'analytics' | 'history'>(initialTab);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth() - 6, 1),
    end: new Date()
  });

  const { setServiceFilters } = useDevices();

  const {
    totalRevenue, billRevenue, leadRevenue, confirmedQuotes, totalQuotes, averageDealValue, conversionRate,
    revenueByMonth, topDevices, loading, error, debugInfo
  } = useRevenueAnalytics(dateRange);

  const handleDateChange = (start: Date, end: Date) => {
    setDateRange({ start, end });
    setServiceFilters({ startDate: start, endDate: end });
  };

  // Helper for currency formatting
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  if (error) {
    return (
      <div className="p-12 text-center glass-surface rounded-[2.5rem] border border-red-500/20">
        <div className="inline-flex p-4 rounded-3xl bg-red-500/10 text-red-500 mb-6">
          <Activity size={40} />
        </div>
        <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">Analytics Offline</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-8 mx-auto max-w-sm">
          We encountered a connection issue while syncronizing your revenue data.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-8 py-3 bg-teal text-white rounded-2xl font-bold shadow-lg shadow-teal/20 hover:scale-105 transition-all"
        >
          Re-establish Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-1 sm:p-2 max-w-7xl mx-auto">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
            Revenue Analytics
            <Sparkles className="text-teal animate-pulse" />
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Includes Confirmed Bills & Accepted Leads
            {debugInfo && (
              <span className="ml-4 text-[10px] text-slate-400 font-normal">
                (System sync: {debugInfo.rawEstimations} bills | {debugInfo.rawLeads} leads found)
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white dark:bg-charcoal p-1.5 rounded-2xl shadow-lg border border-slate-100 dark:border-gray-800">
          <button 
            onClick={() => setActiveTab('analytics')}
            className={`px-6 py-2 rounded-xl text-sm font-black transition-all ${
              activeTab === 'analytics' 
                ? 'bg-teal text-white shadow-lg shadow-teal/20' 
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            }`}
          >
            Analytics
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`px-6 py-2 rounded-xl text-sm font-black transition-all ${
              activeTab === 'history' 
                ? 'bg-teal text-white shadow-lg shadow-teal/20' 
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            }`}
          >
            Service History
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-charcoal p-2.5 rounded-3xl shadow-xl border border-slate-100 dark:border-gray-800">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 dark:bg-gray-900/80 rounded-2xl border border-slate-100 dark:border-gray-800">
            <Calendar size={18} className="text-teal" />
            <div className="flex items-center gap-3">
              <input
                type="date"
                className="bg-transparent border-none p-0 text-sm font-black text-slate-700 dark:text-slate-200 focus:ring-0 cursor-pointer min-w-[110px]"
                value={dateRange.start.toISOString().split('T')[0]}
                onClick={(e) => (e.target as any).showPicker?.()}
                onChange={(e) => handleDateChange(new Date(e.target.value), dateRange.end)}
              />
              <span className="text-slate-300 dark:text-gray-600 font-black">/</span>
              <input
                type="date"
                className="bg-transparent border-none p-0 text-sm font-black text-slate-700 dark:text-slate-200 focus:ring-0 cursor-pointer min-w-[110px]"
                value={dateRange.end.toISOString().split('T')[0]}
                onClick={(e) => (e.target as any).showPicker?.()}
                onChange={(e) => handleDateChange(dateRange.start, new Date(e.target.value))}
              />
            </div>
          </div>
          <button className="p-3 rounded-2xl bg-teal text-white shadow-lg shadow-teal/20 hover:scale-105 transition-all active:scale-95 group">
            <Filter size={20} className="group-hover:rotate-180 transition-transform duration-500" />
          </button>
        </div>
      </div>

      {activeTab === 'analytics' ? (
        <>
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard
              title="Total Revenue"
              value={formatCurrency(totalRevenue)}
              change="+12.5%"
              isPositive={true}
              icon={<IndianRupee className="text-emerald-500" />}
              loading={loading}
            >
              <div className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-800 flex justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Bills</p>
                  <p className="text-xs font-black text-slate-700 dark:text-slate-200">{formatCurrency(billRevenue)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Leads</p>
                  <p className="text-xs font-black text-teal">{formatCurrency(leadRevenue)}</p>
                </div>
              </div>
            </MetricCard>
            <MetricCard
              title="Avg. Deal Value"
              value={formatCurrency(averageDealValue)}
              change="+3.2%"
              isPositive={true}
              icon={<CreditCard className="text-teal" />}
              loading={loading}
            />
            <MetricCard
              title="Quotes Converted"
              value={confirmedQuotes.toString()}
              change="-2.4%"
              isPositive={false}
              icon={<Target className="text-indigo-500" />}
              loading={loading}
            />
            <MetricCard
              title="Conversion Rate"
              value={`${conversionRate.toFixed(1)}%`}
              change="+5.1%"
              isPositive={true}
              icon={<Activity className="text-amber-500" />}
              loading={loading}
            />
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Revenue Trend */}
            <div className="glass-surface rounded-[2.5rem] p-8 border border-slate-100 dark:border-gray-800 shadow-2xl overflow-hidden min-h-[440px] flex flex-col">
              <div className="flex items-center justify-between mb-10">
                <div>
                  <h3 className="text-2xl font-black text-slate-800 dark:text-white">Revenue Growth</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Volume over time</p>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-4 py-2 rounded-full border border-emerald-500/10">
                  <TrendingUp size={14} />
                  Optimized
                </div>
              </div>
              <div className="flex-1 w-full min-h-[280px]">
                {loading ? (
                  <div className="h-full w-full flex items-center justify-center">
                    <Loader2 className="w-12 h-12 text-teal animate-spin" />
                  </div>
                ) : revenueByMonth.length === 0 ? (
                  <div className="h-full w-full flex flex-col items-center justify-center text-slate-400">
                    <Package className="w-12 h-12 mb-4 opacity-20" />
                    <p className="font-bold text-sm">No transaction data yet</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueByMonth}>
                      <defs>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.3} />
                      <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                        dy={15}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                        tickFormatter={(val) => `₹${Math.round(val / 1000)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '24px',
                          border: 'none',
                          boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
                          backgroundColor: isDark ? 'rgb(31 41 55)' : 'rgb(255 255 255)',
                          padding: '16px',
                          color: isDark ? '#fff' : '#1f2937'
                        }}
                        itemStyle={{ fontWeight: '900', color: '#14b8a6', fontSize: '14px' }}
                        labelStyle={{ fontWeight: '800', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '8px', fontSize: '11px', textTransform: 'uppercase' }}
                        formatter={(value: number) => [formatCurrency(Math.round(value)), 'Total Revenue']}
                      />
                      <Area type="monotone" dataKey="amount" stroke="#14b8a6" strokeWidth={5} fillOpacity={1} fill="url(#colorRev)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Top Products */}
            <div className="glass-surface rounded-[2.5rem] p-8 border border-slate-100 dark:border-gray-800 shadow-2xl overflow-hidden min-h-[440px] flex flex-col">
              <div className="flex items-center justify-between mb-10">
                <div>
                  <h3 className="text-2xl font-black text-slate-800 dark:text-white">Top Performance</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">High-selling smart devices</p>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-gray-800 text-slate-400">
                  <Package size={20} />
                </div>
              </div>
              <div className="flex-1 w-full min-h-[280px]">
                {loading ? (
                  <div className="h-full w-full flex items-center justify-center">
                    <Loader2 className="w-12 h-12 text-teal animate-spin" />
                  </div>
                ) : topDevices.length === 0 ? (
                  <div className="h-full w-full flex flex-col items-center justify-center text-slate-400">
                    <Package className="w-12 h-12 mb-4 opacity-20" />
                    <p className="font-bold text-sm">No device data available</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topDevices} layout="vertical" margin={{ left: 20 }}>
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="name"
                        type="category"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }}
                        width={100}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(20, 184, 166, 0.05)', radius: 12 }}
                        contentStyle={{
                          borderRadius: '24px',
                          border: 'none',
                          boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
                          padding: '16px',
                          backgroundColor: 'rgb(31 41 55)',
                          color: '#fff'
                        }}
                        itemStyle={{ fontWeight: '900', color: '#14b8a6', fontSize: '14px' }}
                        labelStyle={{ fontWeight: '800', color: '#94a3b8', marginBottom: '8px', fontSize: '11px', textTransform: 'uppercase' }}
                        formatter={(value: number) => [formatCurrency(Math.round(value)), 'Revenue']}
                      />
                      <Bar dataKey="revenue" radius={[0, 12, 12, 0]} barSize={28}>
                        {topDevices.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={['#14b8a6', '#0ea5e9', '#6366f1', '#f59e0b', '#ec4899'][index % 5]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-surface rounded-[2.5rem] p-8 border border-slate-100 dark:border-gray-800 shadow-2xl min-h-[600px]"
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-2xl font-black text-slate-800 dark:text-white">Service History</h3>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Chronological System Events</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-teal bg-teal/10 px-4 py-2 rounded-full border border-teal/10">
              <Activity size={14} />
              Real-time Feed
            </div>
          </div>
          <ServiceHistoryTimeline />
        </motion.div>
      )}
    </div>
  );
};

const MetricCard: React.FC<{
  title: string;
  value: string | number;
  change: string;
  isPositive: boolean;
  icon: React.ReactNode;
  loading?: boolean;
  children?: React.ReactNode;
}> = ({ title, value, change, isPositive, icon, loading, children }) => (
  <motion.div
    whileHover={{ y: -8, scale: 1.02 }}
    transition={{ type: 'spring', damping: 20, stiffness: 300 }}
    className="bg-white dark:bg-charcoal p-7 rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-gray-800 relative overflow-hidden group"
  >
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-6">
        <div className="p-4 rounded-[1.25rem] bg-slate-50 dark:bg-gray-900/50 border border-slate-100 dark:border-gray-800 group-hover:bg-teal group-hover:text-white transition-colors duration-500">
          {icon}
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${isPositive ? 'text-emerald-500 bg-emerald-500/10' : 'text-rose-500 bg-rose-500/10'}`}>
          {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {change}
        </div>
      </div>
      {loading ? (
        <div className="space-y-3">
          <div className="h-10 w-3/4 bg-slate-100 dark:bg-gray-800/50 animate-pulse rounded-2xl" />
          <div className="h-4 w-1/2 bg-slate-100 dark:bg-gray-800/30 animate-pulse rounded-xl" />
        </div>
      ) : (
        <>
          <div className="text-3xl font-black text-slate-800 dark:text-white mb-1 leading-none tracking-tight">{value}</div>
          <div className="text-xs font-black text-slate-400 uppercase tracking-widest mt-2">{title}</div>
        </>
      )}
    </div>
    {/* Background Decorative Accent */}
    <div className="absolute -right-6 -bottom-6 opacity-[0.03] pointer-events-none transform rotate-12 scale-[2.5] text-slate-900 dark:text-white group-hover:scale-[3] group-hover:rotate-0 transition-all duration-700">
      {icon}
    </div>
    {children}
  </motion.div>
);

export default AdminRevenueDashboard;
