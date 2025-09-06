import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import EstimationTool from '../EstimationTool';

const Estimates: React.FC = () => {
  const [searchParams] = useSearchParams();
  const quoteId = searchParams.get('quoteId');
  
  // If you need to pass the quoteId to EstimationTool, uncomment the following:
  // useEffect(() => {
  //   if (quoteId) {
  //     // You can pass the quoteId to EstimationTool or handle it as needed
  //     console.log('Loading quote with ID:', quoteId);
  //   }
  // }, [quoteId]);
  
  return (
    <section className="p-6 min-h-full bg-gray-50 dark:bg-gray-900">
      <EstimationTool />
    </section>
  );
};

export default Estimates;
