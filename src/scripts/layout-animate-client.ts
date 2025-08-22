// Runs on every page via Layout.astro
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouchDevice = matchMedia('(pointer: coarse)').matches;

// Simple rIC polyfill
const ric: typeof window.requestIdleCallback = (window as any).requestIdleCallback || ((cb: any) => setTimeout(cb, 1));

ric(async () => {
  if (prefersReducedMotion) return;

  // Dynamically load Lenis when idle
  try {
    const { default: Lenis } = await import('lenis');
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      direction: 'vertical',
      gestureDirection: 'vertical',
      smooth: !isTouchDevice,
      smoothTouch: false,
      touchMultiplier: 2,
      infinite: false,
    } as any);
    function raf(time: number) {
      (lenis as any).raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener?.('change', (e) => { if ((e as MediaQueryListEvent).matches) (lenis as any).destroy(); });
    } catch {}
  } catch {}

  // Lazy-load animation helpers after Lenis
  try {
    const { inViewReveal, scrollProgress, magneticButton } = await import('../lib/animate');
    scrollProgress();
    const revealElements = document.querySelectorAll('.reveal-on-scroll');
    if (revealElements.length > 0) inViewReveal(revealElements);
    (document.querySelectorAll('.btn-magnetic') as NodeListOf<HTMLElement>).forEach((btn) => magneticButton(btn as HTMLElement));
  } catch {}
});
