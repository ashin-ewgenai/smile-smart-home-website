import React from 'react';

const Bill: React.FC = () => {
  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold text-white mb-3">Bill</h1>
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-gray-300">
        Billing overview and invoices.
      </div>
    </section>
  );
};

export default Bill;
