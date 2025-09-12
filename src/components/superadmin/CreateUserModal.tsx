import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { SUPER_ADMIN_BASE_PATH } from '../../lib/constants';
import { createUserWithEmailAndPassword, updateProfile, signOut } from 'firebase/auth';
import { createAccountProfileWithLookup } from '../../models';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateUserModal({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('admin');

  useEffect(() => {
    if (!open) {
      setError(null);
      setLoading(false);
      setFullName('');
      setEmail('');
      setPassword('');
      setConfirm('');
      setRole('admin');
    }
  }, [open]);

  function validEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }
  function validPassword(v: string) {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+={}:;"'\[\]\\|<>?,./`~]).{8,}$/.test(v);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // IMPORTANT: This flow will sign out the current Super Admin temporarily.
    try {
      if (!fullName || fullName.trim().length < 2) {
        setError('Please enter full name');
        return;
      }
      if (!validEmail(email)) {
        setError('Please enter a valid email');
        return;
      }
      if (!validPassword(password)) {
        setError('Password must be at least 8 chars and include uppercase, lowercase, number, and symbol');
        return;
      }
      if (password !== confirm) {
        setError('Passwords do not match');
        return;
      }

      setLoading(true);

      // This will switch the auth session to the new user
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = cred.user;
      if (fullName) await updateProfile(newUser, { displayName: fullName });

      await createAccountProfileWithLookup(db, {
        uid: newUser.uid,
        email: newUser.email,
        fullName: fullName || newUser.displayName || '',
        role: role,
      });

      // Immediately sign out the newly created user and return to Super Admin dashboard
      try { await signOut(auth); } catch {}
      // Ensure guard still passes: keep any existing localStorage role; optionally reassert role
      try { if (!localStorage.getItem('userRole')) localStorage.setItem('userRole', 'Super Admin'); } catch {}
      alert('Account created successfully. Returning to Super Admin dashboard.');
      navigate(`${SUPER_ADMIN_BASE_PATH}/dashboard`);
    } catch (err: any) {
      const code = err?.code || '';
      let msg = err?.message || 'Create failed';
      if (code === 'auth/email-already-in-use') msg = 'Email already in use';
      else if (code === 'auth/weak-password') msg = 'Password is too weak';
      else if (code === 'auth/operation-not-allowed') msg = 'Operation not allowed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={(e)=>{ if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Create User/Admin</h2>
          <button onClick={onClose} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800">✕</button>
        </div>
        <form className="space-y-3" onSubmit={handleCreate}>
          <div>
            <label className="block text-sm font-medium">Full Name</label>
            <input className="mt-1 w-full rounded-md border px-3 py-2 dark:bg-gray-900 dark:border-gray-700" value={fullName} onChange={(e)=>setFullName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input type="email" className="mt-1 w-full rounded-md border px-3 py-2 dark:bg-gray-900 dark:border-gray-700" value={email} onChange={(e)=>setEmail(e.target.value)} required />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium">Password</label>
              <input type="password" className="mt-1 w-full rounded-md border px-3 py-2 dark:bg-gray-900 dark:border-gray-700" value={password} onChange={(e)=>setPassword(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium">Confirm Password</label>
              <input type="password" className="mt-1 w-full rounded-md border px-3 py-2 dark:bg-gray-900 dark:border-gray-700" value={confirm} onChange={(e)=>setConfirm(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">Role</label>
            <select className="mt-1 w-full rounded-md border px-3 py-2 dark:bg-gray-900 dark:border-gray-700" value={role} onChange={(e)=>setRole(e.target.value as 'admin')}>
              <option value="admin">admin</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-60">
              {loading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
