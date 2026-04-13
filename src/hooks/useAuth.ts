import { useEffect, useState, useCallback } from 'react';
import { auth } from '../lib/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, createUserWithEmailAndPassword, updateProfile, type User } from 'firebase/auth';

/**
 * useAuth
 * Custom hook to manage Firebase authentication state and actions.
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    // Optional: Add custom parameters if needed (e.g. prompt: 'select_account')
    // provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await signInWithPopup(auth, provider);
      return result.user;
    } catch (error) {
      console.error('Google Sign-In Error:', error);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout Error:', error);
      throw error;
    }
  }, []);

  const signupWithEmail = useCallback(async (email: string, password: string, fullName: string) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (fullName) {
        await updateProfile(cred.user, { displayName: fullName });
      }
      return cred.user;
    } catch (error) {
      console.error('Signup Error:', error);
      throw error;
    }
  }, []);

  return {
    user,
    loading,
    loginWithGoogle,
    logout,
    signupWithEmail
  };
}
