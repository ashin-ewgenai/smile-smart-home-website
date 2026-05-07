import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../../lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import { CheckCircle2, ChevronRight, ChevronLeft, Send, Sparkles, User, Mail, MessageSquare, Shield, Lightbulb, Thermometer, Tv, Globe } from 'lucide-react';

type ContactFormState = {
  name: string;
  email: string;
  phone: string;
  service: string;
  message: string;
};

type FormErrors = {
  email?: string;
};

const initialState: ContactFormState = {
  name: '',
  email: '',
  phone: '',
  service: '',
  message: '',
};

const services = [
  { id: 'security', label: 'Security Systems', icon: Shield, color: 'text-teal bg-teal/10' },
  { id: 'lighting', label: 'Smart Lighting', icon: Lightbulb, color: 'text-yellow-500 bg-yellow-500/10' },
  { id: 'climate', label: 'Climate Control', icon: Thermometer, color: 'text-blue-500 bg-blue-500/10' },
  { id: 'entertainment', label: 'Entertainment', icon: Tv, color: 'text-purple-500 bg-purple-500/10' },
  { id: 'networking', label: 'Networking', icon: Globe, color: 'text-cyan-500 bg-cyan-500/10' },
  { id: 'other', label: 'Other', icon: Sparkles, color: 'text-gray-500 bg-gray-500/10' },
];

