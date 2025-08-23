import React from 'react';
import DeviceForm from '../DeviceForm';

const AddDevice: React.FC = () => {
  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold text-white mb-4">Add Device</h1>
      <DeviceForm />
    </section>
  );
};

export default AddDevice;
