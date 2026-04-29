import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, Bot, ShieldCheck, Cpu, Zap, Radio, Check } from 'lucide-react';

const popularBrands = [
  { name: 'Ring', protocol: 'Wifi/Z-Wave' },
  { name: 'Nest', protocol: 'Matter/Wifi' },
  { name: 'Philips Hue', protocol: 'Zigbee' },
  { name: 'Sonos', protocol: 'Wifi' },
  { name: 'Arlo', protocol: 'Wifi' },
];

const AIPreview: React.FC = () => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [response, setResponse] = useState<{ text: string; protocol?: string; brand?: string } | null>(null);

  const handleAsk = (forcedBrand?: string) => {
    const searchVal = forcedBrand || input.trim();
    if (!searchVal) return;
    
    setInput(searchVal);
    setLoading(true);
    setScanning(true);
    setResponse(null);
    
    // Multi-stage animation for "Premium" feel
    setTimeout(() => {
      const cleanInput = searchVal.toLowerCase();
      const brands = [
        { name: 'Ring', protocol: 'Z-Wave / Wifi', note: 'Full ring ecosystem support.' },
        { name: 'Nest', protocol: 'Matter / Thread', note: 'Seamless Google Home integration.' },
        { name: 'Philips Hue', protocol: 'Zigbee', note: 'Adaptive lighting specialist.' },
        { name: 'Apple', protocol: 'HomeKit / Matter', note: 'Privacy-focused automation.' },
        { name: 'Sonos', protocol: 'AirPlay 2 / Wifi', note: 'Multi-room audio excellence.' },
      ];
      
      const found = brands.find(b => cleanInput.includes(b.name.toLowerCase()));

      if (found) {
        setResponse({
          text: `Protocol Match: ${found.note}`,
          protocol: found.protocol,
          brand: found.name
        });
      } else {
        setResponse({
          text: `General Support: We work with ${searchVal} using standard smart protocols.`,
          protocol: 'Matter / Zigbee / Z-Wave'
        });
      }
      setLoading(false);
      setScanning(false);
    }, 1500);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 border border-teal/20 shadow-xl relative overflow-hidden group">
      {/* Background Pulse */}
      <div className="absolute inset-0 bg-gradient-to-br from-teal/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal/10 rounded-xl flex items-center justify-center text-teal relative overflow-hidden">
              <Sparkles size={20} className="relative z-10" />
              <motion.div 
                className="absolute inset-0 bg-teal/20"
                animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <div>
              <h4 className="text-xl font-bold text-charcoal dark:text-white leading-tight">Smart Protocol Finder</h4>
              <p className="text-[10px] text-teal font-black uppercase tracking-widest">Instant Capability Check</p>
            </div>
          </div>
          {scanning && (
            <div className="flex gap-1">
              {[1, 2, 3].map(i => (
                <motion.div 
                  key={i}
                  className="w-1 h-1 bg-teal rounded-full"
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 0.6, delay: i * 0.1, repeat: Infinity }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Brand Chips */}
        <div className="flex flex-wrap gap-2 mb-6">
          {popularBrands.map((brand) => (
            <button
              key={brand.name}
              onClick={() => handleAsk(brand.name)}
              className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-gray-500 hover:border-teal/40 hover:text-teal hover:bg-teal/5 transition-all"
            >
              + {brand.name}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div className="relative">
            <input 
              type="text" 
              placeholder="Enter brand or device name..."
              className="pill-input w-full pr-14 text-sm bg-gray-50/50 dark:bg-gray-900/50"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAsk()}
            />
            <button 
              onClick={() => handleAsk()}
              disabled={loading}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-teal text-white rounded-full flex items-center justify-center hover:bg-teal/90 transition-all shadow-lg shadow-teal/20"
            >
              {loading ? (
                <Radio className="animate-spin" size={18} />
              ) : (
                <Zap size={16} fill="currentColor" />
              )}
            </button>
          </div>

          <AnimatePresence mode="wait">
            {scanning ? (
              <motion.div
                key="scanning"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-10 flex flex-col items-center justify-center space-y-4 bg-teal/5 rounded-2xl border border-teal/10"
              >
                <div className="relative w-16 h-16">
                   <motion.div 
                    className="absolute inset-0 border-2 border-teal rounded-full"
                    animate={{ scale: [1, 1.2, 1], opacity: [1, 0, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                   />
                   <div className="absolute inset-0 flex items-center justify-center text-teal">
                      <Cpu size={24} className="animate-pulse" />
                   </div>
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-teal animate-pulse">Scanning Protocol Hub...</p>
              </motion.div>
            ) : response && (
              <motion.div
                key="response"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gray-900 text-white rounded-2xl p-6 shadow-2xl relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Bot size={60} />
                </div>
                
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 bg-teal rounded-full flex items-center justify-center">
                      <Check size={14} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-teal">System Verified</span>
                  </div>

                  <h5 className="text-xl font-bold mb-1">{response.brand || 'Device Identified'}</h5>
                  <div className="flex items-center gap-2 mb-4">
                    <Radio size={12} className="text-teal" />
                    <span className="text-xs font-mono text-gray-400">{response.protocol}</span>
                  </div>
                  
                  <p className="text-sm text-gray-300 leading-relaxed mb-4 italic">
                    "{response.text}"
                  </p>

                  <div className="pt-4 border-t border-white/10 flex justify-between items-center">
                    <span className="text-[9px] text-gray-500 uppercase tracking-tighter">Status: Fully Integratable</span>
                    <button onClick={() => setResponse(null)} className="text-[9px] text-teal underline font-bold uppercase">Clear</button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default AIPreview;
