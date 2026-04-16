import React, { createContext, useContext, useState } from 'react';

// Auth Mode Context for managing signin/signup toggle
export type AuthMode = 'signin' | 'signup';

export interface AuthModeContextType {
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  toggleAuthMode: () => void;
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
  
  const toggleAuthMode = () => {
    setAuthMode(prev => prev === 'signin' ? 'signup' : 'signin');
  };

  return (
    <AuthModeContext.Provider value={{ authMode, setAuthMode, toggleAuthMode }}>
      {children}
    </AuthModeContext.Provider>
  );
};
