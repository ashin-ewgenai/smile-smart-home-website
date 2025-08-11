interface InViewRevealOptions {
  threshold?: number;
  rootMargin?: string;
  stagger?: number;
  translateY?: number;
  duration?: number;
}

export function inViewReveal(
  elements: NodeListOf<Element> | Element[],
  options: InViewRevealOptions = {}
) {
  const {
    threshold = 0.1,
    rootMargin = '0px 0px -50px 0px',
    stagger = 60,
    translateY = 12,
    duration = 280
  } = options;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    Array.from(elements).forEach(el => {
      (el as HTMLElement).style.opacity = '1';
      (el as HTMLElement).style.transform = 'translateY(0)';
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            const element = entry.target as HTMLElement;
            element.style.transition = `opacity ${duration}ms ease-out, transform ${duration}ms ease-out`;
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
          }, index * stagger);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold, rootMargin }
  );

  Array.from(elements).forEach((el) => {
    const element = el as HTMLElement;
    element.style.opacity = '0';
    element.style.transform = `translateY(${translateY}px)`;
    observer.observe(element);
  });

  return observer;
}

export function parallax(element: HTMLElement, strength: number = 0.1) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  let ticking = false;

  function updateParallax() {
    const scrolled = window.pageYOffset;
    const rate = scrolled * -strength;
    element.style.transform = `translateY(${rate}px)`;
    ticking = false;
  }

  function handleScroll() {
    if (!ticking) {
      requestAnimationFrame(updateParallax);
      ticking = true;
    }
  }

  window.addEventListener('scroll', handleScroll, { passive: true });
  
  return () => window.removeEventListener('scroll', handleScroll);
}

export function scrollProgress() {
  let progressBar: HTMLElement | null = null;
  let ticking = false;

  function createProgressBar() {
    progressBar = document.createElement('div');
    progressBar.className = 'scroll-progress';
    progressBar.style.transform = 'scaleX(0)';
    document.body.appendChild(progressBar);
  }

  function updateProgress() {
    if (!progressBar) return;
    
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercent = scrollTop / docHeight;
    
    progressBar.style.transform = `scaleX(${scrollPercent})`;
    ticking = false;
  }

  function handleScroll() {
    if (!ticking) {
      requestAnimationFrame(updateProgress);
      ticking = true;
    }
  }

  createProgressBar();
  window.addEventListener('scroll', handleScroll, { passive: true });

  return () => {
    window.removeEventListener('scroll', handleScroll);
    progressBar?.remove();
  };
}

export function magneticButton(button: HTMLElement, maxOffset: number = 6) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  let isHovering = false;

  function handleMouseMove(e: MouseEvent) {
    if (!isHovering) return;

    const rect = button.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const deltaX = e.clientX - centerX;
    const deltaY = e.clientY - centerY;
    
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const maxDistance = Math.max(rect.width, rect.height) / 2;
    
    if (distance < maxDistance) {
      const strength = Math.min(distance / maxDistance, 1);
      const offsetX = (deltaX / maxDistance) * maxOffset * strength;
      const offsetY = (deltaY / maxDistance) * maxOffset * strength;
      
      button.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(1.02)`;
    }
  }

  function handleMouseEnter() {
    isHovering = true;
  }

  function handleMouseLeave() {
    isHovering = false;
    button.style.transform = 'translate(0px, 0px) scale(1)';
  }

  button.addEventListener('mousemove', handleMouseMove);
  button.addEventListener('mouseenter', handleMouseEnter);
  button.addEventListener('mouseleave', handleMouseLeave);

  return () => {
    button.removeEventListener('mousemove', handleMouseMove);
    button.removeEventListener('mouseenter', handleMouseEnter);
    button.removeEventListener('mouseleave', handleMouseLeave);
  };
}