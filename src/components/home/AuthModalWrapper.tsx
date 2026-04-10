import React from 'react';
import { DevicesProvider } from '../../contexts/DevicesContext';
import AuthModal from './AuthModal';
import AuthNavClient from '../common/AuthNavClient';

/**
 * Wrapper component that bundles DevicesProvider with AuthModal and AuthNavClient
 * This ensures they hydrate as a single React unit in Astro.
 */
export default function AuthModalWrapper() {
  return (
    <DevicesProvider>
      <AuthModal />
      <AuthNavClient />
    </DevicesProvider>
  );
}
