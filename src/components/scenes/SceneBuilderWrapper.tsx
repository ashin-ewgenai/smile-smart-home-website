import React from 'react';
import { DevicesProvider } from '../../contexts/DevicesContext';
import { SceneBuilder } from '../SceneBuilder';

export const SceneBuilderWrapper: React.FC = () => {
  return (
    <DevicesProvider>
      <SceneBuilder />
    </DevicesProvider>
  );
};
