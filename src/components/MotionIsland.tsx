import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion } from '../lib/hooks';

interface MotionIslandProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
}

export default function MotionIsland({
  children,
  className = '',
  delay = 0,
  direction = 'up'
}: MotionIslandProps) {
  const prefersReducedMotion = useReducedMotion();

  const directions = {
    up: { y: 20, x: 0 },
    down: { y: -20, x: 0 },
    left: { y: 0, x: 20 },
    right: { y: 0, x: -20 }
  };

  const variants = {
    hidden: {
      opacity: 0,
      ...directions[direction]
    },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: {
        duration: prefersReducedMotion ? 0.01 : 0.28,
        delay: prefersReducedMotion ? 0 : delay,
        ease: [0.16, 1, 0.3, 1]
      }
    }
  };

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={variants}
    >
      {children}
    </motion.div>
  );
}

export function HeroMotion({ children }: { children: React.ReactNode }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: prefersReducedMotion ? 0.01 : 0.32,
        ease: [0.16, 1, 0.3, 1]
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerContainer({ children, className = '' }: { 
  children: React.ReactNode; 
  className?: string; 
}) {
  const prefersReducedMotion = useReducedMotion();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: prefersReducedMotion ? 0 : 0.06,
        delayChildren: prefersReducedMotion ? 0 : 0.1
      }
    }
  };

  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = '' }: { 
  children: React.ReactNode; 
  className?: string; 
}) {
  const prefersReducedMotion = useReducedMotion();

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: prefersReducedMotion ? 0.01 : 0.24,
        ease: [0.16, 1, 0.3, 1]
      }
    }
  };

  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}