export default function ContactForm() {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(1);
  const [values, setValues] = useState<ContactFormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  // Email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  useEffect(() => {
    setMounted(true);
  }, []);

  const nextStep = () => setStep(s => Math.min(s + 1, 3));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const canGoNext = useMemo(() => {
    if (step === 1) return values.service !== '';
    if (step === 2) return values.name.trim() !== '' && values.email.trim() !== '' && emailRegex.test(values.email);
    return true;
  }, [step, values]);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setValues((v) => ({ ...v, [name]: value }));
      
      // Validate email on change
      if (name === 'email') {
        if (value.trim() === '') {
          setFormErrors(prev => ({ ...prev, email: undefined }));
        } else if (!emailRegex.test(value)) {
          setFormErrors(prev => ({ ...prev, email: 'Please enter a valid email address' }));
        } else {
          setFormErrors(prev => ({ ...prev, email: undefined }));
        }
      }
    },
    []
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      await addDoc(collection(db, 'contactRequests'), {
        fullName: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        phone: values.phone.trim(),
        message: values.message.trim(),
        createdAt: serverTimestamp(),
        status: 'pending',
        service: values.service,
      });

      setSuccessMsg('Your inquiry has been received! Our team will contact you shortly.');
      setValues(initialState);
      setStep(4); // Success step
    } catch (err) {
      console.error('Contact form save failed:', err);
      setErrorMsg('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted) return <div className="h-[400px]" />;

  return (
    <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 md:p-10 border border-gray-100 dark:border-gray-800 shadow-xl overflow-hidden min-h-[500px] flex flex-col">
      {/* Progress Bar */}
      {step < 4 && (
        <div className="mb-10">
          <div className="flex justify-between mb-2">
            {[1, 2, 3].map((s) => (
              <div 
                key={s} 
                className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-300 ${
                  step >= s ? 'bg-teal border-teal text-white' : 'border-gray-200 dark:border-gray-700 text-gray-400'
                }`}
              >
                {step > s ? <CheckCircle2 size={16} /> : s}
              </div>
            ))}
          </div>
          <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-teal"
              initial={{ width: '0%' }}
              animate={{ width: `${(step - 1) * 50}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-grow"
          >
            <h3 className="text-2xl font-bold text-charcoal dark:text-white mb-2">What do you need help with?</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-8">Select a service to start your custom inquiry.</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setValues(v => ({ ...v, service: s.id }))}
                  className={`p-4 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center text-center gap-3 group ${
                    values.service === s.id 
                    ? 'border-teal bg-teal/5 ring-4 ring-teal/5' 
                    : 'border-gray-100 dark:border-gray-800 hover:border-teal/30 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${s.color} group-hover:scale-110 transition-transform`}>
                    <s.icon size={24} />
                  </div>
                  <span className="font-semibold text-sm text-charcoal dark:text-white">{s.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-grow"
          >
            <h3 className="text-2xl font-bold text-charcoal dark:text-white mb-2">Tell us who you are</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-8">We'll use this to get in touch about your project.</p>
            
            <div className="space-y-6">
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  name="name"
                  placeholder="Your Full Name"
                  className="pill-input w-full pl-12"
                  value={values.name}
                  onChange={onChange}
                  required
                />
              </div>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="email"
                  name="email"
                  placeholder="Email Address"
                  className={`pill-input w-full pl-12 ${formErrors.email ? 'border-red-500 focus:border-red-500' : ''}`}
                  value={values.email}
                  onChange={onChange}
                  required
                />
              </div>
              {formErrors.email && (
                <p className="text-red-500 text-sm mt-2 flex items-center gap-2">
                  <Sparkles size={14} />
                  {formErrors.email}
                </p>
              )}
              <div className="phone-input-container">
                <PhoneInput
                  country="in"
                  value={values.phone}
                  onChange={(phone: string) => setValues(v => ({ ...v, phone }))}
                  containerClass="w-full"
                  inputClass="!w-full !h-12 !rounded-full !border-gray-200 dark:!border-gray-700 dark:!bg-gray-800 dark:!text-white !pl-14"
                  buttonClass="!border-none !bg-transparent !pl-4"
                />
              </div>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-grow"
          >
            <h3 className="text-2xl font-bold text-charcoal dark:text-white mb-2">Project Details</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-8">Share any specific requirements or questions you have.</p>
            
            <div className="relative">
              <MessageSquare className="absolute left-4 top-4 text-gray-400" size={18} />
              <textarea
                name="message"
                rows={6}
                placeholder="What can we build for you?"
                className="pill-textarea w-full pl-12 pt-4"
                value={values.message}
                onChange={onChange}
                required
              />
            </div>
            
            {errorMsg && (
              <p className="text-red-500 text-sm mt-4 flex items-center gap-2">
                <Sparkles size={14} /> {errorMsg}
              </p>
            )}
          </motion.div>
        )}

        {step === 4 && (
          <motion.div
            key="step4"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-grow flex flex-col items-center justify-center text-center py-10"
          >
            <div className="w-20 h-20 bg-teal/10 rounded-full flex items-center justify-center text-teal mb-6 animate-bounce">
              <CheckCircle2 size={40} />
            </div>
            <h3 className="text-3xl font-bold text-charcoal dark:text-white mb-4">Success!</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-sm mb-8">
              {successMsg}
            </p>
            <button 
              onClick={() => setStep(1)}
              className="px-8 py-3 bg-teal text-white rounded-xl font-bold hover:bg-teal/90 transition-all"
            >
              Start New Inquiry
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation Controls */}
      {step < 4 && (
        <div className="mt-10 flex items-center justify-between pt-6 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={prevStep}
            disabled={step === 1}
            className={`flex items-center gap-2 text-gray-500 hover:text-charcoal dark:hover:text-white transition-colors ${step === 1 ? 'opacity-0 pointer-events-none' : ''}`}
          >
            <ChevronLeft size={20} />
            Back
          </button>
          
          {step < 3 ? (
            <button
              onClick={nextStep}
              disabled={!canGoNext}
              className="flex items-center gap-2 bg-teal text-white px-8 py-3 rounded-xl font-bold hover:bg-teal/90 disabled:opacity-50 transition-all shadow-lg shadow-teal/20"
            >
              Continue
              <ChevronRight size={20} />
            </button>
          ) : (
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="flex items-center gap-2 bg-gradient-to-r from-teal to-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:scale-105 transition-all shadow-lg shadow-teal/20"
            >
              {submitting ? 'Sending...' : 'Send Inquiry'}
              <Send size={18} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
