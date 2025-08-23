import React from 'react';
import EstimationTool from '../EstimationTool';

const Estimates: React.FC = () => {
  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold text-white mb-4">Create Quote</h1>
      <EstimationTool />
    </section>
  );
};

export default Estimates;
