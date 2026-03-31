import React from 'react';
import { DevicesProvider } from '../contexts/DevicesContext';
import { DeviceRecommendationsForm } from './DeviceRecommendationsForm';

export const RecommendationsWrapper: React.FC = () => {
  return (
    <DevicesProvider>
      <DeviceRecommendationsForm />
    </DevicesProvider>
  );
};
