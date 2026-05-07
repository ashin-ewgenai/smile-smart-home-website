import React from 'react';
import { AuthModeProvider } from '../contexts/AuthModeContext';
import { DevicesProvider } from '../contexts/DevicesContext';
import { EnergySavingsCalculator } from './EnergySavingsCalculator';

export const SavingsTabWrapper: React.FC = () => {
  return (
    <AuthModeProvider>
      <DevicesProvider>
        <EnergySavingsCalculator />
      </DevicesProvider>
    </AuthModeProvider>
  );
};
