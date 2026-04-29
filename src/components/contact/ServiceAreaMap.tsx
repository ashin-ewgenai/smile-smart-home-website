import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Info, Globe, Shield, Zap, Target } from 'lucide-react';

interface CoverageZone {
  id: string;
  name: string;
  status: 'active' | 'expanding' | 'planned';
  description: string;
  count: number;
}

const zones: CoverageZone[] = [
  { id: 'z1', name: 'Metro Core', status: 'active', description: 'Primary hub with 2hr emergency response.', count: 245 },
  { id: 'z2', name: 'Northern Suburbs', status: 'active', description: 'Full installation and maintenance support.', count: 182 },
  { id: 'z3', name: 'Western District', status: 'expanding', description: 'New support center opening next month.', count: 45 },
  { id: 'z4', name: 'Southern Reach', status: 'active', description: 'Established security systems specialist zone.', count: 112 },
  { id: 'z5', name: 'Eastern Hills', status: 'planned', description: 'Accepting pre-launch consultations.', count: 0 },
];

const ServiceAreaMap: React.FC = () => {
  const [activeZone, setActiveZone] = useState<CoverageZone | null>(null);

  return (
    <div className="relative w-full aspect-[16/9] bg-gray-900/40 rounded-3xl border border-white/10 backdrop-blur-sm p-4 md:p-8 overflow-hidden group">
      {/* Tactical Grid Background */}
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(#2dd4bf 1px, transparent 1px), linear-gradient(90deg, #2dd4bf 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      
      {/* Glowing Central Hub Visual */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
        <div className="w-96 h-96 bg-teal/20 rounded-full blur-[100px] animate-pulse" />
      </div>

      {/* Abstract Map SVG (Tactical Style) */}
      <svg viewBox="0 0 800 450" className="w-full h-full fill-none stroke-teal/20 stroke-1">
        {/* Abstract Territory Lines */}
        <path d="M100,100 L300,50 L500,80 L700,150 L650,350 L400,400 L150,300 Z" className="fill-teal/5 stroke-teal/30 stroke-dashed" style={{ strokeDasharray: '8 4' }} />
        <path d="M250,150 L450,120 L550,250 L350,300 Z" className="fill-teal/10 stroke-teal/50" />
      </svg>

      {/* Interactive Zone Markers */}
      <div className="absolute inset-0">
        {/* Metro Core */}
        <ZoneMarker 
          x={50} y={50} 
          zone={zones[0]} 
          active={activeZone?.id === 'z1'} 
          onClick={() => setActiveZone(zones[0])} 
        />
        {/* Northern Suburbs */}
        <ZoneMarker 
          x={40} y={30} 
          zone={zones[1]} 
          active={activeZone?.id === 'z2'} 
          onClick={() => setActiveZone(zones[1])} 
        />
        {/* Western District */}
        <ZoneMarker 
          x={25} y={60} 
          zone={zones[2]} 
          active={activeZone?.id === 'z3'} 
          onClick={() => setActiveZone(zones[2])} 
        />
        {/* Southern Reach */}
        <ZoneMarker 
          x={60} y={75} 
          zone={zones[3]} 
          active={activeZone?.id === 'z4'} 
          onClick={() => setActiveZone(zones[3])} 
        />
        {/* Eastern Hills */}
        <ZoneMarker 
          x={75} y={40} 
          zone={zones[4]} 
          active={activeZone?.id === 'z5'} 
          onClick={() => setActiveZone(zones[4])} 
        />
      </div>

      {/* Legend & Stats Overlay */}
      <div className="absolute bottom-6 left-6 right-6 flex flex-col md:flex-row justify-between items-end gap-4 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4 pointer-events-auto">
          <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-teal rounded-full" /> Active</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-yellow-500 rounded-full" /> Expanding</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-gray-500 rounded-full" /> Planned</span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-white/20 font-black text-4xl italic leading-none uppercase">Coverage Live</div>
          <div className="text-teal/60 text-xs font-mono tracking-[0.2em] mt-1">OPERATIONAL DATA SYNCED</div>
        </div>
      </div>

      {/* Detail Overlay */}
      <AnimatePresence>
        {activeZone && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute top-6 right-6 w-64 bg-gray-900/90 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-2xl z-50"
          >
            <button 
              onClick={() => setActiveZone(null)}
              className="absolute top-4 right-4 text-gray-500 hover:text-white"
            >
              ×
            </button>
            <div className={`text-[10px] font-black uppercase tracking-widest mb-2 ${
              activeZone.status === 'active' ? 'text-teal' : activeZone.status === 'expanding' ? 'text-yellow-500' : 'text-gray-500'
            }`}>
              {activeZone.status}
            </div>
            <h4 className="text-xl font-bold text-white mb-2">{activeZone.name}</h4>
            <p className="text-sm text-gray-400 mb-4">{activeZone.description}</p>
            
            <div className="flex items-center justify-between pt-4 border-t border-white/10">
              <span className="text-xs text-gray-500">Live Deployments:</span>
              <span className="text-lg font-bold text-teal">{activeZone.count}+</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ZoneMarker = ({ x, y, zone, active, onClick }: { x: number, y: number, zone: CoverageZone, active: boolean, onClick: () => void }) => {
  const colors = {
    active: 'bg-teal',
    expanding: 'bg-yellow-500',
    planned: 'bg-gray-500'
  };

  return (
    <div 
      className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
      style={{ left: `${x}%`, top: `${y}%` }}
      onClick={onClick}
    >
      <div className="relative">
        <div className={`absolute inset-0 rounded-full animate-ping opacity-20 ${colors[zone.status]}`} />
        <div className={`w-4 h-4 rounded-full border-2 border-white/50 shadow-lg transition-transform duration-300 ${colors[zone.status]} ${active ? 'scale-150' : 'group-hover:scale-125'}`} />
        
        {/* Pulse Ring */}
        {active && (
          <motion.div 
            layoutId="active-ring"
            className="absolute -inset-2 rounded-full border-2 border-teal opacity-50"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        )}
      </div>
    </div>
  );
};

export default ServiceAreaMap;
