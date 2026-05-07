import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, type User, GoogleAuthProvider, signInWithPopup, signOut, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useCallback } from 'react';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

// Auth Mode Context for managing signin/signup toggle
export type AuthMode = 'signin' | 'signup';

export interface AuthModeContextType {
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  toggleAuthMode: () => void;
  // Voice assistant state
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  isListening: boolean;
  setIsListening: (listening: boolean) => void;
  isSpeaking: boolean;
  setIsSpeaking: (speaking: boolean) => void;
  voiceSupported: boolean;
  setVoiceSupported: (supported: boolean) => void;
  // Auth state
  user: User | null;
  loading: boolean;
  loginWithGoogle: () => Promise<User>;
  logout: () => Promise<void>;
  signupWithEmail: (email: string, password: string, fullName: string) => Promise<User>;
}

export const AuthModeContext = createContext<AuthModeContextType | undefined>(undefined);

export function useAuthMode(): AuthModeContextType {
  const context = useContext(AuthModeContext);
  if (!context) {
    throw new Error('useAuthMode must be used within an AuthModeProvider');
  }
  return context;
}

export const AuthModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [isMuted, setIsMutedState] = useState<boolean>(true);

  useEffect(() => {
    const loadMutedState = async () => {
      if (typeof window !== 'undefined') {
        try {
          const { value } = await Preferences.get({ key: 'smh_voice_muted' });
          if (value !== null) {
            setIsMutedState(value === 'true');
          }
        } catch (e) {
          console.warn('Failed to load muted state', e);
        }
      }
    };
    loadMutedState();
  }, []);

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(true);

  // Auth state observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      // Robust client-side state synchronization
      if (typeof window !== 'undefined') {
        if (firebaseUser) {
          Preferences.set({ key: 'userId', value: firebaseUser.uid });
          Preferences.set({ key: 'userEmail', value: firebaseUser.email || '' });
          
          // Update online status in Firestore ONLY if document exists
          try {
            const userRef = doc(db, 'Accounts', firebaseUser.uid);
            await updateDoc(userRef, { 
              Status: 'online', 
              LastLoginAt: serverTimestamp(),
              StatusUpdatedAt: serverTimestamp()
            });
          } catch (err) {
            // Ignore if document doesn't exist yet (handled by signup/login logic)
            console.warn('Silent status update skipped (doc might not exist):', firebaseUser.uid);
          }
        } else {
          // If we had a previous user, we might want to mark them offline
          const { value: prevUid } = await Preferences.get({ key: 'userId' });
          if (prevUid) {
            try {
              const userRef = doc(db, 'Accounts', prevUid);
              await updateDoc(userRef, { 
                Status: 'offline',
                StatusUpdatedAt: serverTimestamp()
              });
            } catch (err) {
              // Ignore
            }
          }
          // Note: We don't remove userEmail/userId here to allow them to act as hints 
          // during the next page load/initialization. They are cleared in the logout() function.
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
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
      const { value: storedUid } = await Preferences.get({ key: 'userId' });
      const uid = auth.currentUser?.uid || storedUid;
      if (uid) {
        try {
          const userRef = doc(db, 'Accounts', uid);
          await updateDoc(userRef, { 
            Status: 'offline', 
            StatusUpdatedAt: serverTimestamp() 
          });
        } catch (err) {
          // Ignore
        }
      }

      await signOut(auth);
      if (typeof window !== 'undefined') {
        // Clear ALL authentication data from Capacitor Preferences
        await Preferences.remove({ key: 'userId' });
        await Preferences.remove({ key: 'userEmail' });
        await Preferences.remove({ key: 'userPhone' });
        await Preferences.remove({ key: 'userAddress' });
        await Preferences.remove({ key: 'userName' });
        await Preferences.remove({ key: 'userRole' });
        
        // Clear ALL localStorage data for complete logout
        localStorage.removeItem('userId');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userPhone');
        localStorage.removeItem('userAddress');
        localStorage.removeItem('userName');
        
        // Redirect to public landing page
        window.location.href = '/';
      }
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

  // Capability detection
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (SpeechRecognition && 'speechSynthesis' in window) {
        setVoiceSupported(true);
      }
    }
  }, []);

  const toggleAuthMode = () => {
    setAuthMode(prev => prev === 'signin' ? 'signup' : 'signin');
  };

  const setIsMuted = (muted: boolean) => {
    setIsMutedState(muted);
    if (typeof window !== 'undefined') {
      Preferences.set({ key: 'smh_voice_muted', value: String(muted) });
    }
  };

  return (
    <AuthModeContext.Provider value={{ 
      authMode, 
      setAuthMode, 
      toggleAuthMode,
      isMuted,
      setIsMuted,
      isListening,
      setIsListening,
      isSpeaking,
      setIsSpeaking,
      voiceSupported,
      setVoiceSupported,
      user,
      loading,
      loginWithGoogle,
      logout,
      signupWithEmail
    }}>
      {children}
    </AuthModeContext.Provider>
  );
};

