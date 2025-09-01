import React, { useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth } from '../../../lib/firebase';

function ChangePassword() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) {
      setError('You are not signed in.');
      return;
    }

    try {
      setLoading(true);

      // Step 1: Re-authenticate with old password
      const credential = EmailAuthProvider.credential(user.email, oldPassword);
      await reauthenticateWithCredential(user, credential);

      // Step 2: Update to the new password
      await updatePassword(user, newPassword);

      setSuccess('Password changed successfully.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      // Friendly error messages
      const code = err?.code || '';
      if (code === 'auth/wrong-password') setError('Old password is incorrect.');
      else if (code === 'auth/weak-password') setError('New password is too weak.');
      else if (code === 'auth/too-many-requests') setError('Too many attempts. Please try again later.');
      else setError(err?.message || 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md w-full mx-auto p-4 sm:p-6 bg-white rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4 text-black">Change Password</h2>

      {error && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-3 rounded border border-green-200 bg-green-50 text-green-700 px-3 py-2 text-sm">{success}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 text-black">
        <div>
          <label className="block text-sm font-medium mb-1 text-black" htmlFor="oldPassword">Old password</label>
          <input
            id="oldPassword"
            type="password"
            className="w-full rounded border px-3 py-2 focus:outline-none focus:ring text-black"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-black" htmlFor="newPassword">New password</label>
          <input
            id="newPassword"
            type="password"
            className="w-full rounded border px-3 py-2 focus:outline-none focus:ring text-black"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-black" htmlFor="confirmPassword">Confirm new password</label>
          <input
            id="confirmPassword"
            type="password"
            className="w-full rounded border px-3 py-2 focus:outline-none focus:ring text-black"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center rounded bg-blue-600 text-white py-2 font-medium hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? 'Changing…' : 'Change Password'}
        </button>
      </form>

      <p className="text-xs mt-3 text-black">You may be asked to log in again if required for security.</p>
    </div>
  );
}

export default ChangePassword;
