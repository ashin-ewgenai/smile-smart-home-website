import React, { useRef } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'framer-motion';
import { MessageSquare, ClipboardList, Zap, GraduationCap } from 'lucide-react';

const steps = [
  {
    step: 1,
    title: "Free Consultation",
    description: "We assess your needs, discuss options, and provide a detailed quote tailored to your home.",
    icon: MessageSquare
  },
  {
    step: 2,
    title: "Custom Planning",
    description: "Our experts design a system layout optimized for your lifestyle and home architecture.",
    icon: ClipboardList
  },
  {
    step: 3,
    title: "Professional Installation",
    description: "Certified technicians install and configure all devices with minimal disruption to your routine.",
    icon: Zap
  },
  {
    step: 4,
    title: "Setup & Training",
    description: "We configure everything, test all systems, and train you on using your new smart home.",
    icon: GraduationCap
  }
];

export default function InteractiveRoadmap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start center", "end center"]
  });

  const scaleY = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  return (
    <div ref={containerRef} className="relative max-w-3xl mx-auto py-12">
      {/* Background Line */}
      <div className="absolute left-6 top-0 bottom-0 w-1 bg-gray-200 dark:bg-gray-800 rounded-full" />
      
      {/* Animated Path */}
      <motion.div 
        className="absolute left-6 top-0 bottom-0 w-1 bg-teal rounded-full origin-top"
        style={{ scaleY }}
      />

      <div className="space-y-12 relative">
        {steps.map((item, index) => (
          <StepItem 
            key={item.step} 
            {...item} 
            isLast={index === steps.length - 1} 
            progress={scrollYProgress}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}

function StepItem({ step, title, description, icon: Icon, isLast, progress, index }: any) {
  const itemThreshold = (index) / steps.length;
  const opacity = useTransform(progress, [itemThreshold, itemThreshold + 0.1], [0.3, 1]);
  const scale = useTransform(progress, [itemThreshold, itemThreshold + 0.1], [0.95, 1]);
  const iconColor = useTransform(progress, [itemThreshold, itemThreshold + 0.1], ["#94a3b8", "#14b8a6"]);

  return (
    <motion.div 
      style={{ opacity, scale }}
      className="flex items-start gap-8 relative"
    >
      {/* Step Number Bubble */}
      <div className="relative z-10 flex-shrink-0">
        <motion.div 
          style={{ backgroundColor: iconColor }}
          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold shadow-lg shadow-teal/20"
        >
          {step}
        </motion.div>
      </div>

      {/* Content Card */}
      <div className="flex-grow pt-1">
        <div className="flex items-center gap-3 mb-3">
          <motion.div style={{ color: iconColor }}>
            <Icon size={24} />
          </motion.div>
          <h3 className="text-xl font-bold text-charcoal dark:text-white">
            {title}
          </h3>
        </div>
        <p className="text-gray-600 dark:text-gray-400 leading-relaxed max-w-xl">
          {description}
        </p>
      </div>
    </motion.div>
  );
}
