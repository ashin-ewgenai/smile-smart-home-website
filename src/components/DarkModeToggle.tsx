import React from 'react';
import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useDarkMode, useReducedMotion } from '../lib/hooks';

export default function DarkModeToggle() {
  const { isDark, toggleDarkMode } = useDarkMode();
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.button
      onClick={toggleDarkMode}
      className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      whileHover={{ scale: prefersReducedMotion ? 1 : 1.05 }}
      whileTap={{ scale: prefersReducedMotion ? 1 : 0.95 }}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <motion.div
        initial={false}
        animate={{ rotate: isDark ? 180 : 0 }}
        transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
      >
        {isDark ? <Sun size={20} /> : <Moon size={20} />}
      </motion.div>
    </motion.button>
  );
}