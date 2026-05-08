import React, { useEffect, useRef } from 'react';
import { DevicesProvider, useDevices } from '../../contexts/DevicesContext';
import AuthModal from './AuthModal';
import AuthNavClient from '../common/AuthNavClient';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

/**
 * Wrapper component that bundles DevicesProvider with AuthModal and AuthNavClient
 */
export default function AuthModalWrapper() {
  return (
    <DevicesProvider>
      <AuthModalContent />
    </DevicesProvider>
  );
}

const AuthModalContent = () => {
  const { notification, hideNotification } = useDevices();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (notification.isOpen && notification.mode === 'modal') {
      const previouslyFocused = document.activeElement as HTMLElement;
      modalRef.current?.focus();
      return () => {
        previouslyFocused?.focus();
      };
    }
  }, [notification.isOpen, notification.mode]);

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

  return (
    <>
      <AuthModal />
      <AuthNavClient />

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
                <div className={`p-2 rounded-xl ${notification.type === 'error' ? 'bg-red-500/10 text-red-500' :
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
                <button onClick={hideNotification} className="text-slate-400 hover:text-slate-600 transition-colors focus:outline-none">
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
                  <div className={`h-1.5 w-full ${notification.type === 'error' ? 'bg-red-500' :
                      notification.type === 'success' ? 'bg-emerald-500' :
                        'bg-teal'
                    }`} />
                  <div className="p-8">
                    <div className="flex items-center gap-4 mb-6">
                      <div className={`p-3 rounded-2xl ${notification.type === 'error' ? 'bg-red-500/10 text-red-500' :
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
                        className="px-8 py-3 rounded-xl font-bold bg-teal text-white hover:bg-teal/90 transition-all shadow-lg shadow-teal/20 focus:outline-none"
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
    </>
  );
};
