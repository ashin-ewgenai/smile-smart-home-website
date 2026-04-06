import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Home, Shield, IndianRupee, ArrowRight, ArrowLeft, Loader2, CheckCircle2, ChevronRight, Heart, Activity, Wifi, Battery, AlertTriangle, Clock, Lightbulb, Lock, Thermometer, SlidersHorizontal, Camera, MapPin, MessageCircle } from 'lucide-react';
import { useDevices } from '../contexts/DevicesContext';
import { HOUSE_SIZES, SECURITY_LEVELS, BUDGET_RANGES } from '../lib/constants';
import { useDeviceRecommendations } from '../hooks/useDeviceRecommendations';
import { useQuoteRequest } from '../hooks/useQuoteRequest';
import type { DeviceRecommendation } from '../models';
import { RoomVisualization } from './RoomVisualization';

/** Returns a human-friendly relative time string (e.g. '2 mins ago') */
function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Circular SVG progress ring for health score */
const ScoreRing: React.FC<{ score: number; color: string }> = ({ score, color }) => {
  const r = 22; const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
      <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-100 dark:text-gray-700" />
      <motion.circle
        cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
    </svg>
  );
};

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  'Color Bulb': <Lightbulb size={20} />,
  'Smart Lock': <Lock size={20} />,
  'Thermostat': <Thermometer size={20} />,
  'Dimmer Switch': <SlidersHorizontal size={20} />,
  'Security Camera': <Camera size={20} />,
};

/**
 * Premium, interactive AI recommendation form component.
 */
