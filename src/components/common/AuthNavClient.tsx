import { useEffect } from 'react';
import { auth } from '../../lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

function setText(el: Element | null, text: string) {
  if (el) (el as HTMLElement).textContent = text && text.trim() ? text : 'Dashboard';
}
function show(el: Element | null, yes: boolean) {
  if (!el) return;
  const e = el as HTMLElement;
  if (yes) {
    e.classList.remove('hidden');
    e.style.display = '';
    e.setAttribute('aria-hidden', 'false');
  } else {
    e.classList.add('hidden');
    e.style.display = 'none';
    e.setAttribute('aria-hidden', 'true');
  }
}

function toTitle(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
function firstFromDisplayName(name?: string | null) {
  if (!name) return '';
  const first = name.trim().split(/\s+/)[0] || '';
  return toTitle(first);
}
function firstFromEmail(email?: string | null) {
  if (!email) return '';
  const local = email.split('@')[0] || '';
  const first = (local.split(/[._-]+/)[0] || local).trim();
  return toTitle(first);
}
function usernameFrom(user: any) {
  if (!user) return '';
  const first = firstFromDisplayName(user.displayName) || firstFromEmail(user.email) || 'there';
  return `Hi ${first}`;
}

export default function AuthNavClient() {
  useEffect(() => {
    const els = {
      signIn: document.querySelector('[data-auth="signin-desktop"]'),
      signUp: document.querySelector('[data-auth="signup-desktop"]'),
      userText: document.querySelector('[data-auth="user-desktop"]'),
      userMenu: document.querySelector('[data-auth="user-menu-desktop"]'),
      userMenuTrigger: document.querySelector('[data-auth="user-menu-trigger"]'),
      userMenuDropdown: document.querySelector('[data-auth="user-menu-dropdown"]'),
      dashAction: document.querySelector('[data-auth="dashboard-action"]'),
      logoutAction: document.querySelector('[data-auth="logout-action"]'),
      // Mobile keeps existing behavior
      mSignIn: document.querySelector('[data-auth="signin-mobile"]'),
      mSignUp: document.querySelector('[data-auth="signup-mobile"]'),
      mUserBtn: document.querySelector('[data-auth="user-mobile"]'),
      mLogout: document.querySelector('[data-auth="logout-mobile"]'),
    } as const;

    function updateUI(user: any) {
      const isAuthed = !!user;
      // Desktop
      show(els.signIn, !isAuthed);
      show(els.signUp, !isAuthed);
      show(els.userText, isAuthed);
      show(els.userMenu, isAuthed);
      setText(els.userText, usernameFrom(user));
      // Mobile
      show(els.mSignIn, !isAuthed);
      show(els.mSignUp, !isAuthed);
      show(els.mUserBtn, isAuthed);
      show(els.mLogout, isAuthed);
      setText(els.mUserBtn, usernameFrom(user));
    }

    try {
      updateUI(auth.currentUser);
      // Fallback immediate username from localStorage if present
      if (!auth.currentUser) {
        const email = localStorage.getItem('userEmail');
        if (email) {
          const name = `Hi ${firstFromEmail(email) || 'there'}`;
          show(els.signIn, false);
          show(els.signUp, false);
          show(els.userText, true);
          show(els.userMenu, true);
          setText(els.userText, name);
          show(els.mSignIn, false);
          show(els.mSignUp, false);
          show(els.mUserBtn, true);
          show(els.mLogout, true);
          setText(els.mUserBtn, name);
        }
      }
    } catch {}

    const unsub = onAuthStateChanged(auth, (user) => {
      updateUI(user);
      // Close dropdown on sign-out
      if (!user && els.userMenuDropdown) (els.userMenuDropdown as HTMLElement).classList.add('hidden');
    });

    // Wire dropdown actions (desktop)
    if (els.dashAction) {
      els.dashAction.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/dashboard/user';
      });
    }
    if (els.logoutAction) {
      els.logoutAction.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await signOut(auth);
          try { localStorage.removeItem('userEmail'); } catch {}
          window.location.href = '/';
        } catch {}
      });
    }

    // Dropdown toggle and outside click (desktop)
    function closeDropdown() {
      (els.userMenuDropdown as HTMLElement | null)?.classList.add('hidden');
    }
    function toggleDropdown() {
      const dd = els.userMenuDropdown as HTMLElement | null;
      if (!dd) return;
      dd.classList.toggle('hidden');
    }
    els.userMenuTrigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown();
    });
    document.addEventListener('click', (e) => {
      const t = e.target as Element | null;
      if (!t) return;
      if (t.closest('[data-auth="user-menu-desktop"]')) return;
      closeDropdown();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDropdown();
    });

    // Mobile logout support remains
    const mLogout = els.mLogout as HTMLElement | null;
    if (mLogout) {
      mLogout.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await signOut(auth);
          try { localStorage.removeItem('userEmail'); } catch {}
          window.location.href = '/';
        } catch {}
      });
    }

    return () => {
      unsub();
    };
  }, []);

  return null;
}
