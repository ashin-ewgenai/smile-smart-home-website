import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Clock, MessageSquare, Wrench, FileText, ChevronRight, 
  Search, Filter, Activity, User, Mail, Calendar, ExternalLink
} from 'lucide-react';
import { useDevices } from '../contexts/DevicesContext';
import { useNavigate } from 'react-router-dom';

const ServiceHistoryTimeline: React.FC = () => {
  const { 
    serviceHistory: events, 
    serviceHistoryLoading: loading, 
    fetchServiceHistory 
  } = useDevices();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string | 'all'>('all');
  const [search, setSearch] = useState('');

  React.useEffect(() => {
    fetchServiceHistory();
  }, [fetchServiceHistory]);

  const filteredEvents = events.filter(e => {
    const matchesFilter = filter === 'all' || e.type === filter;
    const matchesSearch = e.title.toLowerCase().includes(search.toLowerCase()) || 
                         e.customerEmail?.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
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
      case 'support':
        navigate('/support');
        break;
      case 'installation':
        navigate('/plan-leads');
        break;
      case 'quote':
      case 'billing':
        navigate('/estimates');
        break;
      case 'interaction':
        navigate('/contact-submissions');
        break;
      case 'maintenance':
        navigate('/support');
        break;
      case 'setup':
        navigate('/devices');
        break;
      default:
        navigate('/');
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20 space-y-4">
      <div className="w-12 h-12 border-4 border-teal/20 border-t-teal rounded-full animate-spin" />
      <p className="text-slate-500 font-bold animate-pulse">Syncing system activity...</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-10">
        <div className="relative w-full sm:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal transition-colors" size={18} />
          <input 
            type="text"
            placeholder="SEARCH SYSTEM ACTIVITY..."
            className="w-full bg-slate-50 dark:bg-gray-900/50 border border-slate-100 dark:border-gray-800 rounded-2xl py-3 pl-12 pr-4 text-[10px] font-black uppercase tracking-[0.2em] focus:ring-2 focus:ring-teal/20 focus:border-teal transition-all outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2 bg-slate-50 dark:bg-gray-900/50 p-1.5 rounded-2xl border border-slate-100 dark:border-gray-800">
          {(['all', 'support', 'installation', 'billing', 'interaction', 'maintenance'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500 ${
                filter === t ? 'bg-white dark:bg-gray-800 text-teal shadow-lg shadow-teal/5 border border-teal/10' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="relative pl-8 space-y-8 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200 dark:before:bg-gray-800">
        <AnimatePresence mode="popLayout">
          {filteredEvents.map((event, idx) => (
            <motion.div 
              key={event.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="relative group"
            >
              {/* Dot */}
              <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-4 border-white dark:border-charcoal bg-slate-200 dark:bg-gray-800 group-hover:bg-teal transition-colors" />
              
              <div className="glass-surface p-6 rounded-3xl border border-slate-100 dark:border-gray-800 hover:shadow-xl hover:shadow-teal/5 transition-all group-hover:-translate-y-1">
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-gray-900/50 flex items-center justify-center h-fit w-fit group-hover:bg-teal/10 transition-colors">
                    {getIcon(event.type)}
                  </div>
                  
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="font-black text-slate-800 dark:text-white">{event.title}</h4>
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${statusColors[event.status.toLowerCase()] || statusColors.closed}`}>
                            {event.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-400 font-bold uppercase tracking-widest">
                          <span className="flex items-center gap-1.5"><Calendar size={14} /> {event.timestamp.toLocaleDateString()}</span>
                          <span className="flex items-center gap-1.5"><Clock size={14} /> {event.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => handleViewDetails(event)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-gray-900/50 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-teal hover:bg-teal/10 transition-all border border-transparent hover:border-teal/20"
                      >
                        View Details <ChevronRight size={14} />
                      </button>
                    </div>

                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
                      {event.description}
                    </p>

                    {event.customerEmail && (
                      <div className="flex items-center gap-4 pt-4 mt-4 border-t border-slate-50 dark:border-gray-800/50">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                          <Mail size={14} className="text-teal" />
                          {event.customerEmail}
                        </div>
                        {event.id && (
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 italic">
                            ID: {event.id.slice(0, 8)}...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredEvents.length === 0 && (
          <div className="text-center py-20 bg-slate-50 dark:bg-gray-900/30 rounded-[2.5rem] border-2 border-dashed border-slate-100 dark:border-gray-800">
            <Activity className="mx-auto w-12 h-12 text-slate-300 mb-4" />
            <h3 className="text-xl font-black text-slate-400">No matching events</h3>
            <p className="text-slate-400 text-sm mt-2">Adjust your filters or try a different search</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceHistoryTimeline;
