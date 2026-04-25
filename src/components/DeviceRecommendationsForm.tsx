/**
 * DeviceRecommendationsForm.tsx
 * File: src/components/DeviceRecommendationsForm.tsx
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
import { doc, setDoc, getDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';
import { accountDoc, newAccountPayload, accountLoginMergePayload } from '../models/Collections';

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

          {step <= 4 && (
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
            <motion.div key="consultant" variants={stepVariants} initial="hidden" animate="visible" exit="exit">
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

                    <div className="relative my-6">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-200 dark:border-gray-700"></div>
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="bg-white dark:bg-charcoal px-2 text-slate-500 uppercase">Or continue with</span>
                      </div>
                    </div>

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
                  <div className="bg-teal/5 dark:bg-teal/10 rounded-2xl p-5 border border-teal/10 mb-8">
                    <div className="flex items-center gap-3 mb-4 text-teal">
                      <Sparkles size={20} />
                      <h4 className="font-bold text-sm uppercase tracking-wider">Quick Bundles</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {quoteTemplates.map((template: any) => (
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
                    {HOUSE_SIZES.map((size: string) => (
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
                    {SECURITY_LEVELS.map((level: string) => (
                      <button
                        key={level}
                        onClick={() => { updateFormData({ securityNeeds: level }); nextStep(); }}
                        className={`flex items-center justify-between p-5 rounded-2xl border-2 text-left transition-all hover:shadow-lg ${
                          formData.securityNeeds === level
                            ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300'
                            : 'border-slate-100 dark:border-gray-800 hover:border-cyan-200 dark:hover:border-gray-700 bg-slate-50/50 dark:bg-gray-800/30'
                        }`}
                      >
                        <span className="font-medium">{level}</span>
                        <ChevronRight size={18} className={formData.securityNeeds === level ? 'opacity-100' : 'opacity-30'} />
                      </button>
                    ))}
                  </div>
                  <button onClick={prevStep} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 mt-4">
                    <ArrowLeft size={16} /> Back
                  </button>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 text-slate-700 dark:text-gray-300 mb-4">
                    <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600">
                      <IndianRupee size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold">Budget Consideration</h3>
                      <p className="text-sm text-slate-500">What is your comfort range for the initial smart home investment?</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {BUDGET_RANGES.map((range: { label: string; value: number }) => (
                      <button
                        key={range.label}
                        onClick={() => updateFormData({ budget: range.value })}
                        className={`flex items-center justify-between p-5 rounded-2xl border-2 text-left transition-all hover:shadow-lg ${
                          formData.budget === range.value
                            ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                            : 'border-slate-100 dark:border-gray-800 hover:border-amber-200 dark:hover:border-gray-700 bg-slate-50/50 dark:bg-gray-800/30'
                        }`}
                      >
                        <span className="font-medium">{range.label}</span>
                        <ChevronRight size={18} className={formData.budget === range.value ? 'opacity-100' : 'opacity-30'} />
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-8">
                    <button onClick={prevStep} className="flex items-center gap-2 text-slate-500 hover:text-slate-700">
                      <ArrowLeft size={16} /> Back
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={loading || !formData.budget}
                      className="bg-teal hover:bg-teal/90 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-teal/20 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="animate-spin" size={18} /> : 'Get Recommendations'}
                    </button>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-8">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <Sparkles className="text-yellow-500" />
                      Your Smart Blueprint
                    </h3>
                    <div className="flex gap-2">
                      {selectedTemplateId && (
                        <div className="text-[10px] bg-teal/10 text-teal px-3 py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle2 size={10} />
                          {quoteTemplates.find((t: any) => t.id === selectedTemplateId)?.name}
                        </div>
                      )}
                      <button onClick={resetForm} className="text-xs text-teal hover:underline font-medium">
                        Start Over
                      </button>
                    </div>
                  </div>

                  {adminAccepted && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-2xl p-4 flex items-start gap-3">
                      <CheckCircle2 className="text-emerald-500 mt-1" size={20} />
                      <div>
                        <p className="font-bold text-emerald-800 dark:text-emerald-300">Your plan has been approved!</p>
                        <p className="text-sm text-emerald-600 dark:text-emerald-400">An expert consultant accepted your request on {new Date(acceptedAt).toLocaleDateString()}. Check your email for details.</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {recommendations.map((device: any, i: number) => (
                      <motion.div
                        key={device.name}
                        custom={i}
                        variants={itemVariants}
                        className="bg-slate-50 dark:bg-gray-800/50 rounded-2xl p-5 border border-slate-100 dark:border-gray-700 hover:shadow-md transition-shadow group"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="font-bold text-slate-800 dark:text-white group-hover:text-teal transition-colors">{device.name}</h4>
                          <button
                            onClick={() => handleSave(device)}
                            disabled={savingId === device.name || savedIds.has(device.name)}
                            className={`p-2 rounded-lg transition-all ${
                              savedIds.has(device.name)
                                ? 'bg-emerald-100 text-emerald-600'
                                : 'bg-white dark:bg-gray-700 text-slate-400 hover:text-teal'
                            }`}
                          >
                            {savingId === device.name ? <Loader2 className="animate-spin" size={18} /> : (savedIds.has(device.name) ? <CheckCircle2 size={18} /> : <Heart size={18} />)}
                          </button>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">{device.reason}</p>
                        <div className="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-gray-700">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{device.category}</span>
                          <span className="font-bold text-teal">₹{device.estimatedPrice.toLocaleString()}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="mt-12 bg-white dark:bg-gray-800 rounded-3xl p-8 border border-slate-100 dark:border-gray-700 shadow-xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                      <MessageCircle size={120} />
                    </div>
                    
                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-teal/10 flex items-center justify-center">
                          <MessageCircle className="text-teal" size={24} />
                        </div>
                        <div>
                          <h4 className="text-xl font-bold text-slate-800 dark:text-white">Professional Consultation</h4>
                          <p className="text-sm text-slate-500">Send this plan to our engineers for a detailed technical review.</p>
                        </div>
                      </div>

                      {sendSuccess ? (
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-2xl text-center border border-emerald-100 dark:border-emerald-800">
                          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 className="text-emerald-600 dark:text-emerald-300" size={32} />
                          </div>
                          <h5 className="font-bold text-emerald-900 dark:text-emerald-100 text-lg mb-2">Quote Sent Successfully!</h5>
                          <p className="text-emerald-700 dark:text-emerald-300 text-sm mb-4">Check your email for the confirmation. Our team will contact you within 24 hours.</p>
                          {whatsappStatus === 'sending' && <p className="text-xs text-emerald-600/60 animate-pulse">Synchronizing WhatsApp delivery...</p>}
                          {whatsappStatus === 'sent' && (
                            <div className="flex items-center justify-center gap-2 text-xs text-emerald-600 font-bold bg-white dark:bg-gray-800 py-2 px-4 rounded-full w-fit mx-auto shadow-sm">
                              <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                              WhatsApp Confirmation Delivered
                            </div>
                          )}
                          {whatsappStatus === 'failed' && <p className="text-xs text-red-500 mt-2 font-medium">WhatsApp delivery failed, but email was sent.</p>}
                        </div>
                      ) : (
                        <div className="space-y-4 max-w-lg">
                          {!showContactForm ? (
                            <button
                              onClick={() => setShowContactForm(true)}
                              className="w-full bg-teal text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-teal/20 hover:scale-[1.02] active:scale-95 transition-all"
                            >
                              Finalize & Send My Quote
                            </button>
                          ) : (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
                                  <input
                                    type="email"
                                    value={recipientEmail}
                                    onChange={(e) => setRecipientEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="w-full bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 p-4 rounded-xl focus:ring-2 focus:ring-teal outline-none transition-all"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">WhatsApp (Optional)</label>
                                  <input
                                    type="tel"
                                    value={recipientPhone}
                                    onChange={(e) => setRecipientPhone(e.target.value)}
                                    placeholder="+91 00000 00000"
                                    className="w-full bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 p-4 rounded-xl focus:ring-2 focus:ring-teal outline-none transition-all"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-3">
                                <button
                                  onClick={async () => {
                                    if (isSending || !recipientEmail) return;
                                    
                                    if (!validEmail(recipientEmail)) {
                                      showNotification({ message: 'Please enter a valid email address', type: 'error' });
                                      return;
                                    }

                                    try {
                                      // 1. Create a lead record in Firestore
                                      const leadRef = await addDoc(collection(db, 'Planner_Leads'), {
                                        email: recipientEmail.toLowerCase().trim(),
                                        uid: uid || '',
                                        phoneNumber: recipientPhone || '',
                                        whatsappNumber: recipientPhone || '',
                                        source: 'ai_consultant',
                                        status: 'new',
                                        createdAt: serverTimestamp(),
                                        updatedAt: serverTimestamp(),
                                        complexity: 'AI Consultant',
                                        planText: `[AI Recommendations] Budget: ₹${formData.budget}, Space: ${formData.houseSize}, Security: ${formData.securityNeeds}`,
                                        formData: {
                                          ...formData,
                                          recommendations
                                        }
                                      });

                                      // 2. Trigger notifications
                                      await notifyQuoteAction({
                                        type: 'quote_submitted',
                                        quoteId: leadRef.id,
                                        email: recipientEmail,
                                        phone: recipientPhone || undefined,
                                        name: 'Valued Customer',
                                        templateId: selectedTemplateId || undefined,
                                        details: { 
                                          recommendations, 
                                          formData, 
                                          selectedTemplate: selectedTemplateId,
                                          budget: formData.budget,
                                          houseSize: formData.houseSize
                                        }
                                      });
                                    } catch (err: any) {
                                      console.error('[DeviceRecommendationsForm] Submission failed:', err);
                                      // notifyQuoteAction internally shows notification on error
                                    }
                                  }}
                                  disabled={isSending || !recipientEmail}
                                  className="flex-1 bg-teal text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-teal/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                                >
                                  {isSending ? <Loader2 className="animate-spin" /> : <ArrowRight />} Confirm Delivery
                                </button>
                                <button onClick={() => setShowContactForm(false)} className="px-6 py-4 rounded-2xl border border-slate-200 dark:border-gray-700 font-bold text-slate-400 hover:bg-slate-50 transition-all">Cancel</button>
                              </div>
                            </motion.div>
                          )}
                          <p className="text-[10px] text-slate-400 font-medium px-1">By sending this quote, you agree to our privacy policy and consent to technical communication via the provided channels.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      <div className="mt-16">
        <RoomVisualization />
      </div>
    </div>
  );
};
