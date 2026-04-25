import React, { useEffect, useRef } from 'react';

const LiquidIntelligence: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    if (isTouchDevice) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const { clientX, clientY } = e;
      const x = (clientX / window.innerWidth) * 100;
      const y = (clientY / window.innerHeight) * 100;
      containerRef.current.style.setProperty('--mouse-x', `${x}%`);
      containerRef.current.style.setProperty('--mouse-y', `${y}%`);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{
        background: 'radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(20, 184, 166, 0.15) 0%, transparent 50%)',
        transition: 'background 0.3s ease-out',
      }}
    >
      <div className="absolute inset-0 opacity-30 dark:opacity-20 blur-[100px]">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-teal rounded-full animate-blob"></div>
        <div className="absolute top-[20%] right-[-10%] w-[45%] h-[45%] bg-blue-500 rounded-full animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-[-10%] left-[20%] w-[40%] h-[40%] bg-purple-500 rounded-full animate-blob animation-delay-4000"></div>
      </div>
      
      {/* Liquid Filter Container */}
      <svg className="hidden">
        <defs>
          <filter id="liquid">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="liquid" />
            <feComposite in="SourceGraphic" in2="liquid" operator="atop" />
          </filter>
        </defs>
      </svg>
      
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 7s infinite alternate;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}} />
    </div>
  );
};

export default LiquidIntelligence;
