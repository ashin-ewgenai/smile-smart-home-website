# Interactive Floorplan Enhancement Archive

This document contains the complete React and Tailwind CSS implementation for the **Virtual Smart Home Tour**. It uses an SVG architectural blueprint with absolute-positioned pulsing hotspots that reveal glassy room-specific automation descriptions.

### 1. The React Component
When your team is ready, create a new file `src/components/home/InteractiveFloorplan.tsx` and paste this code:

```tsx
import React, { useState } from 'react';
import { Tv, Flame, Lock, Sun, X, ArrowRight, Zap, Car } from 'lucide-react';

const HOTSPOTS = [
  { 
    id: 'living', 
    x: 45, y: 70, 
    title: 'Living Room Oasis', 
    desc: 'At 8 PM, the smart blinds close, the ambient RGB strips sync to your TV, and the thermostat adjusts to 22°C automatically. Say "Movie Mode" to instantly dim the lights and power on your home theater.',
    icon: Tv
  },
  {
    id: 'kitchen',
    x: 65, y: 25,
    title: 'Culinary Masterpiece',
    desc: 'Smart smoke detectors and automated appliance plugs ensure maximum safety. Voice-controlled under-cabinet lighting assists your cooking without ever needing to touch a switch with messy hands.',
    icon: Flame
  },
  {
    id: 'door',
    x: 50, y: 90,
    title: 'Secure Entryway',
    desc: 'Equipped with a high-definition video doorbell and a smart deadbolt. Let guests in remotely, grant temporary entry codes, and see exactly who is at the threshold from your smartphone anywhere in the world.',
    icon: Lock
  },
  {
    id: 'bedroom',
    x: 25, y: 30,
    title: 'Sunrise Bedroom',
    desc: 'Wake up naturally without jarring alarms. Your smart bedside lamps gently fade on to simulate a sunrise, while your smart coffee maker begins brewing downstairs.',
    icon: Sun
  },
  {
    id: 'garage',
    x: 23, y: 75,
    title: 'Automated Garage',
    desc: 'Never wonder if you left the garage door open again. Receive instant geofencing alerts when you drive away, and let the door close behind you automatically as you pull out of the driveway.',
    icon: Car
  }
];

export default function InteractiveFloorplan() {
  const [activeSpot, setActiveSpot] = useState<string | null>(null);

  return (
    <section className="py-24 bg-gray-900 border-t border-white/5 overflow-hidden relative" id="interactive-tour">
      {/* Deep Background Glows */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-teal-500/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] mix-blend-overlay"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-16">
          <span className="text-teal-400 font-semibold tracking-wider uppercase text-sm mb-4 block inline-flex items-center gap-2">
            <Zap className="w-4 h-4" /> Virtual Experience
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-6 tracking-tight">Explore the Smart Home</h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto font-light leading-relaxed">
            Click on the pulsing points around the floorplan below to discover how Smile Smart Homes transforms every corner of your daily life.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-12 items-center justify-center">
            
            {/* THE INTERACTIVE SVG AREA */}
            <div className="relative w-full max-w-3xl aspect-[4/3] bg-gray-800/40 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-lg shadow-2xl group flex-shrink-0">
               
               {/* Abstract Architect Blueprint SVG */}
               <svg viewBox="0 0 800 600" className="w-full h-full opacity-40 select-none">
                 {/* Thick Outline */}
                 <rect x="50" y="50" width="700" height="500" fill="none" stroke="#14b8a6" strokeWidth="6" rx="12" />
                 
                 {/* Internal Wall Lines */}
                 <line x1="300" y1="50" x2="300" y2="400" stroke="#14b8a6" strokeWidth="3" />
                 <line x1="50" y1="300" x2="300" y2="300" stroke="#14b8a6" strokeWidth="3" />
                 <line x1="300" y1="200" x2="750" y2="200" stroke="#14b8a6" strokeWidth="3" />
                 <line x1="550" y1="200" x2="550" y2="550" stroke="#14b8a6" strokeWidth="3" />
                 <line x1="300" y1="400" x2="550" y2="400" stroke="#14b8a6" strokeWidth="3" />
                 
                 {/* Door gaps (filled with background color to simulate breaks) */}
                 <rect x="350" y="540" width="100" height="20" fill="#111827" /> {/* Front Door */}
                 <rect x="290" y="100" width="20" height="80" fill="#111827" /> {/* Bedroom Door */}
                 <rect x="150" y="290" width="80" height="20" fill="#111827" /> {/* Garage connect */}
                 <rect x="400" y="190" width="80" height="20" fill="#111827" /> {/* Kitchen door */}
                 <rect x="600" y="190" width="80" height="20" fill="#111827" /> {/* Dining door */}
                 
                 {/* Room Labels (Subtle geometric background text) */}
                 <text x="175" y="185" fill="#14b8a6" fontSize="28" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" opacity="0.2">BEDROOM</text>
                 <text x="175" y="435" fill="#14b8a6" fontSize="28" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" opacity="0.2">GARAGE</text>
                 <text x="425" y="315" fill="#14b8a6" fontSize="28" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" opacity="0.2">LIVING</text>
                 <text x="525" y="135" fill="#14b8a6" fontSize="28" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" opacity="0.2">KITCHEN</text>
                 <text x="650" y="385" fill="#14b8a6" fontSize="28" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" opacity="0.2">DINING</text>
               </svg>

               {/* Absolute Positioned Hotspot Dots */}
               {HOTSPOTS.map(spot => {
                 const isActive = activeSpot === spot.id;
                 return (
                   <div 
                     key={spot.id}
                     className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 group/spot focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500 rounded-full"
                     style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                     onClick={() => setActiveSpot(spot.id)}
                     onKeyDown={(e) => e.key === 'Enter' && setActiveSpot(spot.id)}
                     tabIndex={0}
                     role="button"
                     aria-label={`View details for ${spot.title}`}
                   >
                     <div className={`relative flex items-center justify-center transition-all duration-500 ${isActive ? 'scale-125' : 'hover:scale-110'}`}>
                        {/* Ping Ring Effect */}
                        {!isActive && (
                          <div className="absolute inset-0 rounded-full bg-teal-400 animate-ping opacity-[0.85] animation-delay-200"></div>
                        )}
                        {/* Core Glowing Dot */}
                        <div className={`relative w-10 h-10 rounded-full flex items-center justify-center border-[3px] transition-colors duration-300 ${isActive ? 'bg-teal-500 border-teal-200 shadow-[0_0_30px_rgba(20,184,166,1)]' : 'bg-gray-900 border-teal-500/60 shadow-[0_0_15px_rgba(20,184,166,0.5)] group-hover/spot:bg-teal-900 group-hover/spot:border-teal-300'}`}>
                           <div className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${isActive ? 'bg-white' : 'bg-teal-400'}`}></div>
                        </div>
                     </div>
                   </div>
                 );
               })}
            </div>
            
            {/* THE DYNAMIC INFORMATION PANEL */}
            <div className="w-full lg:w-[450px] flex-shrink-0 h-full relative border border-transparent">
               {activeSpot ? (
                 HOTSPOTS.map(spot => spot.id === activeSpot && (
                   <div key={spot.id} className="relative bg-white/5 dark:bg-gray-800/50 backdrop-blur-2xl border border-white/10 dark:border-gray-700 p-8 sm:p-10 rounded-[2rem] shadow-2xl flex flex-col justify-center transform transition-all animate-in fade-in slide-in-from-right-8 duration-500 fill-mode-forwards z-30">
                     <button 
                        onClick={() => setActiveSpot(null)} 
                        className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 p-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                        aria-label="Close panel"
                     >
                       <X className="w-5 h-5" />
                     </button>
                     
                     <div className="w-16 h-16 bg-gradient-to-br from-teal-500/20 to-teal-500/5 text-teal-400 rounded-2xl flex items-center justify-center mb-6 border border-teal-500/30 shadow-[0_0_20px_rgba(20,184,166,0.2)] transform group-hover:scale-105 transition-transform">
                        <spot.icon className="w-8 h-8" />
                     </div>
                     
                     <h3 className="text-3xl font-extrabold text-white mb-4 leading-tight tracking-tight">{spot.title}</h3>
                     <div className="h-1 w-12 bg-teal-500 rounded-full mb-6"></div>
                     <p className="text-[1.1rem] text-gray-300 leading-relaxed font-light mb-10">
                       {spot.desc}
                     </p>
                     
                     <a href="#planner" className="inline-flex items-center text-teal-400 font-semibold hover:text-teal-300 group/link transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-lg py-1">
                       Request a quote for this room
                       <ArrowRight className="w-5 h-5 ml-2 transform group-hover/link:translate-x-1.5 transition-transform" />
                     </a>
                   </div>
                 ))
               ) : (
                 <div className="relative bg-white/5 border border-white/5 p-10 rounded-[2rem] flex flex-col items-center justify-center text-center backdrop-blur-md shadow-inner h-full min-h-[350px]">
                    <div className="w-20 h-20 bg-gray-800/60 border border-gray-700/60 rounded-full flex items-center justify-center mb-6 shadow-xl">
                      <Zap className="w-10 h-10 text-teal-500/40 animate-pulse" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-400 mb-3 tracking-wide">Select a Space</h3>
                    <p className="text-gray-500 font-light text-lg leading-relaxed max-w-[250px]">
                      Interact with the pulsing hotspots on the blueprint to explore smart home capabilities.
                    </p>
                 </div>
               )}
            </div>
        </div>
      </div>
    </section>
  );
}
```

### 2. Integration into Landing Page
Then, easily embed it onto `src/pages/index.astro` directly underneath your hero section:

```astro
---
import InteractiveFloorplan from '../components/home/InteractiveFloorplan.tsx';
//... other imports
---

  <main>
    <Hero />
    
    <!-- Virtual Smart Home Tour -->
    <InteractiveFloorplan client:load />

    <!-- Rest of your Homepage... -->
```
