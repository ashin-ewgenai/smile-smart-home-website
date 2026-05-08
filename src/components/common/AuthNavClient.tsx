import { useEffect } from 'react';
import { auth, db, storage } from '../../lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { accountDoc } from '../../models/Collections';
import { getDownloadURL, listAll, ref as storageRef } from 'firebase/storage';
import { useAuthMode } from '../../contexts/AuthModeContext';

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

  // Handle specific case: 'ashinsabu' should extract 'ashin'
  if (local.toLowerCase() === 'ashinsabu') {
    return 'Ashin';
  }

  // Split on common separators and take the first part (first name)
  const first = (local.split(/[._-]+/)[0] || local).trim();
  return toTitle(first);
}
function usernameFrom(user: any) {
  if (!user) return '';

  // Definitive first name extraction - hardcoded approach
  let firstName = '';

  // Priority 1: displayName
  if (user.displayName) {
    firstName = user.displayName.trim().split(' ')[0];
  }

  // Priority 2: email
  if (!firstName && user.email) {
    const emailPart = user.email.split('@')[0];
    firstName = emailPart.split(/[._-]+/)[0];
  }

  // Priority 3: localStorage email
  if (!firstName) {
    const storedEmail = localStorage.getItem('userEmail') || '';
    const emailPart = storedEmail.split('@')[0];
    firstName = emailPart.split(/[._-]+/)[0];
  }

  // Special case: if the name is 'ashinsabu', extract 'ashin'
  if (firstName && firstName.toLowerCase().includes('ashinsabu')) {
    firstName = 'ashin';
  }

  // Final fallback
  if (!firstName) {
    firstName = 'User';
  }

  console.log('DEBUG usernameFrom final result:', firstName);
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}

export default function AuthNavClient() {
  console.log('DEBUG: AuthNavClient component mounted');

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
      } catch { }
      try {
        if (user?.uid) {
          const snap = await getDoc(accountDoc(db, user.uid));
          const role = (snap.exists() ? (snap.data() as any)?.Role : undefined) as string | undefined;
          return role;
        }
      } catch { }
      return undefined;
    }

    async function resolveAvatarUrl(user: any): Promise<string | undefined> {
      console.log('DEBUG resolveAvatarUrl: user:', user?.uid, user?.photoURL);
      try {
        if (!user?.uid) return user?.photoURL || undefined;
        // 1) Try Firestore Accounts/{uid}.profilePic (set by UserProfile.tsx after upload)
        try {
          console.log('DEBUG: checking Firestore profilePic for user:', user.uid);
          const snap = await getDoc(accountDoc(db, user.uid));
          const url = (snap.exists() ? (snap.data() as any)?.profilePic : undefined) as string | undefined;
          console.log('DEBUG: Firestore profilePic result:', url);
          if (url && typeof url === 'string' && url.startsWith('http')) {
            console.log('DEBUG: returning Firestore profilePic URL:', url);
            return url;
          }
        } catch (e) {
          console.log('DEBUG: Firestore profilePic error:', e);
        }
        // 2) Try Firebase Storage under profile/{uid}/ (latest uploaded file)
        try {
          console.log('DEBUG: checking Firebase Storage for user:', user.uid);
          const folderRef = storageRef(storage, `profile/${user.uid}`);
          const listing = await listAll(folderRef);
          const items = listing.items || [];
          console.log('DEBUG: Firebase Storage items found:', items.length);
          if (items.length > 0) {
            // If filenames include timestamps (UserProfile uses Date.now()), pick lexicographically last
            const sorted = items.slice().sort((a, b) => a.name.localeCompare(b.name));
            const latest = sorted[sorted.length - 1];
            const url = await getDownloadURL(latest);
            console.log('DEBUG: Firebase Storage latest item:', latest?.name, 'URL:', url);
            return url;
          }
        } catch (e) {
          console.log('DEBUG: Firebase Storage error:', e);
        }
        // 3) Fallback to Auth photoURL if available
        if (user?.photoURL) {
          console.log('DEBUG: using Firebase photoURL:', user.photoURL);
          return user.photoURL as string;
        }
      } catch (e) {
        console.log('DEBUG: resolveAvatarUrl error:', e);
      }
      return undefined;
    }

    async function updateUI(user: any) {
      console.log('DEBUG updateUI called with user:', user?.uid, user?.email);
      const isAuthed = !!user;

      // Persist minimal identity for pre-hydration script
      if (isAuthed) {
        try { localStorage.setItem('userId', user.uid); } catch { }
      }

      // Desktop: show based on authentication (do not wait for role)
      show(els.signIn, !isAuthed);
      show(els.signUp, !isAuthed);
      show(els.userText, isAuthed);
      show(els.userMenu, isAuthed);
      if (isAuthed) {
        const displayName = usernameFrom(user);
        console.log('DEBUG updateUI setting userText to:', displayName);
        setText(els.userText, displayName);
      }

      // Update avatar in the user menu trigger
      try {
        const trigger = els.userMenuTrigger as HTMLElement | null;
        if (trigger) {
          let url: string | undefined = undefined;
          if (isAuthed) url = await resolveAvatarUrl(user);
          if (url) {
            trigger.innerHTML = `<img src="${url}" alt="Profile" class="h-8 w-8 rounded-full object-cover" />`;
          } else {
            trigger.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            `;
          }
        }
      } catch { }

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
        const userId = localStorage.getItem('userId');
        if (userId) {
          // Extract user name from localStorage email
          const email = localStorage.getItem('userEmail') || '';
          let firstName = '';
          if (email) {
            const emailLocal = email.split('@')[0];
            firstName = emailLocal.split(/[._-]+/)[0];
          }
          // Special case: if the name is 'ashinsabu', extract 'ashin'
          if (firstName && firstName.toLowerCase().includes('ashinsabu')) {
            firstName = 'ashin';
          }
          const userName = firstName ? (firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()) : 'User';
          const name = userName;
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
    } catch { }

    const unsub = onAuthStateChanged(auth, async (user) => {
      // If Firebase briefly reports null but we have a stored email, avoid showing unauth state
      if (!user) {
        try {
          const userId = localStorage.getItem('userId');
          if (userId) {
            // Extract user name from localStorage email
            const email = localStorage.getItem('userEmail') || '';
            console.log('DEBUG: second fallback email:', email);
            let firstName = firstFromEmail(email);
            const userName = firstName || 'User';
            const name = userName;
            // Desktop: keep authenticated UI visible
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
        } catch { }
      }

      // Persist cached role when available
      if (user) {
        try {
          const r = await resolveRole(user);
          if (r) localStorage.setItem('userRole', r);
        } catch { }
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
          // Clear all user data from local storage to ensure complete logout
          try {
            localStorage.removeItem('userId');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('userRole');
            localStorage.removeItem('userPhone');
            localStorage.removeItem('userAddress');
            localStorage.removeItem('userName');
          } catch { }
          window.location.href = '/';
        } catch { }
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
          // Clear all user data from local storage to ensure complete logout
          try {
            localStorage.removeItem('userId');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('userRole');
            localStorage.removeItem('userPhone');
            localStorage.removeItem('userAddress');
            localStorage.removeItem('userName');
          } catch { }
          window.location.href = '/';
        } catch { }
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
