import React from 'react';

const AboutDevice: React.FC = () => {
  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold text-white mb-3">About Device</h1>
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-gray-300">
        Details and metadata about a device.
      </div>
    </section>
  );
};

export default AboutDevice;