export const DeviceRecommendationsForm: React.FC = () => {
  const {
    step,
    formData,
    updateFormData,
    nextStep,
    prevStep,
    handleSubmit,
    resetForm,
    recommendations,
    loading,
    error,
    saveRecommendationToQuote,
    uid,
    devices
  } = useDeviceRecommendations();

  const [activeTab, setActiveTab] = useState<'consultant' | 'health' | 'visualizer'>('consultant');
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [savedIds, setSavedIds] = React.useState<Set<string>>(new Set());
  const [saveError, setSaveError] = React.useState<string | null>(null);
  
  const { notifyQuoteAction, isSending, sendSuccess, sendError, whatsappStatus } = useQuoteRequest();
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [showContactForm, setShowContactForm] = useState(false);

  const handleSave = async (device: DeviceRecommendation) => {
    if (!uid) {
      setSaveError('Please log in to save items to your plan.');
      return;
    }
    setSavingId(device.name);
    setSaveError(null);
    try {
      await saveRecommendationToQuote(device);
      setSavedIds(prev => new Set(prev).add(device.name));
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save to plan');
    } finally {
      setSavingId(null);
    }
  };

  const containerVariants: any = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
    exit: { opacity: 0, y: -20, transition: { duration: 0.3 } }
  };

  const stepVariants: any = {
    hidden: { opacity: 0, x: 50 },
    visible: { opacity: 1, x: 0, transition: { type: 'spring', damping: 25, stiffness: 200 } },
    exit: { opacity: 0, x: -50, transition: { duration: 0.2 } }
  };

  const itemVariants: any = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: (i: number) => ({
      opacity: 1,
      scale: 1,
      transition: { delay: i * 0.1, duration: 0.4 }
    })
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="bg-white dark:bg-charcoal rounded-3xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800"
      >
        <div className="bg-gradient-to-r from-teal-600 to-teal-700 p-8 text-white relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Sparkles size={120} />
          </div>
          <h2 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Sparkles className="text-yellow-400" />
            AI Smart Recommendations
          </h2>
          <p className="text-teal-50 max-w-lg">
            Let our AI consultant design the perfect smart home setup for your space and budget.
          </p>

          {step <= 4 && activeTab === 'consultant' && (
            <div className="mt-8 flex gap-2">
              {[1, 2, 3, 4].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 rounded-full flex-1 transition-all duration-500 ${
                    s <= step ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'bg-white/20'
                  }`}
                />
              ))}
            </div>
          )}

          <div className="mt-8 flex gap-4 border-b border-white/10">
            <button 
              onClick={() => setActiveTab('consultant')}
              className={`pb-4 px-2 font-bold transition-all relative ${activeTab === 'consultant' ? 'text-white' : 'text-white/60 hover:text-white/80'}`}
            >
              AI Consultant
              {activeTab === 'consultant' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-yellow-400 rounded-full" />}
            </button>
            <button 
              onClick={() => setActiveTab('health')}
              className={`pb-4 px-2 font-bold transition-all relative ${activeTab === 'health' ? 'text-white' : 'text-white/60 hover:text-white/80'}`}
            >
              Device Health
              {activeTab === 'health' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-yellow-400 rounded-full" />}
            </button>
            <button 
              onClick={() => setActiveTab('visualizer')}
              className={`pb-4 px-2 font-bold transition-all relative ${activeTab === 'visualizer' ? 'text-white' : 'text-white/60 hover:text-white/80'}`}
            >
              AI Room Visualizer
              {activeTab === 'visualizer' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-yellow-400 rounded-full" />}
            </button>
          </div>
        </div>

        <div className="p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'health' ? (
              <motion.div key="health" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="space-y-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <Activity className="text-teal" />
                    Real-Time Dashboard
                  </h3>
                  <div className="text-xs text-slate-500 bg-slate-100 dark:bg-gray-800 px-3 py-1 rounded-full flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    Live Updates Active
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {!uid ? (
                    <div className="col-span-full py-16 flex flex-col items-center justify-center text-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-teal/10 dark:bg-teal-900/20 flex items-center justify-center">
                        <Activity className="text-teal" size={32} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-700 dark:text-white text-lg">Sign in to view your device health</p>
                        <p className="text-sm text-slate-400 mt-1">Your real-time dashboard is ready — just sign in to connect.</p>
                      </div>
                    </div>
                  ) : devices.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-slate-500">
                      <Loader2 className="mx-auto mb-4 animate-spin text-teal" size={32} />
                      <p>Connecting to your smart home...</p>
                    </div>
                  ) : (
                    devices.map((device: any, i: number) => {
                      const health = device.health || { 
                        score: 100, 
                        status: 'Online', 
                        batteryLevel: 100, 
                        signalStrength: -50, 
                        lastSeen: new Date().toISOString(),
                        alerts: [] 
                      };
                      const scoreColor = health.score > 80 ? '#10b981' : health.score > 60 ? '#f59e0b' : '#ef4444';
                      const scoreTextColor = health.score > 80 ? 'text-emerald-500' : health.score > 60 ? 'text-amber-500' : 'text-red-500';
                      const DeviceIcon = DEVICE_ICONS[device.type || ''] ?? <Activity size={20} />;
                      
                      return (
                        <motion.div 
                          key={device.id} 
                          custom={i} 
                          variants={itemVariants}
                          className="bg-slate-50/50 dark:bg-gray-800/50 rounded-3xl p-6 border border-slate-100 dark:border-gray-700 hover:shadow-xl transition-all group"
                        >
                          <div className="flex justify-between items-start mb-6">
                            <div className="flex gap-4">
                              <div className="w-12 h-12 rounded-2xl bg-white dark:bg-gray-700 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                <span className={health.status === 'Online' ? 'text-teal' : 'text-slate-400'}>{DeviceIcon}</span>
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-800 dark:text-white">{device.deviceName || device.name}</h4>
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                  <span className={`w-1.5 h-1.5 rounded-full ${health.status === 'Online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse' : 'bg-red-500'}`} />
                                  {health.status} • <Clock size={10} /> {relativeTime(health.lastSeen)}
                                </div>
                              </div>
                            </div>
                            <div className="relative flex items-center justify-center">
                              <ScoreRing score={health.score} color={scoreColor} />
                              <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className={`text-sm font-black leading-none ${scoreTextColor}`}>{health.score}</span>
                                <span className="text-[8px] font-bold text-slate-400 uppercase">Score</span>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-white dark:bg-gray-700/50 rounded-2xl p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <Battery size={14} className="text-slate-400" />
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Battery</span>
                              </div>
                              <div className="flex items-end gap-1">
                                <span className={`text-lg font-bold ${health.batteryLevel < 25 ? 'text-red-500' : 'text-slate-700 dark:text-white'}`}>{health.batteryLevel}%</span>
                                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-gray-600 rounded-full mb-2">
                                  <div 
                                    className={`h-full rounded-full transition-all ${health.batteryLevel < 25 ? 'bg-red-500' : health.batteryLevel < 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                                    style={{ width: `${health.batteryLevel}%` }} 
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="bg-white dark:bg-gray-700/50 rounded-2xl p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <Wifi size={14} className="text-slate-400" />
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Signal</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-slate-700 dark:text-white">{health.signalStrength} dBm</span>
                                <div className="flex gap-0.5 items-end">
                                  {[1, 2, 3, 4].map(bar => {
                                    const bars = health.signalStrength > -60 ? 4 : health.signalStrength > -70 ? 3 : health.signalStrength > -80 ? 2 : 1;
                                    return (
                                      <div 
                                        key={bar} 
                                        className={`w-1.5 rounded-full transition-all ${bar <= bars ? 'bg-teal' : 'bg-slate-200 dark:bg-gray-600'}`}
                                        style={{ height: `${bar * 4 + 4}px` }}
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>

                          {health.alerts && health.alerts.length > 0 ? (
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 rounded-xl p-3 flex items-start gap-2">
                              <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                              <div className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                                {health.alerts[0]}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-medium">
                              <CheckCircle2 size={14} />
                              System optimal • Next scan in 5m
                            </div>
                          )}
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            ) : activeTab === 'visualizer' ? (
              <motion.div key="visualizer" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="space-y-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <Camera className="text-teal" />
                    AI Room Visualizer
                  </h3>
                  <div className="text-xs text-slate-500 bg-slate-100 dark:bg-gray-800 px-3 py-1 rounded-full flex items-center gap-2">
                    <MapPin size={12} className="text-teal" />
                    Interactive Visualization
                  </div>
                </div>
                
                <RoomVisualization />
              </motion.div>
            ) : (
              <motion.div key="consultant" variants={stepVariants} initial="hidden" animate="visible" exit="exit">
                {step === 1 && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 text-slate-700 dark:text-gray-300 mb-4">
                      <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg text-teal">
                        <Home size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold">What is your space size?</h3>
                        <p className="text-sm text-slate-500">This helps us determine the wireless range and density needed.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {HOUSE_SIZES.map((size) => (
                        <button
                          key={size}
                          onClick={() => { updateFormData({ houseSize: size }); nextStep(); }}
                          className={`flex items-center justify-between p-5 rounded-2xl border-2 text-left transition-all hover:shadow-lg ${
                            formData.houseSize === size
                              ? 'border-teal bg-teal-50 dark:bg-teal-900/20 text-teal dark:text-teal-300'
                              : 'border-slate-100 dark:border-gray-800 hover:border-teal/30 dark:hover:border-gray-700 bg-slate-50/50 dark:bg-gray-800/30'
                          }`}
                        >
                          <span className="font-medium">{size}</span>
                          <ChevronRight size={18} className={formData.houseSize === size ? 'opacity-100' : 'opacity-30'} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 text-slate-700 dark:text-gray-300 mb-4">
                      <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg text-cyan-600">
                        <Shield size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold">Security Priority</h3>
                        <p className="text-sm text-slate-500">How important is surveillance and integrated security to you?</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {SECURITY_LEVELS.map((level) => (
                        <button
                          key={level}
                          onClick={() => updateFormData({ securityNeeds: level })}
                          className={`flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all hover:shadow-lg ${
                            formData.securityNeeds === level
                              ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300'
                              : 'border-slate-100 dark:border-gray-800 hover:border-cyan-200 dark:hover:border-gray-700 bg-slate-50/50 dark:bg-gray-800/30'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            formData.securityNeeds === level ? 'border-cyan-500 bg-cyan-500 ring-4 ring-cyan-100 dark:ring-cyan-900/40' : 'border-slate-300'
                          }`}>
                            {formData.securityNeeds === level && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                          </div>
                          <div>
                            <div className="font-bold">{level}</div>
                            <div className="text-xs text-slate-500">
                              {level === 'High' ? 'Full camera coverage, smart locks, and sensors.' : 
                               level === 'Medium' ? 'Smart doorbell and motion-activated lights.' : 
                               'Basic monitoring and emergency alerts.'}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between mt-8">
                      <button onClick={prevStep} className="flex items-center gap-2 text-slate-500 hover:text-teal font-medium"><ArrowLeft size={18} /> Back</button>
                      <button onClick={nextStep} className="btn-primary py-2 px-6 flex items-center gap-2 shadow-none">Next <ArrowRight size={18} /></button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 text-slate-700 dark:text-gray-300 mb-4">
                      <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600">
                        <IndianRupee size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold">Estimated Budget</h3>
                        <p className="text-sm text-slate-500">We will prioritize devices that give you the most value for this amount.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {BUDGET_RANGES.map((range) => (
                        <button
                          key={range.value}
                          onClick={() => updateFormData({ budget: range.value })}
                          className={`p-5 rounded-2xl border-2 text-left transition-all hover:shadow-lg ${
                            formData.budget === range.value
                              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                              : 'border-slate-100 dark:border-gray-800 hover:border-emerald-200 dark:hover:border-gray-700 bg-slate-50/50 dark:bg-gray-800/30'
                          }`}
                        >
                          <div className="text-lg font-bold">{range.label}</div>
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between mt-8">
                      <button onClick={prevStep} className="flex items-center gap-2 text-slate-500 hover:text-teal font-medium"><ArrowLeft size={18} /> Back</button>
                      <button onClick={handleSubmit} disabled={loading} className="btn-primary py-3 px-8 flex items-center gap-2 shadow-lg shadow-teal/20 transition-all disabled:opacity-50">
                        {loading ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />}
                        {loading ? 'Consulting AI...' : 'Generate My Plan'}
                      </button>
                    </div>
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><CheckCircle2 className="text-emerald-500" /> Your Custom Smart Plan</h3>
                        <p className="text-slate-500 italic">Based on your {formData.houseSize} and ₹{formData.budget} budget.</p>
                      </div>
                      <button onClick={resetForm} className="text-teal hover:text-teal/80 text-sm font-bold bg-teal/5 dark:bg-teal-900/20 px-4 py-2 rounded-lg">New Plan</button>
                    </div>
                    {error && <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm">{error}</div>}
                    {saveError && <div className="p-4 bg-amber-50 border border-amber-100 text-amber-700 rounded-xl text-sm flex items-center gap-2"><Shield size={16} />{saveError}</div>}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {recommendations.map((device, i) => (
                        <motion.div key={device.name} custom={i} variants={itemVariants} className="group p-5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-teal transition-all shadow-sm">
                          <div className="flex justify-between items-start mb-3">
                            <span className="px-3 py-1 bg-teal-100 dark:bg-teal-900/30 text-teal text-xs font-bold rounded-full">{device.category}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-900 dark:text-white font-bold">₹{device.estimatedPrice}*</span>
                              <button 
                                onClick={() => handleSave(device)}
                                disabled={savingId === device.name || savedIds.has(device.name)}
                                className={`p-1.5 rounded-full transition-all ${savedIds.has(device.name) ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 dark:bg-gray-700 text-slate-400 hover:text-teal'}`}
                              >
                                {savingId === device.name ? <Loader2 size={16} className="animate-spin" /> : <Heart size={16} fill={savedIds.has(device.name) ? "currentColor" : "none"} />}
                              </button>
                            </div>
                          </div>
                          <h4 className="text-lg font-bold text-slate-800 dark:text-white mb-2">{device.name}</h4>
                          <p className="text-sm text-slate-500 leading-relaxed">{device.reason}</p>
                        </motion.div>
                      ))}
                    </div>
                    
                    <div className="mt-10 p-8 bg-teal-50 dark:bg-teal-900/10 rounded-3xl border border-teal-100 dark:border-teal-900/30 text-center relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:rotate-12 transition-transform">
                        <Sparkles size={100} />
                      </div>
                      <h4 className="text-xl font-bold text-teal-800 dark:text-teal-300 mb-3">Love this setup?</h4>
                      <p className="text-teal-600 dark:text-teal-500/80 mb-6 max-w-md mx-auto">
                        Get this custom smart home plan sent directly to your registered email and WhatsApp for easy access later.
                      </p>
                      
                      {sendSuccess ? (
                        <motion.div 
                          initial={{ scale: 0.9, opacity: 0 }} 
                          animate={{ scale: 1, opacity: 1 }}
                          className="space-y-3"
                        >
                          <div className="flex items-center justify-center gap-2 text-emerald-600 font-bold bg-emerald-50 dark:bg-emerald-900/20 py-3 px-6 rounded-xl mx-auto w-fit">
                            <CheckCircle2 size={20} />
                            Quote sent successfully!
                          </div>
                          {whatsappStatus === 'sent' && (
                            <div className="flex items-center justify-center gap-2 text-emerald-600 text-sm font-medium bg-emerald-50/50 dark:bg-emerald-900/10 py-2 px-4 rounded-lg mx-auto w-fit">
                              <MessageCircle size={16} />
                              WhatsApp notification delivered
                            </div>
                          )}
                          {whatsappStatus === 'failed' && (
                            <div className="flex items-center justify-center gap-2 text-amber-600 text-sm font-medium bg-amber-50 dark:bg-amber-900/10 py-2 px-4 rounded-lg mx-auto w-fit">
                              <MessageCircle size={16} />
                              WhatsApp failed (email delivered)
                            </div>
                          )}
                          {whatsappStatus === 'skipped' && (
                            <div className="flex items-center justify-center gap-2 text-slate-500 text-sm font-medium bg-slate-100 dark:bg-slate-800/50 py-2 px-4 rounded-lg mx-auto w-fit">
                              <MessageCircle size={16} />
                              WhatsApp skipped (no phone number)
                            </div>
                          )}
                          <p className="text-slate-500 text-sm">
                            Check your inbox for the full quote details.
                          </p>
                        </motion.div>
                      ) : !showContactForm ? (
                        <button 
                          onClick={() => setShowContactForm(true)}
                          className="btn-primary py-3 px-10 flex items-center gap-3 mx-auto shadow-xl shadow-teal-500/20 relative z-10 hover:scale-105 transition-all"
                        >
                          <Wifi size={18} />
                          Send My Plan to Email & WhatsApp
                        </button>
                      ) : (
                        <div className="max-w-xs mx-auto space-y-4">
                          <div className="text-left space-y-3">
                            <input 
                              type="email" 
                              placeholder="Your Email"
                              value={recipientEmail}
                              onChange={e => setRecipientEmail(e.target.value)}
                              className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-teal-200 dark:border-teal-900/40 text-sm focus:ring-2 focus:ring-teal-500"
                            />
                            <input 
                              type="tel" 
                              placeholder="WhatsApp Number"
                              value={recipientPhone}
                              onChange={e => setRecipientPhone(e.target.value)}
                              className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-teal-200 dark:border-teal-900/40 text-sm focus:ring-2 focus:ring-teal-500"
                            />
                          </div>
                          <div className="space-y-4">
                            <button 
                              disabled={isSending || !recipientEmail}
                              onClick={() => {
                                console.log("[DEBUG] Button clicked, email:", recipientEmail);
                                notifyQuoteAction({
                                  type: 'quote_submitted',
                                  quoteId: `AI-${Date.now()}`,
                                  email: recipientEmail,
                                  phone: recipientPhone,
                                  details: { budget: formData.budget, houseSize: formData.houseSize }
                                });
                              }}
                              className="w-full btn-primary py-2.5 flex items-center justify-center gap-2 shadow-lg"
                            >
                              {isSending ? (
                                <>
                                  <Loader2 size={18} className="animate-spin" />
                                  {whatsappStatus === 'sending' ? 'Sending email & WhatsApp...' : 'Sending...'}
                                </>
                              ) : (
                                <>
                                  <Wifi size={18} />
                                  Confirm & Send
                                </>
                              )}
                            </button>
                            {sendSuccess && (
                              <div className="flex items-center gap-2 text-green-600 text-sm">
                                <CheckCircle2 size={16} />
                                <span>Quote sent successfully!</span>
                              </div>
                            )}
                            {sendError && <p className="text-red-500 text-xs font-medium">{sendError}</p>}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-8 p-6 bg-soft-gray dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 text-center text-sm text-slate-500">
                      *Estimated prices are representative. Our team can provide a precise quote for installation and hardware.
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

