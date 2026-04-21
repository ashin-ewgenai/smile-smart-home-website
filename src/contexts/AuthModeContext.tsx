import React, { createContext, useContext, useState, useEffect } from 'react';

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
  const [isMuted, setIsMutedState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('smh_voice_muted');
      return saved === 'true';
    }
    return true; // Default to muted
  });

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

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
      localStorage.setItem('smh_voice_muted', String(muted));
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
      setVoiceSupported
    }}>
      {children}
    </AuthModeContext.Provider>
  );
};

