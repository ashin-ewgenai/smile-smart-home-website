import React, { useEffect, useRef, useState } from 'react';
import GlassCard from '../ui/GlassCard';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

const TiltCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ['15deg', '-15deg']);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ['-15deg', '15deg']);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    if (isTouchDevice) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;

    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      className={`relative ${className}`}
    >
      <div style={{ transform: 'translateZ(50px)', transformStyle: 'preserve-3d' }}>
        {children}
      </div>
    </motion.div>
  );
};

const InnovationDNA: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Particle[] = [];
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    const particleCount = isTouchDevice ? 20 : 40;
    const mouse = { x: 0, y: 0, active: false };

    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      originX: number;
      originY: number;

      constructor(width: number, height: number) {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.originX = this.x;
        this.originY = this.y;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.size = Math.random() * 2 + 1;
      }

      update(width: number, height: number) {
        if (mouse.active) {
          const dx = mouse.x - this.x;
          const dy = mouse.y - this.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 200) {
            const force = (200 - dist) / 200;
            this.vx += dx * force * 0.02;
            this.vy += dy * force * 0.02;
          }
        }

        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.95;
        this.vy *= 0.95;

        // Return to origin slowly
        this.vx += (this.originX - this.x) * 0.01;
        this.vy += (this.originY - this.y) * 0.01;

        if (this.x < 0 || this.x > width) this.vx *= -1;
        if (this.y < 0 || this.y > height) this.vy *= -1;
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(20, 184, 166, 0.5)';
        ctx.fill();
      }
    }

    const handleCanvasMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    };

    const handleCanvasMouseLeave = () => {
      mouse.active = false;
    };

    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || 400;
      particles = Array.from({ length: particleCount }, () => new Particle(canvas.width, canvas.height));
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particles.forEach(p => {
        p.update(canvas.width, canvas.height);
        p.draw(ctx);
      });

      // Draw connections
      ctx.strokeStyle = 'rgba(20, 184, 166, 0.1)';
      ctx.lineWidth = 1;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 150) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseleave', handleCanvasMouseLeave);
    window.addEventListener('resize', resize);
    resize();
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener('mousemove', handleCanvasMouseMove);
      canvas.removeEventListener('mouseleave', handleCanvasMouseLeave);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <section className="section-padding bg-soft-gray dark:bg-charcoal/50 relative overflow-hidden">
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 z-0 opacity-40 dark:opacity-20 pointer-events-none"
      />
      
      <div className="container relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-heading-lg font-bold text-charcoal dark:text-white mb-4">
            Our Innovation <span className="text-teal">DNA</span>
          </h2>
          <p className="text-body-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            The perfect fusion of elite craftsmanship and cutting-edge GenAI intelligence.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 perspective-1000">
          <TiltCard>
            <GlassCard className="p-8 text-center border-teal/20 hover:border-teal/50 transition-colors h-full">
              <div className="w-16 h-16 bg-teal/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-charcoal dark:text-white mb-4">GenAI Driven</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Leveraging advanced language models and computer vision to predict and automate your lifestyle needs.
              </p>
            </GlassCard>
          </TiltCard>

          <TiltCard>
            <GlassCard className="p-8 text-center border-blue-500/20 hover:border-blue-500/50 transition-colors h-full">
              <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a2 2 0 00-1.96 1.414l-.727 2.903a2 2 0 01-3.568 0l-.727-2.903a2 2 0 00-1.96-1.414l-2.387.477a2 2 0 00-1.022.547l2.146 2.146a2 2 0 002.828 0l.793-.793a2 2 0 012.828 0l.793.793a2 2 0 002.828 0l2.146-2.146z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-charcoal dark:text-white mb-4">Elite Craftsmanship</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Professional white-glove installation services that ensure your technology is as beautiful as it is functional.
              </p>
            </GlassCard>
          </TiltCard>

          <TiltCard>
            <GlassCard className="p-8 text-center border-purple-500/20 hover:border-purple-500/50 transition-colors h-full">
              <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-charcoal dark:text-white mb-4">Future Proof</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Built on scalable infrastructure that evolves with the rapid pace of technological innovation.
              </p>
            </GlassCard>
          </TiltCard>
        </div>
      </div>
    </section>
  );
};

export default InnovationDNA;
