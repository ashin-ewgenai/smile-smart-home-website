import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PenLine, Check, X, Copy } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { SUPER_ADMIN_BASE_PATH } from '../../lib/constants';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface Props { uid: string; }

export default function User_Admin_Edit({ uid }: Props) {
  const location = useLocation();
  const seg = useMemo(() => {
    try { return new URLSearchParams(location.search).get('seg') || ''; } catch { return ''; }
  }, [location.search]);
  const listLabel = useMemo(() => {
    switch ((seg || '').toLowerCase()) {
      case 'admins': return 'Admins';
      case 'users': return 'Users';
      case 'admins24h': return 'Recent Admins (24h)';
      case 'users24h': return 'Recent Users (24h)';
      case 'adminlogins12h': return 'Recent Admin Logins (12h)';
      case 'userlogins12h': return 'Recent User Logins (12h)';
      case 'lastweek': return 'Last Week Signups';
      default: return 'All Members';
    }
  }, [seg]);
  const listHref = useMemo(() => `${SUPER_ADMIN_BASE_PATH}/users${seg ? `?seg=${encodeURIComponent(seg)}` : ''}`, [seg]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showBack, setShowBack] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [initialDisplayName, setInitialDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [initialRole, setInitialRole] = useState<string>('user');
  const [createdAt, setCreatedAt] = useState<any>(null);
  const [lastLoginAt, setLastLoginAt] = useState<any>(null);
  const [lastLoginAtText, setLastLoginAtText] = useState<string>('');
  const [lastLoginUserAgent, setLastLoginUserAgent] = useState<string>('');
  const [loginCount, setLoginCount] = useState<number | null>(null);
  const [minDelayDone, setMinDelayDone] = useState(false);
  const [editName, setEditName] = useState(false);
  const [editRole, setEditRole] = useState(false);
  // Toggle reveal for UID
  const [showUid, setShowUid] = useState(false);
  const [copied, setCopied] = useState(false);
  // Local copied states for specific inline copy buttons
  const [copiedName, setCopiedName] = useState(false);
  const [copiedRole, setCopiedRole] = useState(false);
  // For dynamic width of the display name input
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [namePxWidth, setNamePxWidth] = useState<number>(0);

  const createdAtText = useMemo(() => {
    try {
      if (createdAt?.toDate) return createdAt.toDate().toLocaleString();
    } catch {}
    return '—';
  }, [createdAt]);

  // Measure the width of the display name text while editing, so the input matches content width
  useEffect(() => {
    if (editName && measureRef.current) {
      const w = measureRef.current.offsetWidth || 0;
      // Add padding to account for input horizontal padding (px-3 ~ 0.75rem each side)
      setNamePxWidth(w + 24);
    }
  }, [displayName, editName]);
  const lastLoginAtPretty = useMemo(() => {
    try {
      if (lastLoginAt?.toDate) return lastLoginAt.toDate().toLocaleString();
    } catch {}
    return '—';
  }, [lastLoginAt]);

  // Small helper to render text with a copy-on-hover icon
  function CopyableText({ text, className, title }: { text: string; className?: string; title?: string }) {
    const [localCopied, setLocalCopied] = useState(false);
    return (
      <span className="group inline-flex items-center gap-2" title={title || text}>
        <span className={className}>{text}</span>
        <button
          type="button"
          onClick={async (e) => { e.stopPropagation(); try { await navigator.clipboard.writeText(text || ''); setLocalCopied(true); setTimeout(()=>setLocalCopied(false), 1200); } catch {} }}
          className="opacity-0 group-hover:opacity-100 inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:text-teal-700 hover:bg-teal-50 active:bg-teal-600 active:text-white transition-colors dark:text-gray-400 dark:hover:text-teal-300 dark:hover:bg-teal-900/20 dark:active:bg-teal-600/80 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          aria-label="Copy value"
          title={localCopied ? 'Copied' : 'Copy'}
        >
          {localCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </span>
    );
  }

  // Compute if form has changes
  const isDirty = useMemo(() => {
    const nameChanged = displayName !== initialDisplayName;
    const roleChanged = initialRole !== 'Super Admin' && role !== initialRole;
    return nameChanged || roleChanged;
  }, [displayName, initialDisplayName, role, initialRole]);

  // Auto-hide success toast and then show Back action
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => {
      setSaved(false);
      setShowBack(true);
    }, 2000);
    return () => clearTimeout(t);
  }, [saved]);

  // Ensure skeleton shows for at least 0.5s
  useEffect(() => {
    const t = setTimeout(() => setMinDelayDone(true), 500);
    return () => clearTimeout(t);
  }, []);

  // Auto-hide UID a few seconds after revealing
  useEffect(() => {
    if (!showUid) return;
    const t = setTimeout(() => setShowUid(false), 6000);
    return () => clearTimeout(t);
  }, [showUid]);

  useEffect(() => {
    try {
      const r = localStorage.getItem('userRole');
      if (r !== 'Super Admin') {
        window.location.href = '/admin_login';
        return;
      }
    } catch {}

    (async () => {
      setLoading(true);
      try {
        const ref = doc(db, 'users', uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setError('User document not found');
          setLoading(false);
          return;
        }
        const data: any = snap.data();
        const loadedDisplayName = data.displayName || '';
        setDisplayName(loadedDisplayName);
        setInitialDisplayName(loadedDisplayName);
        setEmail(data.email || '');
        const loadedRole = data.role || 'user';
        setRole(loadedRole);
        setInitialRole(loadedRole);
        setCreatedAt(data.createdAt || null);
        setLastLoginAt(data.lastLoginAt || null);
        setLastLoginAtText((data.lastLoginAtText || '').toString());
        setLastLoginUserAgent((data.lastLoginUserAgent || '').toString());
        setLoginCount(typeof data.loginCount === 'number' ? data.loginCount : null);
      } catch (e: any) {
        setError(e?.message || 'Failed to load user');
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  // Inline save/cancel for Display Name
  async function saveDisplayNameInline() {
    if (displayName === initialDisplayName) { setEditName(false); return; }
    setSaving(true);
    setError(null);
    try {
      const ref = doc(db, 'users', uid);
      await setDoc(ref, { displayName: displayName || '' }, { merge: true });
      setInitialDisplayName(displayName || '');
      setSaved(true);
      setEditName(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to save name');
    } finally {
      setSaving(false);
    }
  }
  function cancelDisplayNameInline() {
    setDisplayName(initialDisplayName);
    setEditName(false);
  }

  // Inline save/cancel for Role
  async function saveRoleInline() {
    if (initialRole === 'Super Admin') { setEditRole(false); return; }
    if (role === initialRole) { setEditRole(false); return; }
    setSaving(true);
    setError(null);
    try {
      if (role === 'Super Admin' && initialRole !== 'Super Admin') {
        throw new Error('Changing role to "Super Admin" is not permitted from this page.');
      }
      const ref = doc(db, 'users', uid);
      await setDoc(ref, { role }, { merge: true });
      setInitialRole(role);
      setSaved(true);
      setEditRole(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to save role');
    } finally {
      setSaving(false);
    }
  }
  function cancelRoleInline() {
    setRole(initialRole);
    setEditRole(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Guard: prevent creating/promoting Super Admin via this page
      if (role === 'Super Admin' && initialRole !== 'Super Admin') {
        throw new Error('Changing role to "Super Admin" is not permitted from this page.');
      }
      if (!isDirty) {
        setSaving(false);
        return;
      }
      // Update Firestore user document directly (no Auth updates)
      const ref = doc(db, 'users', uid);
      await setDoc(
        ref,
        {
          // Only allow editing of display name and role
          displayName: displayName || '',
          role,
        },
        { merge: true }
      );
      setSaved(true);
      // Update baselines so form becomes pristine after save
      setInitialDisplayName(displayName || '');
      setInitialRole(role);
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // When user edits fields, clear saved/back states
  useEffect(() => {
    setSaved(false);
    setShowBack(false);
  }, [displayName, role]);

  return (
    <div className="space-y-6">
      {/* Breadcrumb header */}
      <div className="flex items-center gap-2 text-sm py-2 md:py-3">
        <Link to={`${SUPER_ADMIN_BASE_PATH}/dashboard`} className="text-gray-600 hover:underline dark:text-gray-300">Dashboard</Link>
        <span className="text-gray-400">/</span>
        <Link to={listHref} className="text-gray-600 hover:underline dark:text-gray-300">{listLabel}</Link>
        <span className="text-gray-400">/</span>
        <span className="font-semibold text-gray-900 dark:text-white">{displayName || '—'}</span>
      </div>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 text-red-800 px-3 py-2 text-sm dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </div>
      )}

      {(!minDelayDone || loading) ? (
        /* Skeletons while loading or during min-delay */
        <div className="space-y-4">
          <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-3" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
          <div className="h-10 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
      ) : (
        <>
          {/* Details card with inline edit pens */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 md:p-8 shadow-sm transition-shadow">
            {/* Display Name row (title area) */}
            <div className="mb-4">
              <div className="group flex items-center justify-center gap-2">
                {editName ? (
                  <input
                    autoFocus
                    className="mt-0.5 w-auto rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-600 transition text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white"
                    style={{ width: namePxWidth ? `${namePxWidth}px` : undefined }}
                    value={displayName}
                    onChange={(e)=>setDisplayName(e.target.value)}
                    placeholder="Enter display name"
                  />
                ) : (
                  <>
                    <h2
                      className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white tracking-tight cursor-text"
                      onClick={() => setEditName(true)}
                      title="Click to edit name"
                    >
                      {displayName || '—'}
                    </h2>
                    <button
                      type="button"
                      onClick={async (e) => { e.stopPropagation(); try { await navigator.clipboard.writeText(displayName || ''); setCopiedName(true); setTimeout(()=>setCopiedName(false), 1200);} catch {} }}
                      className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:text-teal-700 hover:bg-teal-50 active:bg-teal-600 active:text-white transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 dark:text-gray-400 dark:hover:text-teal-300 dark:hover:bg-teal-900/20 dark:active:bg-teal-600/80 focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-opacity duration-150"
                      aria-label="Copy name"
                      title={copiedName ? 'Copied' : 'Copy name'}
                    >
                      {copiedName ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </>
                )}
                {editName ? (
                  (displayName !== initialDisplayName) ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={saveDisplayNameInline}
                        className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-teal-700 hover:text-white hover:bg-teal-600 dark:text-teal-300 dark:hover:bg-teal-600/80 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                        aria-label="Save name"
                        title="Save"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelDisplayNameInline}
                        className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-300 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                        aria-label="Cancel name edit"
                        title="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditName((v) => !v)}
                    className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:text-teal-700 hover:bg-teal-50 dark:text-gray-400 dark:hover:text-teal-300 dark:hover:bg-teal-900/20 focus:outline-none focus:ring-2 focus:ring-teal-500/30 opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 transition-opacity duration-150"
                    aria-label="Edit name"
                    title="Edit"
                  >
                    <PenLine className="h-4 w-4" />
                  </button>
                )}
                {/* hidden mirror to measure text width */}
                {editName && (
                  <span
                    ref={measureRef}
                    className="invisible absolute -z-10 text-2xl md:text-3xl font-semibold whitespace-pre"
                  >
                    {displayName || ''}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-gray-500">Created At :</div>
                <CopyableText text={createdAtText} className="font-medium text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <div className="text-gray-500">Last Login At :</div>
                <CopyableText text={lastLoginAtPretty} className="font-medium text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <div className="text-gray-500">Last Login (ISO Text) :</div>
                <CopyableText text={(lastLoginAtText || '—').toString()} className="font-medium break-all text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <div className="text-gray-500">Last Login User Agent :</div>
                <CopyableText text={(lastLoginUserAgent || '—').toString()} className="font-medium break-all text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <div className="text-gray-500">Login Count :</div>
                <CopyableText text={String(loginCount ?? '—')} className="font-medium text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <div className="text-gray-500">Email ID :</div>
                <CopyableText text={email || '—'} className="font-medium break-all text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <div className="text-gray-500">Role :</div>
                <div className="mt-1 group flex items-center gap-2">
                  {editRole && initialRole !== 'Super Admin' ? (
                    <select
                      autoFocus
                      className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-600 transition"
                      value={role}
                      onChange={(e)=>setRole(e.target.value)}
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  ) : (
                    <>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-900/20 dark:text-teal-200 dark:border-teal-800 capitalize">{role}</span>
                      <button
                        type="button"
                        onClick={async (e) => { e.stopPropagation(); try { await navigator.clipboard.writeText(role || ''); setCopiedRole(true); setTimeout(()=>setCopiedRole(false), 1200);} catch {} }}
                        className="opacity-0 group-hover:opacity-100 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:text-teal-700 hover:bg-teal-50 active:bg-teal-600 active:text-white transition-colors dark:text-gray-400 dark:hover:text-teal-300 dark:hover:bg-teal-900/20 dark:active:bg-teal-600/80 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                        aria-label="Copy role"
                        title={copiedRole ? 'Copied' : 'Copy role'}
                      >
                        {copiedRole ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </>
                  )}
                  {editRole ? (
                    (initialRole !== 'Super Admin' && role !== initialRole) ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={saveRoleInline}
                          disabled={initialRole === 'Super Admin'}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-teal-700 hover:text-white hover:bg-teal-600 disabled:opacity-40 dark:text-teal-300 dark:hover:bg-teal-600/80 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                          aria-label="Save role"
                          title={initialRole === 'Super Admin' ? 'Cannot edit Super Admin' : 'Save'}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelRoleInline}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-300 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                          aria-label="Cancel role edit"
                          title="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null
                  ) : (
                    <button
                      type="button"
                      onClick={() => initialRole !== 'Super Admin' && setEditRole((v) => !v)}
                      disabled={initialRole === 'Super Admin'}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:text-teal-700 hover:bg-teal-50 disabled:opacity-40 dark:text-gray-400 dark:hover:text-teal-300 dark:hover:bg-teal-900/20 focus:outline-none focus:ring-2 focus:ring-teal-500/30 opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 transition-opacity duration-150"
                      aria-label="Edit role"
                      title={initialRole === 'Super Admin' ? 'Cannot edit Super Admin' : 'Edit'}
                    >
                      <PenLine className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {initialRole === 'Super Admin' && (
                  <p className="mt-1 text-xs text-gray-500">Super Admin role cannot be changed here.</p>
                )}
              </div>
              <div>
                <div className="text-gray-500">UID :</div>
                <div className="mt-1 group inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowUid(v => !v)}
                    className="font-mono font-medium break-all text-gray-900 dark:text-gray-100 hover:text-teal-700 dark:hover:text-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-500/30 rounded"
                    title={showUid ? 'Hide UID' : 'Click to show UID'}
                    aria-label={showUid ? 'Hide UID' : 'Show UID'}
                  >
                    {showUid ? uid : '•'.repeat(12)}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(uid);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      } catch {}
                    }}
                    className="opacity-0 group-hover:opacity-100 inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:text-teal-700 hover:bg-teal-50 active:bg-teal-600 active:text-white transition-colors dark:text-gray-400 dark:hover:text-teal-300 dark:hover:bg-teal-900/20 dark:active:bg-teal-600/80 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                    aria-label="Copy UID"
                    title={copied ? 'Copied' : 'Copy UID'}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {(saving || saved) && (
        <div className="fixed top-4 right-4 z-50">
          <div
            role="status"
            aria-live="polite"
            className="rounded-md bg-teal-50 border border-teal-200 text-teal-800 dark:bg-teal-900/30 dark:border-teal-800 dark:text-teal-200 px-4 py-2 text-sm shadow-lg"
          >
            {saving ? 'Saving…' : 'Changes saved'}
          </div>
        </div>
      )}
    </div>
  );
}
