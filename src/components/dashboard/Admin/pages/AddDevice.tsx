import React from 'react';
import DeviceForm from '../DeviceForm';
import { Cpu } from 'lucide-react';

const AddDevice: React.FC = () => {
  return (
    <section className="p-6">
      <DeviceForm />
    </section>
  );
};

export default AddDevice;
