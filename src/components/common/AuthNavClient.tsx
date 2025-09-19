import { useEffect } from 'react';
import { auth, db } from '../../lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { accountDoc } from '../../models/Collections';

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

    async function resolveRole(user: any): Promise<string | undefined> {
      // Priority: localStorage -> Firestore -> undefined
      try {
        const lsRole = localStorage.getItem('userRole');
        if (lsRole) return lsRole.toString();
      } catch {}
      try {
        if (user?.uid) {
          const snap = await getDoc(accountDoc(db, user.uid));
          const role = (snap.exists() ? (snap.data() as any)?.Role : undefined) as string | undefined;
          return role;
        }
      } catch {}
      return undefined;
    }

    async function updateUI(user: any) {
      const isAuthed = !!user;

      // Persist minimal identity for pre-hydration script
      if (isAuthed) {
        try { if (user.email) localStorage.setItem('userEmail', user.email); } catch {}
      }

      // Desktop: show based on authentication (do not wait for role)
      show(els.signIn, !isAuthed);
      show(els.signUp, !isAuthed);
      show(els.userText, isAuthed);
      show(els.userMenu, isAuthed);
      if (isAuthed) setText(els.userText, usernameFrom(user));

      // Mobile (use authentication state)
      show(els.mSignIn, !isAuthed);
      show(els.mSignUp, !isAuthed);
      show(els.mUserBtn, isAuthed);
      show(els.mLogout, isAuthed);
      if (isAuthed) setText(els.mUserBtn, usernameFrom(user));
    }

    try {
      // Initial paint: prefer localStorage heuristic to avoid flash
      const current = auth.currentUser;
      if (current) {
        void updateUI(current);
      } else {
        const email = localStorage.getItem('userEmail');
        if (email) {
          const name = `Hi ${firstFromEmail(email) || 'there'}`;
          // Desktop based on authentication presence
          show(els.signIn, false);
          show(els.signUp, false);
          show(els.userText, true);
          show(els.userMenu, true);
          setText(els.userText, name);
          // Mobile uses auth presence (email in LS implies logged in previously)
          show(els.mSignIn, false);
          show(els.mSignUp, false);
          show(els.mUserBtn, true);
          show(els.mLogout, true);
          setText(els.mUserBtn, name);
        } else {
          // No hints; render minimal unauthenticated state
          void updateUI(null);
        }
      }
    } catch {}

    const unsub = onAuthStateChanged(auth, async (user) => {
      // If Firebase briefly reports null but we have a stored email, avoid showing unauth state
      if (!user) {
        try {
          const email = localStorage.getItem('userEmail');
          if (email) {
            const name = `Hi ${firstFromEmail(email) || 'there'}`;
            // Desktop: keep authenticated UI visible
            show(els.signIn, false);
            show(els.signUp, false);
            show(els.userText, true);
            show(els.userMenu, true);
            setText(els.userText, name);
            // Mobile
            show(els.mSignIn, false);
            show(els.mSignUp, false);
            show(els.mUserBtn, true);
            show(els.mLogout, true);
            setText(els.mUserBtn, name);
            // Do not early-return; allow subsequent auth to refine
          }
        } catch {}
      }

      // Persist cached role when available
      if (user) {
        try {
          const r = await resolveRole(user);
          if (r) localStorage.setItem('userRole', r);
        } catch {}
      }
      void updateUI(user);
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

    // Mobile actions
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
    const mUserBtn = els.mUserBtn as HTMLElement | null;
    if (mUserBtn) {
      mUserBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/dashboard/user';
      });
    }

    return () => {
      unsub();
    };
  }, []);

  return null;
}
