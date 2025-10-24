import React from 'react';
import DeviceForm from '../DeviceForm';
import { Cpu } from 'lucide-react';

const AddDevice: React.FC = () => {
  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold text-gray-800 dark:text-white mb-4 inline-flex items-center gap-2">Add Device
        <Cpu className="h-5 w-5" aria-hidden="true" />
      </h1>
      <DeviceForm />
    </section>
  );
};

export default AddDevice;
