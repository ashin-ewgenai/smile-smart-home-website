import React from 'react';
import { Link } from 'react-router-dom';

const Devices: React.FC = () => {
  return (
    <section className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-white">Devices</h1>
        <Link to="/devices/add" className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded">Add Device</Link>
      </div>
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-gray-300">
        Manage and view devices. This can be extended to load from API or storage.
      </div>
    </section>
  );
};

export default Devices;
