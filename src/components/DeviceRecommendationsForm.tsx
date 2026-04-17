/**
 * DeviceRecommendationsForm.tsx
 * File: src/components/DeviceRecommendationsForm.tsx
 *
 * README Usage Documentation Reference:
 * This component is documented in README.md "Usage" section under:
 * "User Workflow: AI Device Recommendations (src/components/DeviceRecommendationsForm.tsx)"
 *
 * Features:
 * - 4-step AI Consultant Wizard: house size → security → budget → AI recommendations
 * - Device Health Dashboard: real-time health scores, battery, signal, alerts
 * - Quote Actions: save to plan, send quotes via Email & WhatsApp
 * - Uses: useDeviceRecommendations(), useQuoteRequest(), useDevices() contexts
 *
 * See README.md Usage section for detailed workflow examples.
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Home, Shield, IndianRupee, ArrowRight, ArrowLeft, Loader2, CheckCircle2, ChevronRight, Heart, Activity, Wifi, Battery, AlertTriangle, Clock, Lightbulb, Lock, Thermometer, SlidersHorizontal, Camera, MapPin, MessageCircle, Eye, EyeOff, User } from 'lucide-react';
import { useDevices } from '../contexts/DevicesContext';
import { HOUSE_SIZES, SECURITY_LEVELS, BUDGET_RANGES } from '../lib/constants';
import { useDeviceRecommendations } from '../hooks/useDeviceRecommendations';
import { useQuoteRequest } from '../hooks/useQuoteRequest';
import { useAuth } from '../hooks/useAuth';
import { useAuthMode } from '../contexts/AuthModeContext';
import type { DeviceRecommendation } from '../models';
import { RoomVisualization } from './RoomVisualization';
import { auth, db } from '../lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { accountDoc, newAccountPayload, accountLoginMergePayload } from '../models/Collections';

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
interface DeviceRecommendationsFormProps {
  forcedTab?: 'consultant' | 'health';
}

export const DeviceRecommendationsForm: React.FC<DeviceRecommendationsFormProps> = ({ forcedTab }) => {
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
    devices,
    adminAccepted,
    acceptedAt,
    calculateSavings,
    savingsData,
    // Templates
    selectedTemplateId,
    applyTemplate,
    quoteTemplates
  } = useDeviceRecommendations();

  const [activeTab, setActiveTab] = useState<'consultant' | 'health'>(forcedTab || 'consultant');

  useEffect(() => {
    if (forcedTab) {
      setActiveTab(forcedTab);
    }
  }, [forcedTab]);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [savedIds, setSavedIds] = React.useState<Set<string>>(new Set());
  
  const { notifyQuoteAction, isSending, sendSuccess, sendError, whatsappStatus } = useQuoteRequest();
  const { showNotification } = useDevices();
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [showContactForm, setShowContactForm] = useState(false);

  // Auth state and hooks
  const { loginWithGoogle, signupWithEmail } = useAuth();
  const { authMode, setAuthMode, toggleAuthMode } = useAuthMode();
  const [authLoading, setAuthLoading] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Validation functions
  function validEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }
  function validPassword(v: string) {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+={}:;"'\[\]\\|<>?,./`~]).{8,}$/.test(v);
  }
  function friendlyAuthError(code?: string) {
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/invalid-email':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Wrong email or password';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later.';
      case 'auth/account-exists-with-different-credential':
        return 'An account already exists with a different sign-in method';
      case 'auth/email-already-in-use':
        return 'Email already in use. Please sign in instead.';
      case 'auth/weak-password':
        return 'Password is too weak. Use 8+ chars with uppercase, lowercase, number, and symbol.';
      case 'auth/operation-not-allowed':
        return 'Operation not allowed. Contact support.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }

  // Handle signin submission
  async function handleSignin(e: React.FormEvent) {
    e.preventDefault();
    if (!validEmail(authEmail)) {
      showNotification({ message: 'Please enter a valid email', type: 'error' });
      return;
    }
    if (!authPassword) {
      showNotification({ message: 'Please enter your password', type: 'error' });
      return;
    }
    setAuthLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, authEmail, authPassword);
      const user = cred.user;
      if (user && user.email) {
        const userRef = accountDoc(db, user.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          showNotification({ message: 'Account not found. Please sign up first.', type: 'error' });
          await auth.signOut();
          setAuthLoading(false);
          return;
        }
        const data = snap.data() as any;
        const role = (data?.Role || data?.role || '').toString().toLowerCase();
        if (role === 'user') {
          await setDoc(userRef, accountLoginMergePayload(), { merge: true });
          localStorage.setItem('userEmail', user.email || '');
          localStorage.setItem('userId', user.uid);
          localStorage.setItem('userRole', 'user');
          const cachedName = (data?.FullName || data?.fullName || data?.displayName || data?.name || user.displayName || '').toString();
          if (cachedName) localStorage.setItem('userName', cachedName);
          showNotification({ message: 'Signed in successfully!', type: 'success' });
          // Reset form fields
          setAuthEmail('');
          setAuthPassword('');
        } else {
          showNotification({ message: 'Administrative account detected. Please use the Admin Portal.', type: 'error' });
          await auth.signOut();
        }
      }
    } catch (err: any) {
      const code = err?.code as string;
      showNotification({ message: friendlyAuthError(code), type: 'error' });
    } finally {
      setAuthLoading(false);
    }
  }

  // Handle signup submission
  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!validEmail(authEmail)) {
      showNotification({ message: 'Please enter a valid email', type: 'error' });
      return;
    }
    if (!validPassword(authPassword)) {
      showNotification({
        message: 'Password must be at least 8 characters with uppercase, lowercase, number, and symbol',
        type: 'error'
      });
      return;
    }
    if (authPassword !== authConfirmPassword) {
      showNotification({ message: 'Passwords do not match', type: 'error' });
      return;
    }
    if (!authFullName.trim() || authFullName.trim().length < 2) {
      showNotification({ message: 'Please enter your full name', type: 'error' });
      return;
    }
    setAuthLoading(true);
    try {
      const user = await signupWithEmail(authEmail, authPassword, authFullName);
      // Force token refresh to ensure Firestore auth state is current
      await user.getIdToken(true);
      const userRef = accountDoc(db, user.uid);
      const newUserPayload = newAccountPayload({
        uid: user.uid,
        email: user.email!.toLowerCase(),
        fullName: authFullName,
        role: 'user',
        consultationId: null
      });
      await setDoc(userRef, newUserPayload);
      await setDoc(userRef, accountLoginMergePayload(), { merge: true });
      localStorage.setItem('userEmail', user.email || '');
      localStorage.setItem('userId', user.uid);
      localStorage.setItem('userRole', 'user');
      localStorage.setItem('userName', authFullName);
      showNotification({ message: 'Account created successfully!', type: 'success' });
      // Reset form fields
      setAuthEmail('');
      setAuthPassword('');
      setAuthConfirmPassword('');
      setAuthFullName('');
    } catch (err: any) {
      const code = err?.code as string;
      showNotification({ message: friendlyAuthError(code), type: 'error' });
    } finally {
      setAuthLoading(false);
    }
  }

  // Handle Google auth
  async function handleGoogleAuth() {
    setAuthLoading(true);
    try {
      const user = await loginWithGoogle();
      if (user && user.email) {
        const userRef = accountDoc(db, user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data() as any;
          const role = (data?.Role || data?.role || '').toString().toLowerCase();
          if (role !== 'user') {
            showNotification({
              message: 'Administrative account detected. Please use the Admin Portal.',
              type: 'error'
            });
            await auth.signOut();
            setAuthLoading(false);
            return;
          }
          await setDoc(userRef, accountLoginMergePayload(), { merge: true });
          localStorage.setItem('userEmail', user.email);
          localStorage.setItem('userId', user.uid);
          localStorage.setItem('userRole', 'user');
          const cachedName = (data?.FullName || data?.fullName || data?.displayName || '').toString();
          if (cachedName) localStorage.setItem('userName', cachedName);
          showNotification({ message: 'Signed in successfully!', type: 'success' });
        } else {
          // Auto-registration for new Google users
          const newUserPayload = newAccountPayload({
            uid: user.uid,
            email: user.email.toLowerCase(),
            fullName: user.displayName || 'User',
            role: 'user',
            consultationId: null
          });
          await setDoc(userRef, newUserPayload);
          localStorage.setItem('userEmail', user.email);
          localStorage.setItem('userId', user.uid);
          localStorage.setItem('userRole', 'user');
          if (user.displayName) localStorage.setItem('userName', user.displayName);
          showNotification({ message: 'Account created successfully!', type: 'success' });
        }
      }
    } catch (err: any) {
      const code = err?.code as string;
      showNotification({ message: friendlyAuthError(code), type: 'error' });
    } finally {
      setAuthLoading(false);
    }
  }

  useEffect(() => {
    if (sendSuccess) {
      showNotification({
        message: 'Your smart home quote has been sent successfully!',
        type: 'success'
      });
    }
  }, [sendSuccess, showNotification]);

  const handleSave = async (device: DeviceRecommendation) => {
    if (!uid) {
      showNotification({ 
        message: 'Please log in to save items to your plan.', 
        type: 'warning' 
      });
      return;
    }
    setSavingId(device.name);
    try {
      await saveRecommendationToQuote(device);
      setSavedIds(prev => new Set(prev).add(device.name));
      showNotification({
        message: `${device.name} added to your plan.`,
        type: 'success'
      });
    } catch (err: any) {
      showNotification({
        message: err.message || 'Failed to save to plan',
        type: 'error'
      });
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
            ) : (
              <motion.div key="consultant" variants={stepVariants} initial="hidden" animate="visible" exit="exit">
                {/* Auth Gate - Show when user is not logged in */}
                {!uid && (
                  <div className="py-8">
                    <div className="max-w-md mx-auto">
                      <div className="text-center mb-8">
                        <div className="w-16 h-16 rounded-full bg-teal/10 dark:bg-teal-900/20 flex items-center justify-center mx-auto mb-4">
                          <Sparkles className="text-teal" size={32} />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
                          {authMode === 'signin' ? 'Welcome Back!' : 'Create Your Account'}
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400">
                          {authMode === 'signin'
                            ? 'Sign in to get personalized AI recommendations and save your smart home plan.'
                            : 'Sign up to get personalized AI recommendations and save your smart home plan.'}
                        </p>
                      </div>

                      {/* Auth Mode Toggle */}
                      <div className="flex rounded-xl bg-slate-100 dark:bg-gray-800 p-1 mb-6">
                        <button
                          onClick={() => setAuthMode('signin')}
                          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                            authMode === 'signin'
                              ? 'bg-white dark:bg-gray-700 text-teal shadow-sm'
                              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                          }`}
                        >
                          Sign In
                        </button>
                        <button
                          onClick={() => setAuthMode('signup')}
                          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                            authMode === 'signup'
                              ? 'bg-white dark:bg-gray-700 text-teal shadow-sm'
                              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                          }`}
                        >
                          Sign Up
                        </button>
                      </div>

                      <form onSubmit={authMode === 'signin' ? handleSignin : handleSignup} className="space-y-4">
                        {/* Full Name - Only for signup */}
                        {authMode === 'signup' && (
                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                              Full Name
                            </label>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                              <input
                                type="text"
                                value={authFullName}
                                onChange={(e) => setAuthFullName(e.target.value)}
                                placeholder="John Doe"
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal focus:border-transparent transition-all"
                              />
                            </div>
                          </div>
                        )}

                        {/* Email */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Email
                          </label>
                          <input
                            type="email"
                            value={authEmail}
                            onChange={(e) => setAuthEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal focus:border-transparent transition-all"
                          />
                        </div>

                        {/* Password */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Password
                          </label>
                          <div className="relative">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              value={authPassword}
                              onChange={(e) => setAuthPassword(e.target.value)}
                              placeholder="••••••••"
                              className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal focus:border-transparent transition-all"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            >
                              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                          </div>
                          {authMode === 'signup' && (
                            <p className="text-xs text-slate-500 mt-1">
                              Min 8 chars with uppercase, lowercase, number & symbol
                            </p>
                          )}
                        </div>

                        {/* Confirm Password - Only for signup */}
                        {authMode === 'signup' && (
                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                              Confirm Password
                            </label>
                            <div className="relative">
                              <input
                                type={showConfirmPassword ? 'text' : 'password'}
                                value={authConfirmPassword}
                                onChange={(e) => setAuthConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal focus:border-transparent transition-all"
                              />
                              <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                              >
                                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Submit Button */}
                        <button
                          type="submit"
                          disabled={authLoading}
                          className="w-full py-3 px-4 rounded-xl bg-teal hover:bg-teal/90 text-white font-semibold shadow-lg shadow-teal/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {authLoading ? (
                            <>
                              <Loader2 size={18} className="animate-spin" />
                              {authMode === 'signin' ? 'Signing in...' : 'Creating account...'}
                            </>
                          ) : (
                            authMode === 'signin' ? 'Sign In' : 'Create Account'
                          )}
                        </button>
                      </form>

                      {/* Divider */}
                      <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-slate-200 dark:border-gray-700"></div>
                        </div>
                        <div className="relative flex justify-center text-xs">
                          <span className="bg-white dark:bg-charcoal px-2 text-slate-500 uppercase">Or continue with</span>
                        </div>
                      </div>

                      {/* Google Auth Button */}
                      <button
                        type="button"
                        onClick={handleGoogleAuth}
                        disabled={authLoading}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-slate-50 dark:hover:bg-gray-700 text-slate-700 dark:text-slate-300 font-medium transition-all disabled:opacity-50"
                      >
                        <svg className="h-5 w-5" viewBox="0 0 24 24">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        {authMode === 'signin' ? 'Sign in with Google' : 'Sign up with Google'}
                      </button>

                      {/* Toggle Link */}
                      <p className="text-center text-sm text-slate-500 mt-6">
                        {authMode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
                        <button
                          type="button"
                          onClick={toggleAuthMode}
                          className="text-teal hover:text-teal/80 font-medium"
                        >
                          {authMode === 'signin' ? 'Sign up' : 'Sign in'}
                        </button>
                      </p>
                    </div>
                  </div>
                )}

                {step === 1 && uid && (
                  <div className="space-y-6">
                    {/* Quick Templates Section */}
                    <div className="bg-teal/5 dark:bg-teal/10 rounded-2xl p-5 border border-teal/10 mb-8">
                      <div className="flex items-center gap-3 mb-4 text-teal">
                        <Sparkles size={20} />
                        <h4 className="font-bold text-sm uppercase tracking-wider">Quick Bundles</h4>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {quoteTemplates.map((template) => (
                          <button
                            key={template.id}
                            onClick={() => applyTemplate(template.id)}
                            className={`p-3 rounded-xl border-2 text-left transition-all hover:shadow-md ${
                              selectedTemplateId === template.id
                                ? 'border-teal bg-white dark:bg-gray-800 shadow-sm'
                                : 'border-slate-100 dark:border-gray-800 bg-white dark:bg-gray-900/50'
                            }`}
                          >
                            <div className="font-bold text-xs text-slate-800 dark:text-white mb-0.5">{template.name}</div>
                            <p className="text-[9px] text-slate-500 dark:text-slate-400 line-clamp-1">{template.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>

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
                        <p className="text-slate-500 italic">
                           {selectedTemplateId 
                              ? `Based on your selected ${quoteTemplates.find(t => t.id === selectedTemplateId)?.name} template.` 
                              : `Based on your ${formData.houseSize} and ₹${formData.budget} budget.`}
                        </p>
                      </div>
                      <button onClick={resetForm} className="text-teal hover:text-teal/80 text-sm font-bold bg-teal/5 dark:bg-teal-900/20 px-4 py-2 rounded-lg">New Plan</button>
                    </div>

                    <AnimatePresence>
                      {adminAccepted && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="mb-6 p-4 bg-green-100 text-green-800 rounded-xl flex items-center shadow-sm border border-green-200"
                        >
                          <CheckCircle2 className="mr-3 text-green-600" />
                          <span className="font-medium">Your requirement has been accepted by the admin.</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
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
                          initial={{ scale: 0.8, opacity: 0, y: 20, rotate: -2 }} 
                          animate={{ scale: 1, opacity: 1, y: 0, rotate: 0 }}
                          transition={{ 
                            type: 'spring', 
                            damping: 15, 
                            stiffness: 250,
                            mass: 0.8
                          } as any}
                          className="space-y-4"
                        >
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 shadow-lg shadow-emerald-500/5">
                              <CheckCircle2 size={32} strokeWidth={2.5} />
                            </div>
                            <div className="text-center">
                              <h5 className="text-xl font-black text-slate-800 dark:text-white leading-tight">Quote sent successfully!</h5>
                              <p className="text-sm text-slate-500 mt-1">Check your inbox for the full details.</p>
                            </div>
                          </div>

                          {/* WhatsApp delivery status */}
                          <div className="max-w-xs mx-auto">
                            {whatsappStatus === 'sending' && (
                              <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 text-xs font-bold justify-center bg-teal-50 dark:bg-teal-900/10 py-2 px-4 rounded-xl border border-teal-500/10">
                                <MessageCircle size={14} className="animate-pulse" />
                                Sending WhatsApp message...
                              </div>
                            )}
                            {whatsappStatus === 'sent' && (
                              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold justify-center bg-emerald-50 dark:bg-emerald-900/10 py-2 px-4 rounded-xl border border-emerald-500/10">
                                <CheckCircle2 size={14} />
                                WhatsApp message delivered!
                              </div>
                            )}
                            {whatsappStatus === 'failed' && (
                              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-bold justify-center bg-amber-50 dark:bg-amber-900/10 py-2 px-4 rounded-xl border border-amber-500/10">
                                <MessageCircle size={14} />
                                WhatsApp delivery failed. Verify your number.
                              </div>
                            )}
                            {whatsappStatus === 'skipped' && (
                              <div className="text-xs text-slate-400 text-center">
                                Add a phone number to also receive via WhatsApp.
                              </div>
                            )}
                          </div>
                        </motion.div>
                      ) : !showContactForm ? (
                        <button 
                          onClick={() => setShowContactForm(true)}
                          className="btn-primary py-3 px-10 flex items-center gap-3 mx-auto shadow-xl shadow-teal-500/20 relative z-10 hover:scale-105 transition-all"
                        >
                          <Wifi size={18} />
                          Send Details to My Email
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
                              placeholder="+91 9876543210 (with country code)"
                              value={recipientPhone}
                              onChange={e => setRecipientPhone(e.target.value)}
                              className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-teal-200 dark:border-teal-900/40 text-sm focus:ring-2 focus:ring-teal-500"
                            />
                            <p className="text-xs text-slate-400 -mt-1">
                              Include country code, e.g. <span className="font-semibold text-teal-500">+91</span> for India. Must be a <span className="font-semibold">different</span> number from the sender.
                            </p>
                          </div>
                          <div className="space-y-4">
                            <button 
                              disabled={isSending || !recipientEmail}
                              onClick={() => {
                                if (!window.navigator.onLine) {
                                  showNotification({
                                    message: 'No internet connection. Please check your network and try again.',
                                    type: 'error'
                                  });
                                  return;
                                }

                                console.log("[DEBUG] Button clicked, email:", recipientEmail);
                                notifyQuoteAction({
                                  type: 'quote_submitted',
                                  quoteId: `AI-${Date.now()}`,
                                  email: recipientEmail,
                                  phone: recipientPhone,
                                  templateId: selectedTemplateId || undefined,
                                  details: { budget: formData.budget, houseSize: formData.houseSize, templateId: selectedTemplateId }
                                });
                              }}
                              className="w-full btn-primary py-2.5 flex items-center justify-center gap-2 shadow-lg"
                            >
                              {isSending ? (
                                <>
                                  <Loader2 size={18} className="animate-spin" />
                                  {whatsappStatus === 'sending' ? 'Sending WhatsApp...' : 'Sending to Email...'}
                                </>
                              ) : (
                                <>
                                  <Wifi size={18} />
                                  Send Details to My Email
                                </>
                              )}
                            </button>
                            {sendSuccess && (
                              <div className="flex items-center gap-2 text-emerald-500 text-sm font-semibold animate-in fade-in slide-in-from-top-1">
                                <CheckCircle2 size={16} />
                                <span>Quote sent successfully!</span>
                              </div>
                            )}
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

