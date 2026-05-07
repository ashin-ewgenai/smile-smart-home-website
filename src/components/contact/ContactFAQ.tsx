import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const faqs = [
  {
    q: 'How long does installation take?',
    a: 'Most installations take 4-8 hours depending on the complexity. Complete home automation for a full villa can take 1-2 days.',
  },
  {
    q: 'Do you provide warranties?',
    a: 'Yes, we provide a 1-year comprehensive warranty on all installation work and honor manufacturer warranties on all devices (typically 1-3 years).',
  },
  {
    q: 'What brands do you work with?',
    a: 'We are brand-agnostic and work with all leading ecosystems including Google Home, Apple HomeKit, Amazon Alexa, Philips Hue, Ring, and Nest.',
  },
  {
    q: 'Is financing available?',
    a: 'Absolutely. We offer flexible payment plans and financing options through our banking partners to make smart living accessible.',
  },
  {
    q: 'Do you provide ongoing support?',
    a: "We offer 24/7 priority support for all our installations. Our 'Smart Care' plans include regular health checks for your system.",
  },
  {
    q: 'Can I upgrade my system later?',
    a: 'Our systems are built on scalable architectures. You can start with a single room and expand your smart home ecosystem at your own pace.',
  },
];

export default function ContactFAQ() {
  // null means no item is open; a number tracks the single open index
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setActiveIndex((prev) => (prev === index ? null : index));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {faqs.map((faq, i) => {
        const isOpen = activeIndex === i;
        const headingId = `faq-heading-${i}`;
        const panelId = `faq-panel-${i}`;

        return (
          <div
            key={i}
            className={`bg-white dark:bg-gray-900 rounded-2xl border transition-all duration-300 overflow-hidden reveal-on-scroll ${
              isOpen
                ? 'border-teal/40 shadow-md shadow-teal/5'
                : 'border-gray-200 dark:border-gray-700 hover:border-teal/30'
            }`}
          >
            {/* Accordion Trigger */}
            <button
              id={headingId}
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggle(i)}
              className="w-full flex items-center justify-between p-6 text-left focus:outline-none focus:ring-0 focus:ring-offset-0 group border-0 outline-none"
              style={{ outline: 'none', textDecoration: 'none' }}
            >
              <h3
                className={`text-lg font-bold transition-colors m-0 ${
                  isOpen
                    ? 'text-teal'
                    : 'text-charcoal dark:text-white group-hover:text-teal'
                }`}
              >
                {faq.q}
              </h3>

              <motion.span
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="ml-4 flex-shrink-0"
                aria-hidden="true"
              >
                <svg
                  className={`w-6 h-6 transition-colors ${
                    isOpen ? 'text-teal' : 'text-gray-400 group-hover:text-teal'
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </motion.span>
            </button>

            {/* Accordion Panel */}
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={panelId}
                  role="region"
                  aria-labelledby={headingId}
                  key={panelId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  <p className="px-6 pb-6 text-gray-600 dark:text-gray-300 leading-relaxed">
                    {faq.a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
