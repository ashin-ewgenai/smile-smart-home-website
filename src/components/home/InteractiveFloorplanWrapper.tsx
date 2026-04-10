import React from 'react';
import { DevicesProvider } from '../../contexts/DevicesContext';
import InteractiveFloorplan from './InteractiveFloorplan';

/**
 * Wrapper component that bundles DevicesProvider with InteractiveFloorplan
 * This ensures they hydrate as a single React unit in Astro.
 */
export default function InteractiveFloorplanWrapper() {
  return (
    <DevicesProvider>
      <InteractiveFloorplan />
    </DevicesProvider>
  );
}
