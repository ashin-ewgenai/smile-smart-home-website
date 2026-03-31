import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Home, Shield, DollarSign, ArrowRight, ArrowLeft, Loader2, CheckCircle2, ChevronRight, Heart } from 'lucide-react';
import { useDevices, DevicesProvider } from '../contexts/DevicesContext';
import { HOUSE_SIZES, SECURITY_LEVELS, BUDGET_RANGES } from '../lib/constants';
import type { DeviceRecommendation, RecommendationRequest } from '../models';

/**
 * Hook for managing the recommendation form state and API interaction.
 */
export function useDeviceRecommendations() {
  const { fetchRecommendations, recommendations, recommendationLoading, error, saveRecommendationToQuote, uid } = useDevices();
  const [step, setStep] = useState<number>(1);
  const [formData, setFormData] = useState<RecommendationRequest>({
    houseSize: '',
    budget: 1500,
    securityNeeds: 'Medium',
    preferences: []
  });

  const updateFormData = (data: Partial<RecommendationRequest>) => {
    setFormData(prev => ({ ...prev, ...data }));
  };

  const nextStep = () => setStep(prev => prev + 1);
  const prevStep = () => setStep(prev => prev - 1);

  const handleSubmit = async () => {
    await fetchRecommendations(formData);
    nextStep(); // Move to results step
  };

  const resetForm = () => {
    setStep(1);
    setFormData({
      houseSize: '',
      budget: 1500,
      securityNeeds: 'Medium',
      preferences: []
    });
  };

  return {
    step,
    setStep,
    formData,
    updateFormData,
    nextStep,
    prevStep,
    handleSubmit,
    resetForm,
    recommendations,
    loading: recommendationLoading,
    error,
    saveRecommendationToQuote,
    uid
  };
}

/**
 * The premium, multi-step AI recommendation form component.
 * Included in this file for 5-file consolidation requirements.
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
    uid
  } = useDeviceRecommendations();

  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [savedIds, setSavedIds] = React.useState<Set<string>>(new Set());
  const [saveError, setSaveError] = React.useState<string | null>(null);

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
        className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
      >
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-white relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Sparkles size={120} />
          </div>
          <h2 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Sparkles className="text-yellow-400" />
            AI Smart Recommendations
          </h2>
          <p className="text-blue-100 max-w-lg">
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
            {step === 1 && (
              <motion.div key="step1" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="space-y-6">
                <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300 mb-4">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600">
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
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                          : 'border-slate-100 dark:border-slate-800 hover:border-blue-200 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30'
                      }`}
                    >
                      <span className="font-medium">{size}</span>
                      <ChevronRight size={18} className={formData.houseSize === size ? 'opacity-100' : 'opacity-30'} />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="space-y-6">
                <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300 mb-4">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600">
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
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                          : 'border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        formData.securityNeeds === level ? 'border-indigo-500 bg-indigo-500 ring-4 ring-indigo-100 dark:ring-indigo-900/40' : 'border-slate-300'
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
                  <button onClick={prevStep} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 font-medium"><ArrowLeft size={18} /> Back</button>
                  <button onClick={nextStep} className="bg-slate-900 dark:bg-white dark:text-slate-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-colors">Next <ArrowRight size={18} /></button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="space-y-6">
                <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300 mb-4">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600">
                    <DollarSign size={24} />
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
                          : 'border-slate-100 dark:border-slate-800 hover:border-emerald-200 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30'
                      }`}
                    >
                      <div className="text-lg font-bold">{range.label}</div>
                    </button>
                  ))}
                </div>
                <div className="flex justify-between mt-8">
                  <button onClick={prevStep} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 font-medium"><ArrowLeft size={18} /> Back</button>
                  <button onClick={handleSubmit} disabled={loading} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg shadow-blue-200 dark:shadow-none">
                    {loading ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />}
                    {loading ? 'Consulting AI...' : 'Generate My Plan'}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div key="step4" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="space-y-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><CheckCircle2 className="text-emerald-500" /> Your Custom Smart Plan</h3>
                    <p className="text-slate-500 italic">Based on your {formData.houseSize} and ${formData.budget} budget.</p>
                  </div>
                  <button onClick={resetForm} className="text-blue-600 hover:text-blue-700 text-sm font-bold bg-blue-50 dark:bg-blue-900/20 px-4 py-2 rounded-lg">New Plan</button>
                </div>
                {error && <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm">{error}</div>}
                {saveError && <div className="p-4 bg-amber-50 border border-amber-100 text-amber-700 rounded-xl text-sm flex items-center gap-2"><Shield size={16} />{saveError}</div>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recommendations.map((device, i) => (
                    <motion.div key={device.name} custom={i} variants={itemVariants} className="group p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-blue-500 transition-all shadow-sm">
                      <div className="flex justify-between items-start mb-3">
                        <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 text-xs font-bold rounded-full">{device.category}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-900 dark:text-white font-bold">${device.estimatedPrice}*</span>
                          <button 
                            onClick={() => handleSave(device)}
                            disabled={savingId === device.name || savedIds.has(device.name)}
                            className={`p-1.5 rounded-full transition-all ${savedIds.has(device.name) ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 dark/bg-slate-700 text-slate-400 hover:text-blue-500'}`}
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
                <div className="mt-8 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-300 text-center text-sm text-slate-500">
                  *Estimated prices are representative. Our team can provide a precise quote for installation and hardware.
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

/**
 * Astro-friendly wrapper component.
 * Exported to be used in index.astro islands.
 */
export const RecommendationsWrapper: React.FC = () => {
  return (
    <DevicesProvider>
      <DeviceRecommendationsForm />
    </DevicesProvider>
  );
};
