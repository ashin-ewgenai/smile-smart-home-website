import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Clock, MessageSquare, Wrench, FileText, ChevronRight, 
  Search, Filter, Activity, User, Mail, Calendar, ExternalLink, Loader2
} from 'lucide-react';
import { useDevices } from '../contexts/DevicesContext';
import { useNavigate } from 'react-router-dom';

const ServiceHistoryTimeline: React.FC = () => {
  const { 
    serviceHistory: events, 
    serviceHistoryLoading: loading, 
    serviceHasMore: hasMore,
    loadMoreServiceHistory: loadMore,
    serviceFilters,
    setServiceFilters
  } = useDevices();
  
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState<string | 'all'>('all');
  const [search, setSearch] = useState('');

  // Local filtering for search and type (on top of DB filters)
  const filteredEvents = events.filter(e => {
    const matchesType = typeFilter === 'all' || e.type === typeFilter;
    const matchesSearch = e.title.toLowerCase().includes(search.toLowerCase()) || 
                         e.customerEmail?.toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'support': return <MessageSquare className="w-5 h-5 text-indigo-500" />;
      case 'installation': return <Wrench className="w-5 h-5 text-emerald-500" />;
      case 'quote': return <FileText className="w-5 h-5 text-teal" />;
      case 'billing': return <Activity className="w-5 h-5 text-rose-500" />;
      case 'interaction': return <MessageSquare className="w-5 h-5 text-indigo-500" />;
      case 'maintenance': return <Wrench className="w-5 h-5 text-amber-500" />;
      case 'setup': return <Activity className="w-5 h-5 text-teal" />;
      default: return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const statusColors: any = {
    open: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    closed: 'bg-slate-100 text-slate-500 border-slate-200',
    pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    resolved: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
    new: 'bg-teal/10 text-teal border-teal/20',
    active: 'bg-teal/10 text-teal border-teal/20',
    approved: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    in_progress: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'
  };

  const handleViewDetails = (event: any) => {
    switch (event.type) {
      case 'support': navigate('/support'); break;
      case 'installation': navigate('/plan-leads'); break;
      case 'quote':
      case 'billing': navigate('/estimates'); break;
      case 'interaction': navigate('/contact-submissions'); break;
      case 'maintenance': navigate('/support'); break;
      case 'setup': navigate('/devices'); break;
      default: navigate('/');
    }
  };

  return (
    <div className="space-y-8">
      {/* Filtering Header */}
      <div className="flex flex-col xl:flex-row gap-6 justify-between items-start xl:items-center bg-white/50 dark:bg-gray-900/50 p-6 rounded-[2rem] border border-slate-100 dark:border-gray-800 backdrop-blur-xl shadow-xl">
        <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto">
          {/* Search */}
          <div className="relative flex-1 md:w-64 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal transition-colors" size={18} />
            <input 
              type="text"
              placeholder="SEARCH EVENTS..."
              className="w-full bg-white dark:bg-charcoal border border-slate-100 dark:border-gray-800 rounded-2xl py-3 pl-12 pr-4 text-[10px] font-black uppercase tracking-[0.2em] focus:ring-2 focus:ring-teal/20 focus:border-teal transition-all outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Date Range Picker */}
          <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-charcoal border border-slate-100 dark:border-gray-800 rounded-2xl">
            <Calendar size={16} className="text-teal" />
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="bg-transparent border-none p-0 text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 focus:ring-0 cursor-pointer"
                value={serviceFilters.startDate?.toISOString().split('T')[0] || ''}
                onChange={(e) => setServiceFilters({ ...serviceFilters, startDate: e.target.value ? new Date(e.target.value) : null })}
              />
              <span className="text-slate-300">/</span>
              <input
                type="date"
                className="bg-transparent border-none p-0 text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 focus:ring-0 cursor-pointer"
                value={serviceFilters.endDate?.toISOString().split('T')[0] || ''}
                onChange={(e) => setServiceFilters({ ...serviceFilters, endDate: e.target.value ? new Date(e.target.value) : null })}
              />
            </div>
            {(serviceFilters.startDate || serviceFilters.endDate) && (
              <button 
                onClick={() => setServiceFilters({ startDate: null, endDate: null })}
                className="text-rose-500 hover:text-rose-600"
              >
                <Filter size={14} className="rotate-45" />
              </button>
            )}
          </div>
        </div>
        
        {/* Type Filter Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'support', 'installation', 'billing', 'interaction'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 border ${
                typeFilter === t 
                  ? 'bg-teal text-white shadow-lg shadow-teal/20 border-teal' 
                  : 'bg-white dark:bg-charcoal text-slate-400 border-slate-100 dark:border-gray-800 hover:border-teal/50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline List */}
      <div className="relative pl-8 space-y-8 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-gradient-to-b before:from-teal/50 before:via-slate-200 dark:before:via-gray-800 before:to-transparent">
        <AnimatePresence mode="popLayout">
          {filteredEvents.map((event, idx) => (
            <motion.div 
              key={event.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(idx * 0.05, 0.5) }}
              className="relative group"
            >
              {/* Chronological Dot */}
              <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-4 border-white dark:border-charcoal bg-slate-200 dark:bg-gray-800 group-hover:bg-teal group-hover:scale-125 transition-all duration-300" />
              
              <div className="glass-surface p-6 rounded-[2rem] border border-slate-100 dark:border-gray-800 hover:shadow-2xl hover:shadow-teal/5 transition-all group-hover:-translate-y-1">
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-gray-900/50 flex items-center justify-center h-fit w-fit group-hover:bg-teal group-hover:text-white transition-all duration-500">
                    {getIcon(event.type)}
                  </div>
                  
                  <div className="flex-1 space-y-4">
                    <div className="flex flex-col flex-wrap lg:flex-row lg:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3 mb-1.5">
                          <h4 className="font-black text-slate-800 dark:text-white text-lg tracking-tight">{event.title}</h4>
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${statusColors[event.status.toLowerCase()] || statusColors.closed}`}>
                            {event.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] text-slate-400 font-bold uppercase tracking-[0.15em]">
                          <span className="flex items-center gap-1.5"><Calendar size={12} className="text-teal" /> {event.timestamp.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          <span className="flex items-center gap-1.5"><Clock size={12} className="text-teal" /> {event.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => handleViewDetails(event)}
                        className="flex items-center gap-2 px-6 py-2.5 bg-slate-50 dark:bg-gray-900/50 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 hover:text-white hover:bg-teal transition-all border border-transparent shadow-sm"
                      >
                        Details <ChevronRight size={14} />
                      </button>
                    </div>

                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium bg-slate-50/50 dark:bg-gray-900/30 p-4 rounded-2xl border border-slate-50 dark:border-gray-800/50">
                      {event.description}
                    </p>

                    {event.customerEmail && (
                      <div className="flex flex-wrap items-center gap-6 pt-4 border-t border-slate-100 dark:border-gray-800/50">
                        <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          <Mail size={14} className="text-teal" />
                          {event.customerEmail}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          <Activity size={14} className="text-indigo-500" />
                          ID: {event.id.slice(0, 8)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center p-10">
            <div className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-charcoal rounded-2xl border border-slate-100 dark:border-gray-800 shadow-xl">
              <Loader2 className="w-5 h-5 text-teal animate-spin" />
              <span className="text-xs font-black uppercase tracking-widest text-slate-500">Loading History...</span>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredEvents.length === 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-24 bg-slate-50/50 dark:bg-gray-900/20 rounded-[3rem] border-2 border-dashed border-slate-200 dark:border-gray-800"
          >
            <Activity className="mx-auto w-16 h-16 text-slate-200 dark:text-gray-800 mb-6" />
            <h3 className="text-2xl font-black text-slate-400 uppercase tracking-widest">No matching events</h3>
            <p className="text-slate-400 text-sm mt-3 font-medium">Try adjusting your filters or expanding the date range</p>
          </motion.div>
        )}

        {/* Load More Button */}
        {!loading && hasMore && (
          <div className="flex justify-center pt-8">
            <button 
              onClick={loadMore}
              className="group flex items-center gap-3 px-10 py-4 bg-white dark:bg-charcoal text-teal rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] shadow-xl border border-slate-100 dark:border-gray-800 hover:scale-105 transition-all active:scale-95"
            >
              LOAD PREVIOUS ACTIVITY
              <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};


export default ServiceHistoryTimeline;
