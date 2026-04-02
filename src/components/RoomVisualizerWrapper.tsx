import React from 'react';
import { DevicesProvider } from '../contexts/DevicesContext';
import { RoomVisualization } from './RoomVisualization';
import { Camera, Sparkles, Shield, Zap, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * Standalone wrapper for the Room Visualizer feature page.
 * Provides the DevicesContext and renders the full RoomVisualization UI
 * with hero section, feature highlights, and the main tool.
 */
export const RoomVisualizerWrapper: React.FC = () => {
  return (
    <DevicesProvider>
      <div className="min-h-screen bg-soft-gray dark:bg-charcoal">
        {/* Hero Section */}
        <div className="relative bg-gradient-to-br from-teal-700 via-teal to-teal-600 overflow-hidden">
          {/* Background decorations */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-teal-400/10 blur-3xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-5">
              <svg viewBox="0 0 100 100" className="w-full h-full">
                <defs>
                  <pattern id="grid" width="4" height="4" patternUnits="userSpaceOnUse">
                    <path d="M 4 0 L 0 0 0 4" fill="none" stroke="white" strokeWidth="0.3"/>
                  </pattern>
                </defs>
                <rect width="100" height="100" fill="url(#grid)" />
              </svg>
            </div>
          </div>

          <div className="relative max-w-5xl mx-auto px-4 py-16 text-white">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full text-sm font-semibold mb-6">
                <Sparkles size={14} className="text-yellow-400" />
                Powered by GPT-4o Vision
              </div>
              <h1 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
                AI Room Visualizer
              </h1>
              <p className="text-teal-100 text-lg max-w-xl leading-relaxed mb-8">
                Upload a photo of any room and our AI will map out the perfect placement spots for your smart home devices — instantly.
              </p>

              {/* Feature chips */}
              <div className="flex flex-wrap gap-3">
                {[
                  { icon: Camera, label: 'Photo Upload' },
                  { icon: Sparkles, label: 'AI Placement' },
                  { icon: Zap, label: 'Instant Results' },
                  { icon: Shield, label: 'Secure & Private' },
                ].map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-2xl text-sm font-medium border border-white/10"
                  >
                    <Icon size={14} className="text-teal-200" />
                    {label}
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Main Tool */}
        <div className="max-w-5xl mx-auto px-4 py-12">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="bg-white dark:bg-gray-900 rounded-[2rem] shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden p-8 md:p-10"
          >
            <RoomVisualization />
          </motion.div>
        </div>

        {/* How it works section */}
        <section className="max-w-5xl mx-auto px-4 pb-24">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">How It Works</h2>
            <p className="text-slate-500">Three simple steps to a smarter home layout</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: '01',
                icon: Camera,
                title: 'Upload Your Room',
                desc: 'Take or upload any photo of your room — living room, bedroom, kitchen, or office.',
              },
              {
                step: '02',
                icon: Sparkles,
                title: 'AI Analyzes',
                desc: 'Our GPT-4o Vision model analyzes room layout, lighting, and WiFi zones in seconds.',
              },
              {
                step: '03',
                icon: MapPin,
                title: 'See Device Placement',
                desc: 'Interactive markers show exactly where to install each device for maximum efficiency.',
              },
            ].map(({ step, icon: Icon, title, desc }) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 * parseInt(step) }}
                className="bg-white dark:bg-gray-900 rounded-3xl p-8 border border-gray-200 dark:border-gray-800 shadow-sm text-center group hover:shadow-xl hover:border-teal/30 transition-all duration-300"
              >
                <div className="text-xs font-black text-teal/60 tracking-widest mb-4">{step}</div>
                <div className="w-14 h-14 rounded-2xl bg-teal/10 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Icon size={24} className="text-teal" />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-white text-lg mb-2">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </section>
      </div>
    </DevicesProvider>
  );
};
