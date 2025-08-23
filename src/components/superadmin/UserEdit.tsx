import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface Props { uid: string; }

export default function UserEdit({ uid }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [initialRole, setInitialRole] = useState<string>('user');
  const [createdAt, setCreatedAt] = useState<any>(null);
  const [lastLoginAt, setLastLoginAt] = useState<any>(null);

  const createdAtText = useMemo(() => {
    try {
      if (createdAt?.toDate) return createdAt.toDate().toLocaleString();
    } catch {}
    return '—';
  }, [createdAt]);
  const lastLoginAtText = useMemo(() => {
    try {
      if (lastLoginAt?.toDate) return lastLoginAt.toDate().toLocaleString();
    } catch {}
    return '—';
  }, [lastLoginAt]);

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
        setDisplayName(data.displayName || '');
        setEmail(data.email || '');
        const loadedRole = data.role || 'user';
        setRole(loadedRole);
        setInitialRole(loadedRole);
        setCreatedAt(data.createdAt || null);
        setLastLoginAt(data.lastLoginAt || null);
      } catch (e: any) {
        setError(e?.message || 'Failed to load user');
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Guard: prevent creating/promoting Super Admin via this page
      if (role === 'Super Admin' && initialRole !== 'Super Admin') {
        throw new Error('Changing role to "Super Admin" is not permitted from this page.');
      }
      // Update Firestore user document directly (no Auth updates)
      const ref = doc(db, 'users', uid);
      await setDoc(
        ref,
        {
          displayName: displayName || '',
          email: email || '',
          role,
        },
        { merge: true }
      );
      alert('Saved');
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div>Loading…</div>;
  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Edit User</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">UID: {uid}</p>
      </div>

      {/* Details card showing fields as stored in Firestore */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <h2 className="text-lg font-semibold mb-3">User Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-gray-500">createdAt (timestamp)</div>
            <div className="font-medium">{createdAtText}</div>
          </div>
          <div>
            <div className="text-gray-500">lastLoginAt (timestamp)</div>
            <div className="font-medium">{lastLoginAtText}</div>
          </div>
          <div>
            <div className="text-gray-500">displayName (string)</div>
            <div className="font-medium break-all">{displayName || '—'}</div>
          </div>
          <div>
            <div className="text-gray-500">email (string)</div>
            <div className="font-medium break-all">{email || '—'}</div>
          </div>
          <div>
            <div className="text-gray-500">role (string)</div>
            <div className="font-medium">{role}</div>
          </div>
          <div>
            <div className="text-gray-500">uid (string)</div>
            <div className="font-medium break-all">{uid}</div>
          </div>
        </div>
      </div>

      {/* Editable form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Display Name</label>
          <input className="mt-1 w-full rounded-md border px-3 py-2 dark:bg-gray-900 dark:border-gray-700" value={displayName} onChange={(e)=>setDisplayName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input className="mt-1 w-full rounded-md border px-3 py-2 dark:bg-gray-900 dark:border-gray-700" value={email} onChange={(e)=>setEmail(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Role</label>
          {initialRole === 'Super Admin' ? (
            <input
              className="mt-1 w-full rounded-md border px-3 py-2 dark:bg-gray-900 dark:border-gray-700 bg-gray-100 dark:bg-gray-800"
              value={role}
              disabled
              readOnly
            />
          ) : (
            <select
              className="mt-1 w-full rounded-md border px-3 py-2 dark:bg-gray-900 dark:border-gray-700"
              value={role}
              onChange={(e)=>setRole(e.target.value)}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          )}
          {initialRole === 'Super Admin' && (
            <p className="mt-1 text-xs text-gray-500">Super Admin role cannot be changed here.</p>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}
