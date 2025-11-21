import Lenis from 'lenis';
import { inViewReveal, scrollProgress, magneticButton } from './animate';

// Initialize smooth scrolling with Lenis
const lenis = new Lenis({
  duration: 1.2,
  easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
});

function raf(time: number) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

document.addEventListener('DOMContentLoaded', () => {
  // Initialize scroll progress
  scrollProgress();

  // Initialize reveal animations
  const revealElements = document.querySelectorAll('.reveal-on-scroll');
  if (revealElements.length > 0) {
    inViewReveal(revealElements as NodeListOf<Element>);
  }

  // Initialize magnetic buttons
  const magneticButtons = document.querySelectorAll('.btn-magnetic');
  magneticButtons.forEach((button) => magneticButton(button as HTMLElement));

  // Respect reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    // @ts-ignore lenis has destroy in runtime
    lenis.destroy?.();
  }
});
