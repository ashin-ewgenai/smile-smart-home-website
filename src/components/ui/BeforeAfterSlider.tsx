import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Sparkles, MapPin } from 'lucide-react';

interface BeforeAfterSliderProps {
  beforeImage: string;
  afterImage: string;
  beforeLabel?: string;
  afterLabel?: string;
}

export default function BeforeAfterSlider({
  beforeImage,
  afterImage,
  beforeLabel = "Before",
  afterLabel = "After"
}: BeforeAfterSliderProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.min(Math.max((x / rect.width) * 100, 0), 100);
    setSliderPosition(percentage);
    if (showHint) setShowHint(false);
  };

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);
  
  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) handleMove(e.clientX);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (isDragging) handleMove(e.touches[0].clientX);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="group relative w-full max-w-5xl mx-auto">
      {/* Container with premium border and shadow */}
      <div 
        ref={containerRef}
        className="relative aspect-[16/9] md:aspect-[21/9] overflow-hidden rounded-[2rem] border-4 border-white/10 shadow-2xl cursor-col-resize select-none bg-charcoal"
      >
        {/* After Image (Background) */}
        <div className="absolute inset-0">
          <img 
            src={afterImage} 
            alt={afterLabel}
            className="w-full h-full object-cover"
            draggable={false}
          />
          {/* Subtle Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
        </div>
        
        {/* Before Image (Clipped Overlay) */}
        <div 
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${sliderPosition}%` }}
        >
          <img 
            src={beforeImage} 
            alt={beforeLabel}
            className="absolute inset-0 w-[1000%] h-full object-cover"
            style={{ width: containerRef.current?.offsetWidth || '100vw' }}
            draggable={false}
          />
          {/* Subtle Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />
        </div>

        {/* The Split Line / Handle */}
        <div 
          className="absolute top-0 bottom-0 w-1 bg-white/80 backdrop-blur-sm z-30 flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.5)]"
          style={{ left: `${sliderPosition}%` }}
        >
          {/* Central Controller */}
          <motion.div
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="relative w-12 h-12 bg-white rounded-full shadow-2xl flex items-center justify-center border-4 border-teal cursor-col-resize z-40 group-hover:shadow-teal/40 group-hover:shadow-2xl transition-shadow"
          >
            <div className="flex gap-0.5 text-teal">
              <ChevronLeft size={16} strokeWidth={3} />
              <ChevronRight size={16} strokeWidth={3} />
            </div>

            {/* Glowing Orbs */}
            <div className="absolute -inset-2 bg-teal/20 rounded-full blur-md animate-pulse pointer-events-none" />
          </motion.div>
        </div>

        {/* Glassmorphism Labels */}
        <div className="absolute top-6 left-6 z-40">
          <div className="px-4 py-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm font-bold tracking-widest uppercase shadow-lg">
            {beforeLabel}
          </div>
        </div>
        <div className="absolute top-6 right-6 z-40">
          <div className="px-4 py-2 rounded-xl bg-teal/20 backdrop-blur-md border border-teal/30 text-white text-sm font-bold tracking-widest uppercase shadow-lg">
            {afterLabel}
          </div>
        </div>

        {/* Interactive Hint */}
        <AnimatePresence>
          {showHint && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none"
            >
              <div className="bg-black/60 backdrop-blur-xl px-6 py-4 rounded-3xl border border-white/20 flex items-center gap-3 text-white shadow-2xl">
                <Sparkles className="text-teal animate-bounce" />
                <span className="font-medium">Slide to transform</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress Bar (Bottom) */}
        <div className="absolute bottom-0 left-0 h-1.5 bg-teal/30 w-full z-20">
          <div 
            className="h-full bg-teal shadow-[0_0_10px_#2dd4bf]" 
            style={{ width: `${sliderPosition}%` }} 
          />
        </div>
      </div>
      
      {/* Caption/Description (Optional/Added for UI improvement) */}
      <div className="mt-6 flex items-center justify-between px-4">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm italic">
          <MapPin size={14} />
          <span>Real smart home installation by Smile Smart Homes</span>
        </div>
        <div className="text-xs font-bold text-teal tracking-tighter uppercase">Smile Smart Engine v3.0</div>
      </div>
    </div>
  );
}