// Lightweight toast utility for client-side pages
// Usage: import { showToast } from '../lib/toast';

export type ToastVariant = 'success' | 'info' | 'warn' | 'error';

function getToastHost(): HTMLElement {
  const main = document.querySelector('main');
  const hostId = 'toast-host-admin';
  let host = document.getElementById(hostId) as HTMLElement | null;
  if (!host) {
    host = document.createElement('div');
    host.id = hostId;
    host.className = 'fixed top-4 right-4 z-[1000] flex flex-col gap-2';
    (main as HTMLElement | null)?.appendChild(host) || document.body.appendChild(host);
  }
  return host;
}

export function showToast(message: string, variant: ToastVariant = 'info', durationMs = 2200) {
  try {
    const host = getToastHost();
    const el = document.createElement('div');
    const styles = variant === 'success'
      ? 'bg-teal-600 text-white'
      : variant === 'warn'
      ? 'bg-amber-600 text-white'
      : variant === 'error'
      ? 'bg-red-600 text-white'
      : 'bg-gray-800 text-white';
    el.className = `rounded-md px-3 py-2 text-sm shadow-lg ${styles}`;
    el.textContent = message;

    // Add simple fade-in/out animation
    el.style.transition = 'opacity 200ms ease';
    el.style.opacity = '0';
    host.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 200);
    }, durationMs);
  } catch {}
}
