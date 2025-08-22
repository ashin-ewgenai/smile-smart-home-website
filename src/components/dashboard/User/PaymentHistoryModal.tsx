import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const PaymentHistoryModal: React.FC<Props> = ({ open, onClose }) => {
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'monthly' | 'yearly' | 'instalment' | 'onetime'>('all');
  const [serviceFilter, setServiceFilter] = useState<'all' | 'tv' | 'internet' | 'warranty' | 'installation' | 'maintenance' | 'troubleshooting'>('all');
  const [deviceFilter, setDeviceFilter] = useState<'all' | string>('all');
  const [dateSort, setDateSort] = useState<'desc' | 'asc'>('desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const payments = [
    { id: 'INV-2025-0001', date: '2025-01-05', plan: 'monthly' as const, service: 'tv' as const, device: 'Living Room TV', paymentMethod: 'cash' as const, label: 'TV Monthly Pass', amount: 9.99, status: 'paid' as const },
    { id: 'INV-2025-0002', date: '2025-02-05', plan: 'monthly' as const, service: 'internet' as const, device: 'Home Router', paymentMethod: 'upi' as const, label: 'Internet Monthly Pass', amount: 19.99, status: 'paid' as const },
    { id: 'INV-2025-0003', date: '2025-03-05', plan: 'monthly' as const, service: 'internet' as const, device: 'Home Router', paymentMethod: 'card' as const, label: 'Internet Monthly Pass', amount: 19.99, status: 'paid' as const },
    { id: 'INV-2025-Y001', date: '2025-01-01', plan: 'yearly' as const, service: 'warranty' as const, device: 'Kitchen Thermostat', paymentMethod: 'bank' as const, label: 'Yearly Device Warranty', amount: 79.0, status: 'paid' as const },
    { id: 'INV-2025-I010', date: '2025-02-20', plan: 'instalment' as const, service: 'warranty' as const, device: 'Living Room Camera', paymentMethod: 'card' as const, label: 'Camera Warranty Installment 1/6', amount: 49.0, status: 'paid' as const },
    { id: 'INV-2025-I011', date: '2025-03-20', plan: 'instalment' as const, service: 'warranty' as const, device: 'Living Room Camera', paymentMethod: 'upi' as const, label: 'Camera Warranty Installment 2/6', amount: 49.0, status: 'paid' as const },
    { id: 'INV-2025-OT01', date: '2025-03-10', plan: 'onetime' as const, service: 'tv' as const, device: 'Living Room TV', paymentMethod: 'cash' as const, label: 'Movie Rental (One-time)', amount: 4.99, status: 'paid' as const },
    { id: 'INV-2025-OT02', date: '2025-04-02', plan: 'onetime' as const, service: 'warranty' as const, device: 'Front Door Lock', paymentMethod: 'bank' as const, label: 'One-time Service Visit', amount: 29.0, status: 'paid' as const },
    { id: 'INV-2025-IN01', date: '2025-04-10', plan: 'onetime' as const, service: 'installation' as const, device: 'Bedroom Light', paymentMethod: 'card' as const, label: 'Smart Light Installation', amount: 59.0, status: 'paid' as const },
    { id: 'INV-2025-MA01', date: '2025-04-15', plan: 'yearly' as const, service: 'maintenance' as const, device: 'Living Room Camera', paymentMethod: 'upi' as const, label: 'Annual Maintenance Plan', amount: 39.0, status: 'paid' as const },
    { id: 'INV-2025-TR01', date: '2025-04-18', plan: 'onetime' as const, service: 'troubleshooting' as const, device: 'Garage Door', paymentMethod: 'cash' as const, label: 'Troubleshooting Visit', amount: 25.0, status: 'paid' as const },
  ];

  const deviceOptions = useMemo(() => Array.from(new Set(payments.map(p => p.device))), []);

  if (!open) return null;

  const filtered = payments
    .filter(p => paymentFilter === 'all' ? true : p.plan === paymentFilter)
    .filter(p => serviceFilter === 'all' ? true : p.service === serviceFilter)
    .filter(p => deviceFilter === 'all' ? true : p.device === deviceFilter)
    .filter(p => {
      const d = new Date(p.date);
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23,59,59,999);
        if (d > to) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      return dateSort === 'asc' ? da - db : db - da;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Payment History">
      <div className="relative w-full max-w-5xl">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Payment History</h2>
            <button onClick={onClose} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800 transition" aria-label="Close">
              <X className="h-4 w-4" />
              <span className="text-sm font-medium">Close</span>
            </button>
          </div>
          <div className="px-6 pt-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Plan:</span>
              {(['all','monthly','yearly','instalment','onetime'] as const).map(f => (
                <button key={f} onClick={() => setPaymentFilter(f)} className={`px-3 py-1.5 rounded-md text-sm border ${paymentFilter===f ? 'bg-teal-600 text-white border-teal-600' : 'text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>{f[0].toUpperCase()+f.slice(1)}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-8 mb-4">
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 dark:text-gray-400" htmlFor="serviceFilter">Service:</label>
                <select id="serviceFilter" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value as any)} className="text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500">
                  <option value="all">All</option>
                  <option value="tv">TV</option>
                  <option value="internet">Internet</option>
                  <option value="warranty">Warranty</option>
                  <option value="installation">Installation</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="troubleshooting">Troubleshooting</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 dark:text-gray-400" htmlFor="deviceFilter">Device:</label>
                <select id="deviceFilter" value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)} className="text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500">
                  <option value="all">All</option>
                  {deviceOptions.map(d => (<option key={d} value={d}>{d}</option>))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <label className="text-sm text-gray-600 dark:text-gray-400" htmlFor="dateFrom">From:</label>
              <input id="dateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <label className="text-sm text-gray-600 dark:text-gray-400" htmlFor="dateTo">To:</label>
              <input id="dateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <label className="text-sm text-gray-600 dark:text-gray-400" htmlFor="dateSort">Sort:</label>
              <select id="dateSort" value={dateSort} onChange={(e) => setDateSort(e.target.value as any)} className="text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="desc">Newest first</option>
                <option value="asc">Oldest first</option>
              </select>
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">Clear Dates</button>
              )}
            </div>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Service</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Device</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Plan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Payment Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Receipts</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">{new Date(p.date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200 capitalize">{p.service}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">{p.device}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200 capitalize">{p.plan}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{p.label}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">${p.amount.toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200 capitalize">{p.paymentMethod}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button onClick={() => alert(`Opening receipt for ${p.id}`)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">View Receipt</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentHistoryModal;
