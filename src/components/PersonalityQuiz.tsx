/**
 * PersonalityQuiz.tsx
 * File: src/components/PersonalityQuiz.tsx
 *
 * Buzzfeed-style personality quiz to assess user preferences and provide
 * tailored smart home automation recommendations.
 *
 * Features:
 * - Personality assessment questions (e.g., "Night owl or early bird?")
 * - Client-side result computation with personality types
 * - Tailored device recommendations based on quiz results
 * - Fully client-side using React state and hooks
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Heart,
  Sun,
  Moon,
  Zap,
  Shield,
  Home,
  Smartphone,
  Wifi,
  CheckCircle2,
  Loader2,
  RotateCcw,
  User,
  Clock,
  Lightbulb,
  Lock,
  Thermometer,
  Camera,
  Music,
  Tv
} from 'lucide-react';
import { useDevices } from '../contexts/DevicesContext';
import type { QuizAnswerValue, QuizQuestion, PersonalityType } from '../contexts/DevicesContext';
import type { DeviceRecommendation } from '../models';

// Answer icon mapping
const ANSWER_ICONS: Record<string, Record<string, React.ReactNode>> = {
  'When do you feel most productive?': {
    'A': <Sun size={24} />,
    'B': <Moon size={24} />,
    'C': <Clock size={24} />,
    'D': <Zap size={24} />
  },
  'How do you approach technology?': {
    'A': <Smartphone size={24} />,
    'B': <Home size={24} />,
    'C': <Shield size={24} />,
    'D': <Heart size={24} />
  },
  'What is your ideal weekend activity?': {
    'A': <Tv size={24} />,
    'B': <Music size={24} />,
    'C': <Lightbulb size={24} />,
    'D': <Wifi size={24} />
  }
};

// Personality icon mapping
const PERSONALITY_ICONS: Record<string, React.ReactNode> = {
  'comfort_maximizer': <Heart size={48} />,
  'security_guardian': <Shield size={48} />,
  'tech_enthusiast': <Zap size={48} />,
  'efficiency_expert': <Clock size={48} />
};


// Animation variants (matching DeviceRecommendationsForm.tsx patterns)
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

// Typewriter Component for Manifesto
const TypewriterText: React.FC<{ text: string; delay?: number }> = ({ text, delay = 0 }) => {
  const [displayedText, setDisplayedText] = useState('');
  
  useEffect(() => {
    let i = 0;
    const timer = setTimeout(() => {
      const interval = setInterval(() => {
        setDisplayedText(text.slice(0, i));
        i++;
        if (i > text.length) clearInterval(interval);
      }, 20);
      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timer);
  }, [text, delay]);

  return <span className="leading-relaxed">{displayedText}</span>;
};

interface QuizResultLocal {

  personalityType: PersonalityType;
  recommendations: DeviceRecommendation[];
}

export const PersonalityQuiz: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<number>(0); // 0 = intro, 1-3 = questions, 4 = results
  const [answers, setAnswers] = useState<Record<number, QuizAnswerValue>>({});
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [result, setResult] = useState<QuizResultLocal | null>(null);
  const [savedDevices, setSavedDevices] = useState<Set<string>>(new Set());

  const { showNotification, uid, saveRecommendationToQuote, quizQuestions, personalityTypes, personalityDeviceRecommendations, calculatePersonality } = useDevices();

  // Handle answer selection
  const handleAnswer = useCallback((questionId: number, answerValue: QuizAnswerValue) => {
    setAnswers(prev => ({ ...prev, [questionId]: answerValue }));

    // Auto-advance after a brief delay for better UX
    setTimeout(() => {
      if (questionId < quizQuestions.length) {
        setCurrentStep(questionId + 1);
      }
    }, 300);
  }, [quizQuestions.length]);

  // Submit quiz and get results
  const handleSubmit = useCallback(async () => {
    if (Object.keys(answers).length < quizQuestions.length) {
      showNotification({
        message: 'Please answer all questions to get your personalized recommendations.',
        type: 'warning'
      });
      return;
    }

    setIsCalculating(true);

    // Simulate processing delay for better UX
    await new Promise(resolve => setTimeout(resolve, 1500));

    const personality = calculatePersonality(answers);
    const recommendations = personalityDeviceRecommendations[personality.id];

    setResult({
      personalityType: personality,
      recommendations
    });

    setIsCalculating(false);
    setCurrentStep(quizQuestions.length + 1);
  }, [answers, calculatePersonality, showNotification, quizQuestions.length, personalityDeviceRecommendations]);

  // Reset quiz
  const handleReset = useCallback(() => {
    setCurrentStep(0);
    setAnswers({});
    setResult(null);
    setSavedDevices(new Set());
  }, []);

  // Save device to quote
  const handleSaveDevice = useCallback(async (device: DeviceRecommendation) => {
    if (!uid) {
      showNotification({
        message: 'Please sign in to save devices to your plan.',
        type: 'warning'
      });
      return;
    }

    try {
      await saveRecommendationToQuote(device);
      setSavedDevices(prev => new Set(prev).add(device.name));
      showNotification({
        message: `${device.name} added to your plan!`,
        type: 'success'
      });
    } catch (err: any) {
      showNotification({
        message: err?.message || 'Failed to save device',
        type: 'error'
      });
    }
  }, [uid, saveRecommendationToQuote, showNotification]);

  // Progress calculation
  const progress = useMemo(() => {
    if (currentStep === 0) return 0;
    if (currentStep > quizQuestions.length) return 100;
    return ((currentStep - 1) / quizQuestions.length) * 100;
  }, [currentStep, quizQuestions.length]);

  // Device category icons
  const getCategoryIcon = (category: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      'Climate Control': <Thermometer size={20} />,
      'Smart Lighting': <Lightbulb size={20} />,
      'Entertainment': <Tv size={20} />,
      'Smart Shades': <Sun size={20} />,
      'Security Cameras': <Camera size={20} />,
      'Smart Locks': <Lock size={20} />,
      'Motion Sensors': <Wifi size={20} />,
      'Access Control': <Shield size={20} />,
      'Smart Hubs': <Wifi size={20} />,
      'Voice Assistants': <User size={20} />,
      'Smart Displays': <Smartphone size={20} />,
      'Automation': <Zap size={20} />,
      'Smart Thermostats': <Thermometer size={20} />,
      'Smart Plugs': <Zap size={20} />,
      'Automated Lighting': <Lightbulb size={20} />,
      'Power Management': <Zap size={20} />
    };
    return iconMap[category] || <Home size={20} />;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="bg-white dark:bg-charcoal rounded-3xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-teal-700 p-8 text-white relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Sparkles size={120} />
          </div>
          <h2 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Heart className="text-yellow-400" />
            Smart Home Personality Quiz
          </h2>
          <p className="text-teal-50 max-w-lg">
            Discover your smart home personality and get personalized automation recommendations tailored to your lifestyle.
          </p>

          {/* Progress Bar */}
          {currentStep > 0 && currentStep <= quizQuestions.length && (
            <div className="mt-8">
              <div className="flex justify-between text-xs font-medium text-white/70 mb-2">
                <span>Question {currentStep} of {quizQuestions.length}</span>
                <span>{Math.round(progress)}% Complete</span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-white rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="p-8">
          <AnimatePresence mode="wait">
            {/* Intro Screen */}
            {currentStep === 0 && (
              <motion.div
                key="intro"
                variants={stepVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="text-center py-12"
              >
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 dark:from-teal-900/30 dark:to-cyan-900/30 flex items-center justify-center mx-auto mb-6">
                  <Sparkles className="text-teal dark:text-teal-400" size={48} />
                </div>
                <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">
                  Find Your Smart Home Personality
                </h3>
                <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-8 leading-relaxed">
                  Answer {quizQuestions.length} quick questions about your lifestyle and preferences.
                  We will reveal your smart home personality type and recommend the perfect devices for you.
                </p>
                <div className="flex flex-wrap justify-center gap-4 mb-8">
                  {Object.values(personalityTypes).map((type) => (
                    <div
                      key={type.id}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${type.bgColor} ${type.color}`}
                    >
                      {PERSONALITY_ICONS[type.id]}
                      {type.name}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setCurrentStep(1)}
                  className="btn-primary py-4 px-10 flex items-center gap-3 mx-auto shadow-xl shadow-teal-500/20 hover:scale-105 transition-all"
                >
                  Start Quiz
                  <ArrowRight size={20} />
                </button>
              </motion.div>
            )}

            {/* Question Screens */}
            {quizQuestions.map((question) => (
              currentStep === question.id && (
                <motion.div
                  key={`question-${question.id}`}
                  variants={stepVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="space-y-6"
                >
                  <div className="flex items-center gap-3 text-slate-700 dark:text-gray-300 mb-6">
                    <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-teal dark:text-teal-400 font-bold">
                      {question.id}
                    </div>
                    <h3 className="text-xl font-semibold">{question.question}</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {question.answers.map((answer) => (
                      <button
                        key={answer.value}
                        onClick={() => handleAnswer(question.id, answer.value)}
                        className={`flex items-start gap-4 p-5 rounded-2xl border-2 text-left transition-all hover:shadow-lg ${
                          answers[question.id] === answer.value
                            ? 'border-teal bg-teal-50 dark:bg-teal-900/20 text-teal dark:text-teal-300'
                            : 'border-slate-100 dark:border-gray-800 hover:border-teal/30 dark:hover:border-gray-700 bg-slate-50/50 dark:bg-gray-800/30'
                        }`}
                      >
                        <div className={`p-3 rounded-xl ${
                          answers[question.id] === answer.value
                            ? 'bg-teal text-white'
                            : 'bg-white dark:bg-gray-700 text-slate-400'
                        }`}>
                          {ANSWER_ICONS[question.question]?.[answer.value] || <Zap size={24} />}
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-lg mb-1">{answer.label}</div>
                          {answer.description && (
                            <div className="text-sm text-slate-500">{answer.description}</div>
                          )}
                        </div>
                        {answers[question.id] === answer.value && (
                          <CheckCircle2 className="text-teal shrink-0" size={24} />
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-between mt-8 pt-6 border-t border-slate-100 dark:border-gray-800">
                    <button
                      onClick={() => setCurrentStep(prev => prev - 1)}
                      className="flex items-center gap-2 text-slate-500 hover:text-teal font-medium transition-colors"
                    >
                      <ArrowLeft size={18} /> Back
                    </button>
                    {question.id === quizQuestions.length ? (
                      <button
                        onClick={handleSubmit}
                        disabled={!answers[question.id] || isCalculating}
                        className="btn-primary py-3 px-8 flex items-center gap-2 shadow-lg shadow-teal/20 transition-all disabled:opacity-50"
                      >
                        {isCalculating ? (
                          <>
                            <Loader2 className="animate-spin" size={18} />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles size={18} />
                            Get My Results
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => setCurrentStep(prev => prev + 1)}
                        disabled={!answers[question.id]}
                        className="btn-primary py-3 px-6 flex items-center gap-2 disabled:opacity-50"
                      >
                        Next <ArrowRight size={18} />
                      </button>
                    )}
                  </div>
                </motion.div>
              )
            ))}

            {/* Calculating Screen */}
            {isCalculating && (
              <motion.div
                key="calculating"
                variants={stepVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="text-center py-16"
              >
                <div className="relative w-24 h-24 mx-auto mb-6">
                  <motion.div
                    className="absolute inset-0 rounded-full border-4 border-teal-200 dark:border-teal-900/30"
                    animate={{ scale: [1, 1.2, 1], opacity: [1, 0.5, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="text-teal dark:text-teal-400" size={40} />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                  Analyzing Your Personality...
                </h3>
                <p className="text-slate-500">
                  Finding the perfect smart home setup for your lifestyle
                </p>
              </motion.div>
            )}

            {/* Results Screen */}
            {result && currentStep > quizQuestions.length && (
              <motion.div
                key="results"
                variants={stepVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="space-y-8"
              >
                {/* Personality Result Card */}
                <div className={`rounded-3xl p-8 ${result.personalityType.bgColor} ${result.personalityType.borderColor} border-2 text-center relative overflow-hidden`}>
                  <div className={`absolute top-4 right-4 opacity-10 ${result.personalityType.color}`}>
                    {PERSONALITY_ICONS[result.personalityType.id]}
                  </div>

                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                    className={`w-20 h-20 rounded-full ${result.personalityType.bgColor} ${result.personalityType.color} flex items-center justify-center mx-auto mb-4 shadow-lg`}
                  >
                    {PERSONALITY_ICONS[result.personalityType.id]}
                  </motion.div>

                  <div className={`inline-flex items-center gap-2 px-4 py-1 rounded-full text-sm font-bold mb-3 ${result.personalityType.bgColor} ${result.personalityType.color}`}>
                    <Sparkles size={16} />
                    Your Smart Home Personality
                  </div>

                  <h3 className={`text-3xl font-black mb-2 ${result.personalityType.color}`}>
                    {result.personalityType.name}
                  </h3>
                  <p className="text-lg font-medium text-slate-600 dark:text-slate-300 mb-4">
                    {result.personalityType.tagline}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 max-w-xl mx-auto leading-relaxed">
                    {result.personalityType.description}
                  </p>
                </div>

                {/* AI Manifesto Section */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.8 }}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] p-10 shadow-inner relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 p-6 opacity-[0.03] dark:opacity-[0.05] group-hover:scale-110 transition-transform duration-1000">
                    <Sparkles size={200} />
                  </div>
                  
                  <div className="flex items-center gap-3 mb-8">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-200 dark:to-slate-800" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
                      The Home Visionary Manifesto
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-200 dark:to-slate-800" />
                  </div>

                  <div className="relative z-10">
                    <p className="text-2xl font-serif italic font-medium text-slate-800 dark:text-white leading-relaxed text-center mb-10">
                      <TypewriterText text={result.personalityType.manifesto} delay={1000} />
                    </p>

                    <div className="flex flex-col items-center justify-center mt-12 pt-8 border-t border-slate-100 dark:border-slate-800/50">
                      <div className="font-signature text-4xl text-teal dark:text-teal-400 mb-2">
                        Smile Smart Homes
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Certified Personal Strategy
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Automation Scenarios */}
                <div className="bg-slate-50 dark:bg-gray-800/50 rounded-2xl p-6">
                  <h4 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    <Zap className="text-amber-500" size={20} />
                    Perfect Automations for You
                  </h4>
                  <div className="space-y-3">
                    {result?.personalityType.automationScenarios.map((scenario: string, index: number) => (
                      <div key={index} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-teal text-sm font-bold shrink-0 mt-0.5">
                          {index + 1}
                        </div>
                        <p className="text-slate-600 dark:text-slate-300">{scenario}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommended Devices */}
                <div>
                  <h4 className="text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    <Heart className="text-rose-500" size={24} />
                    Recommended Devices
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {result?.recommendations.map((device: DeviceRecommendation, i: number) => (
                      <motion.div
                        key={device.name}
                        custom={i}
                        variants={itemVariants}
                        initial="hidden"
                        animate="visible"
                        className="group p-5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-teal transition-all shadow-sm"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-2">
                            <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg text-teal dark:text-teal-400">
                              {getCategoryIcon(device.category)}
                            </div>
                            <span className="px-3 py-1 bg-teal-100 dark:bg-teal-900/30 text-teal text-xs font-bold rounded-full">
                              {device.category}
                            </span>
                          </div>
                          <button
                            onClick={() => handleSaveDevice(device)}
                            disabled={savedDevices.has(device.name)}
                            className={`p-2 rounded-full transition-all ${
                              savedDevices.has(device.name)
                                ? 'bg-emerald-100 text-emerald-600'
                                : 'bg-slate-100 dark:bg-gray-700 text-slate-400 hover:text-teal'
                            }`}
                          >
                            <Heart
                              size={18}
                              fill={savedDevices.has(device.name) ? 'currentColor' : 'none'}
                            />
                          </button>
                        </div>
                        <h5 className="text-lg font-bold text-slate-800 dark:text-white mb-2">
                          {device.name}
                        </h5>
                        <p className="text-sm text-slate-500 leading-relaxed mb-3">
                          {device.reason}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-bold text-slate-900 dark:text-white">
                            ₹{device.estimatedPrice.toLocaleString()}
                          </span>
                          {savedDevices.has(device.name) && (
                            <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                              <CheckCircle2 size={14} />
                              Saved
                            </span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* CTA Section */}
                <div className="bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 rounded-3xl p-8 text-center relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Sparkles size={100} />
                  </div>
                  <h4 className="text-xl font-bold text-slate-800 dark:text-white mb-3 relative z-10">
                    Want a detailed smart home plan?
                  </h4>
                  <p className="text-slate-500 mb-6 max-w-md mx-auto relative z-10">
                    Get a comprehensive quote with installation and personalized setup based on your {result?.personalityType.name} personality.
                  </p>
                  <div className="flex flex-wrap justify-center gap-4 relative z-10">
                    <button
                      onClick={handleReset}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white dark:bg-gray-800 text-slate-700 dark:text-slate-300 font-medium border border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700 transition-all"
                    >
                      <RotateCcw size={18} />
                      Retake Quiz
                    </button>
                    <a
                      href="#contact"
                      className="btn-primary py-3 px-8 flex items-center gap-2 shadow-lg shadow-teal/20"
                    >
                      <Sparkles size={18} />
                      Get Full Quote
                    </a>
                  </div>
                </div>

                {/* Disclaimer */}
                <div className="p-4 bg-slate-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-center text-xs text-slate-400">
                  Prices are estimates. Contact us for exact quotes including installation and configuration.
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default PersonalityQuiz;
