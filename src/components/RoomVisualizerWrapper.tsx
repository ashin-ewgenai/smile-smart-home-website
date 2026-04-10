import React, { useEffect, useRef } from 'react';
import { DevicesProvider, useDevices } from '../contexts/DevicesContext';
import { RoomVisualization } from './RoomVisualization';
import { Camera, Sparkles, Shield, Zap, MapPin, X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Standalone wrapper for the Room Visualizer feature page.
 * Provides the DevicesContext and renders the full RoomVisualization UI
 * with hero section, feature highlights, and the main tool.
 * 
 * Supports manual device addition feature via DevicesContext, allowing users
 * to add custom devices with AI-assisted or manual placement alongside
 * AI-recommended equipment.
 */
export const RoomVisualizerWrapper: React.FC = () => {
  return (
    <DevicesProvider>
      <WrapperContent />
    </DevicesProvider>
  );
};

const WrapperContent: React.FC = () => {
  const { showNotification, hideNotification, notification, error } = useDevices();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (notification.isOpen && notification.mode === 'modal') {
      const previouslyFocused = document.activeElement as HTMLElement;
      // Focus the modal container
      modalRef.current?.focus();
      return () => {
        previouslyFocused?.focus();
      };
    }
  }, [notification.isOpen, notification.mode]);

  useEffect(() => {
    if (error) {
      showNotification({
        message: error,
        type: 'error'
      });
    }
  }, [error, showNotification]);

  // Standardized Variants (Inlined)
  const snackbarVariants = {
    hidden: { opacity: 0, x: 60, scale: 0.8, rotate: 5 },
    visible: { 
      opacity: 1, 
      x: 0, 
      scale: 1,
      rotate: 0,
      transition: { 
        type: 'spring', 
        damping: 16, 
        stiffness: 280,
        mass: 0.8
      }
    },
    exit: { 
      opacity: 0, 
      scale: 0.85, 
      x: 30, 
      transition: { duration: 0.25, ease: 'easeIn' } 
    }
  };

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 }
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: { type: 'spring', damping: 25, stiffness: 200 }
    },
    exit: { opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.2 } }
  };

  return (
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
            variants={modalVariants as any}
            initial="hidden"
            animate="visible"
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
          variants={modalVariants as any}
          initial="hidden"
          animate="visible"
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
                variants={modalVariants as any}
                initial="hidden"
                whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
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
      {/* ── Global Notification UI (Strictly Top-Right) ── */}
      <AnimatePresence>
        {notification.isOpen && (
          <div className="fixed top-6 right-6 z-[10001] flex flex-col items-end gap-3 pointer-events-none">
            {notification.mode === 'snackbar' ? (
              <motion.div
                variants={snackbarVariants as any}
                initial="hidden"
                animate="visible"
                exit="exit"
                className={`
                  pointer-events-auto flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border
                  bg-white dark:bg-charcoal min-w-[320px] max-w-md
                  ${notification.type === 'error' ? 'border-red-500/20' : 'border-teal/20'}
                `}
              >
                <div className={`p-2 rounded-xl ${
                  notification.type === 'error' ? 'bg-red-500/10 text-red-500' :
                  notification.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' :
                  'bg-teal/10 text-teal'
                }`}>
                  {notification.type === 'error' && <AlertCircle size={20} />}
                  {notification.type === 'success' && <CheckCircle size={20} />}
                  {notification.type === 'info' && <Info size={20} />}
                  {notification.type === 'warning' && <AlertTriangle size={20} />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800 dark:text-white leading-tight">
                    {notification.message}
                  </p>
                </div>
                <button onClick={hideNotification} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={16} />
                </button>
              </motion.div>
            ) : (
              <div className="fixed inset-0 flex items-start justify-end p-6 pointer-events-none">
                <motion.div
                  variants={backdropVariants as any}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  onClick={hideNotification}
                  className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-auto"
                />
                <motion.div
                  ref={modalRef}
                  tabIndex={-1}
                  variants={snackbarVariants as any}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="relative w-full max-w-sm bg-white dark:bg-charcoal border border-gray-200 dark:border-gray-800 rounded-3xl shadow-2xl overflow-hidden mt-16 mr-0 pointer-events-auto focus:outline-none"
                >
                  <div className={`h-1.5 w-full ${
                    notification.type === 'error' ? 'bg-red-500' :
                    notification.type === 'success' ? 'bg-emerald-500' :
                    'bg-teal'
                  }`} />
                  <div className="p-8">
                    <div className="flex items-center gap-4 mb-6">
                      <div className={`p-3 rounded-2xl ${
                        notification.type === 'error' ? 'bg-red-500/10 text-red-500' :
                        notification.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' :
                        'bg-teal/10 text-teal'
                      }`}>
                        {notification.type === 'error' && <AlertCircle className="w-8 h-8" />}
                        {notification.type === 'success' && <CheckCircle className="w-8 h-8" />}
                      </div>
                      <h3 className="text-2xl font-black text-slate-800 dark:text-white leading-none">
                        {notification.title || 'Notification'}
                      </h3>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 text-lg leading-relaxed mb-8">
                      {notification.message}
                    </p>
                    <div className="flex justify-end">
                      <button
                        onClick={hideNotification}
                        className="px-8 py-3 rounded-xl font-bold bg-teal text-white hover:bg-teal/90 transition-all shadow-lg shadow-teal/20"
                      >
                        Got it
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
