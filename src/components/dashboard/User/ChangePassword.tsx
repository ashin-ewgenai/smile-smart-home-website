import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth } from '../../../lib/firebase';

interface ChangePasswordProps {}

interface ChangePasswordHandle {
  submit: () => Promise<boolean>;
}

const ChangePassword = forwardRef<ChangePasswordHandle, ChangePasswordProps>((props, ref) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    setError(null);
    setSuccess(null);

    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all fields.');
      return false;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match.');
      return false;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return false;
    }

    const user = auth.currentUser;
    if (!user || !user.email) {
      setError('You are not signed in.');
      return false;
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
      return true;
    } catch (err: any) {
      // Friendly error messages
      const code = err?.code || '';
      if (code === 'auth/wrong-password') setError('Old password is incorrect.');
      else if (code === 'auth/weak-password') setError('New password is too weak.');
      else if (code === 'auth/too-many-requests') setError('Too many attempts. Please try again later.');
      else setError(err?.message || 'Failed to change password.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Expose the submit handler for the parent form
  useImperativeHandle(ref, () => ({
    submit: handleSubmit
  }));

  return (
    <div className="max-w-md w-full mx-auto p-0 space-y-4">
      <h2 className="text-xl font-semibold mb-2 text-white">Change Password</h2>

      {error && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm dark:border-red-800 dark:bg-red-900/40 dark:text-red-200">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-3 rounded border border-green-200 bg-green-50 text-green-700 px-3 py-2 text-sm dark:border-green-800 dark:bg-green-900/40 dark:text-green-200">
          {success}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" htmlFor="oldPassword">
          Old password
        </label>
        <input
          id="oldPassword"
          type="password"
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" htmlFor="newPassword">
          New password
        </label>
        <input
          id="newPassword"
          type="password"
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300" htmlFor="confirmPassword">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          type="password"
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="w-full inline-flex items-center justify-center px-5 py-2 rounded bg-teal-600 hover:bg-teal-700 text-white font-medium border-2 border-teal-700 hover:border-teal-800 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-teal-500"
      >
        {loading ? 'Changing…' : 'Change Password'}
      </button>

      <p className="text-xs mt-3 text-gray-600 dark:text-gray-400">
        You may be asked to log in again if required for security.
      </p>
    </div>
  );
});

ChangePassword.displayName = 'ChangePassword';

export default ChangePassword;
