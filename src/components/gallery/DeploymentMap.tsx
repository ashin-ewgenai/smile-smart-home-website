import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Info, Users, Shield, Zap } from 'lucide-react';

interface Hotspot {
  id: string;
  x: number;
  y: number;
  city: string;
  count: number;
  type: string;
  color: string;
}

const hotspots: Hotspot[] = [
  { id: '1', x: 12, y: 25, city: 'Seattle', count: 42, type: 'Climate Control', color: 'from-blue-400 to-cyan-400' },
  { id: '2', x: 8, y: 45, city: 'San Francisco', count: 85, type: 'Full Automation', color: 'from-teal to-blue-500' },
  { id: '3', x: 15, y: 65, city: 'Los Angeles', count: 120, type: 'Entertainment', color: 'from-purple-500 to-pink-500' },
  { id: '4', x: 45, y: 60, city: 'Dallas', count: 64, type: 'Security', color: 'from-orange-400 to-red-500' },
  { id: '5', x: 65, y: 35, city: 'Chicago', count: 58, type: 'Full Automation', color: 'from-teal to-blue-500' },
  { id: '6', x: 85, y: 30, city: 'New York', count: 110, type: 'Lighting', color: 'from-yellow-400 to-orange-500' },
  { id: '7', x: 82, y: 75, city: 'Miami', count: 72, type: 'Security', color: 'from-red-400 to-orange-500' },
];

const DeploymentMap: React.FC = () => {
  const [activeHotspot, setActiveHotspot] = useState<Hotspot | null>(null);

  return (
    <section className="relative py-24 bg-charcoal overflow-hidden rounded-[3rem] my-12 border border-white/5 shadow-2xl">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(20,184,166,0.1),transparent_70%)]" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-teal/10 rounded-full blur-[100px]" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px]" />
      </div>

      <div className="container relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          {/* Text Content */}
          <div className="w-full lg:w-1/3 text-left">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal/10 border border-teal/20 text-teal text-sm font-bold mb-6"
            >
              <Users size={16} />
              <span>500+ Homes Transformed</span>
            </motion.div>
            
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight"
            >
              Nationwide <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal to-blue-400">Smart Coverage</span>
            </motion.h2>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-gray-400 text-lg mb-10 leading-relaxed"
            >
              Our expert technicians have deployed cutting-edge smart home systems in every major metropolitan area. We don't just install devices; we build digital ecosystems.
            </motion.p>

            <div className="grid grid-cols-2 gap-6">
              {[
                { icon: Shield, label: 'Secure Hubs', value: '150+' },
                { icon: Zap, label: 'Smart Nodes', value: '2.5k' }
              ].map((stat, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="p-4 rounded-2xl bg-white/5 border border-white/10"
                >
                  <stat.icon className="text-teal mb-2" size={24} />
                  <div className="text-2xl font-bold text-white">{stat.value}</div>
                  <div className="text-sm text-gray-500">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Map Container */}
          <div className="w-full lg:w-2/3 relative aspect-[16/10] bg-gray-900/40 rounded-3xl border border-white/10 backdrop-blur-sm p-8 shadow-inner overflow-hidden group">
            {/* Grid Lines */}
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #2dd4bf 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

            {/* Stylized US Map SVG */}
            <svg viewBox="0 0 1000 600" className="w-full h-full fill-white/[0.03] stroke-white/10 stroke-[1.5]">
              <path d="M230,120 Q300,80 400,100 T550,110 T700,90 T850,110 T920,150 T940,300 T900,450 T750,500 T500,520 T250,500 T100,450 T60,300 T80,180 T150,130 Z" />
              <path d="M150,150 Q200,140 250,150" fill="none" className="opacity-20" />
              <path d="M850,150 Q900,160 920,200" fill="none" className="opacity-20" />
            </svg>

            {/* Connecting Lines (Dashed) */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <defs>
                <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0" />
                  <stop offset="50%" stopColor="#2dd4bf" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
                </linearGradient>
              </defs>
              {hotspots.slice(1).map((spot, i) => (
                <motion.line
                  key={i}
                  x1={`${hotspots[0].x}%`}
                  y1={`${hotspots[0].y}%`}
                  x2={`${spot.x}%`}
                  y2={`${spot.y}%`}
                  stroke="url(#lineGrad)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
              ))}
            </svg>

            {/* Hotspots */}
            {hotspots.map((spot) => (
              <div
                key={spot.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
              >
                <motion.button
                  whileHover={{ scale: 1.5 }}
                  onMouseEnter={() => setActiveHotspot(spot)}
                  onMouseLeave={() => setActiveHotspot(null)}
                  className="relative flex items-center justify-center w-8 h-8 group/btn"
                >
                  <span className={`absolute inset-0 bg-gradient-to-br ${spot.color} rounded-full animate-ping opacity-20`} />
                  <span className={`absolute inset-1 bg-gradient-to-br ${spot.color} rounded-full opacity-40 blur-sm`} />
                  <span className={`relative w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] border border-teal`} />
                </motion.button>

                {/* Advanced Tooltip */}
                <AnimatePresence>
                  {activeHotspot?.id === spot.id && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.9 }}
                      animate={{ opacity: 1, y: -20, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.9 }}
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-gray-900/90 backdrop-blur-xl border border-white/20 rounded-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[100]"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white font-bold text-lg">{spot.city}</span>
                        <div className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter bg-gradient-to-r ${spot.color} text-white`}>
                          Active
                        </div>
                      </div>
                      
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between text-gray-400">
                          <span>Installations:</span>
                          <span className="text-teal font-bold">{spot.count}+</span>
                        </div>
                        <div className="flex justify-between text-gray-400">
                          <span>Specialty:</span>
                          <span className="text-white">{spot.type}</span>
                        </div>
                      </div>
                      
                      {/* Progress Bar Decor */}
                      <div className="mt-3 h-1 w-full bg-white/10 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }} 
                          animate={{ width: '70%' }} 
                          className={`h-full bg-gradient-to-r ${spot.color}`} 
                        />
                      </div>

                      {/* Arrow */}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-4 h-4 bg-gray-900/90 border-b border-r border-white/20 rotate-45 -mt-2" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {/* Map Overlay Text */}
            <div className="absolute bottom-6 right-8 text-right pointer-events-none">
              <div className="text-white/20 font-black text-6xl italic leading-none select-none">SMART NETWORK</div>
              <div className="text-teal/40 text-sm font-mono tracking-widest mt-2 uppercase">v2.4 Live Operations</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DeploymentMap;
