import React from 'react';

const UserBill: React.FC = () => {
  // Static demo data; later this can be replaced with real API/Firebase data
  const current = {
    name: 'Smart Home Plus',
    start: '2025-01-01',
    cycle: 'Monthly',
    price: '$29.99',
    next: '2025-09-05',
  };

  const due = {
    for: 'Smart Home Plus (Monthly)',
    total: '$19.99',
    date: '2025-09-05',
    fee: '$0.00',
  };

  const other = [
    { label: 'Warranty Plan', price: '$79.00/yr', status: 'Active' as const, sub: 'Charged on 2025-06-01 • Ends 2026-05-31' },
    { label: 'TV Add-on', price: '$9.99/mo', status: 'Paused' as const, sub: 'Charged on 2025-08-05 • Ends 2025-09-04' },
  ];

  const installment = {
    item: 'Warranty Plan',
    total: 6,
    amount: '$49.00',
    paidCount: 2,
    next: '$49.00 on 2025-09-20',
  };

  const pct = Math.min(100, Math.round((installment.paidCount / installment.total) * 100));

  return (
    <section className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Billing Details</h1>
      </div>

      {/* Current Package / Service */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl shadow-lg p-5">
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-sky-400">▣</span>
          Current Package / Service
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <div><div className="text-gray-400">Name</div><div className="text-gray-100">{current.name}</div></div>
          <div><div className="text-gray-400">Start Date</div><div className="text-gray-100">{current.start}</div></div>
          <div><div className="text-gray-400">Billing Cycle</div><div className="text-gray-100">{current.cycle}</div></div>
          <div><div className="text-gray-400">Price</div><div className="text-gray-100">{current.price}</div></div>
          <div><div className="text-gray-400">Next Billing Date</div><div className="text-gray-100">{current.next}</div></div>
        </div>
      </div>

      {/* Due Bill Summary */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl shadow-lg p-5">
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-teal-400">◴</span>
          Due Bill Summary
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div><div className="text-gray-400">For</div><div className="text-gray-100">{due.for}</div></div>
          <div><div className="text-gray-400">Total Amount Due</div><div className="text-emerald-300 font-semibold">{due.total}</div></div>
          <div><div className="text-gray-400">Due Date</div><div className="text-gray-100">{due.date}</div></div>
          <div><div className="text-gray-400">Late Fees</div><div className="text-gray-100">{due.fee}</div></div>
        </div>
      </div>

      {/* Other Packages / Services */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl shadow-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="text-indigo-400">▦</span>
            Other Packages / Services Subscribed
          </h2>
        </div>
        <ul className="divide-y divide-gray-800 text-sm">
          {other.map((o) => (
            <li key={o.label} className="py-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span>{o.label}</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${
                  o.status === 'Active'
                    ? 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50'
                    : 'bg-amber-900/30 text-amber-300 border-amber-700/50'
                }`}>{o.status}</span>
              </span>
              <span className="text-right">
                <div className="text-gray-300">{o.price}</div>
                <div className="text-[11px] text-gray-500">{o.sub}</div>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Installment Breakdown */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl shadow-lg p-5">
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-emerald-400">◎</span>
          Installment Breakdown
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div><div className="text-gray-400">For</div><div className="text-gray-100">{installment.item}</div></div>
          <div><div className="text-gray-400">Total Installments</div><div className="text-gray-100">{installment.total}</div></div>
          <div><div className="text-gray-400">Installment Amount</div><div className="text-gray-100">{installment.amount}</div></div>
          <div><div className="text-gray-400">Paid</div><div className="text-gray-100">{installment.paidCount} of {installment.total} Installments Paid</div></div>
          <div><div className="text-gray-400">Next Installment Due</div><div className="text-gray-100">{installment.next}</div></div>
        </div>
        <div className="mt-4">
          <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 text-xs text-gray-400">{pct}% paid ({installment.paidCount} of {installment.total})</div>
        </div>
      </div>
    </section>
  );
};

export default UserBill;
