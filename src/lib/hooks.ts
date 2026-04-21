import { useEffect, useState } from 'react';

export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}

export function useDarkMode() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const getInitialTheme = (): 'light' | 'dark' => {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('theme')) {
        return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
      }
      if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
      return 'light';
    };

    const initial = getInitialTheme();
    setTheme(initial);
    document.documentElement.classList.toggle('dark', initial === 'dark');

    // Listener for theme changes in other islands/tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'theme') {
        const newTheme = e.newValue === 'dark' ? 'dark' : 'light';
        setTheme(newTheme);
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const toggleDarkMode = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  return { isDark: theme === 'dark', toggleDarkMode };
}