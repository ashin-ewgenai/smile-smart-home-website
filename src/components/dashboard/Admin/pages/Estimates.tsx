import React from 'react';
import EstimationTool from '../EstimationTool';

const Estimates: React.FC = () => {
  console.log('Estimates component rendering...');
  
  return (
    <section className="p-6 min-h-full bg-gray-50 dark:bg-gray-900">
      <EstimationTool />
    </section>
  );
};

export default Estimates;
