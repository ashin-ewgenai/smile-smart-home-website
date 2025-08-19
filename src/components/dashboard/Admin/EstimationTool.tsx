import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, FileText, Send } from 'lucide-react';

interface LineItem {
  id: string;
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  category: 'equipment' | 'service' | 'other';
}

interface EstimateData {
  customerName: string;
  customerEmail: string;
  projectType: 'home' | 'office' | 'hall' | 'room' | 'other';
  projectLocation: string;
  notes?: string;
  items: LineItem[];
  discountPercent: number; // 0-100
  taxPercent: number; // 0-100
}

const currency = (v: number) => v.toLocaleString(undefined, { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

const EstimationTool: React.FC = () => {
  const [data, setData] = useState<EstimateData>({
    customerName: '',
    customerEmail: '',
    projectType: 'home',
    projectLocation: '',
    notes: '',
    items: [
      { id: crypto.randomUUID(), name: 'Smart Switch', description: '4-Gang WiFi Switch', quantity: 1, unitPrice: 2500, category: 'equipment' },
    ],
    discountPercent: 0,
    taxPercent: 18,
  });
  const [status, setStatus] = useState<string>('');

  // Prefill from URL query
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const userName = params.get('userName') || '';
    const userEmail = params.get('userEmail') || '';
    setData((prev) => ({ ...prev, customerName: userName, customerEmail: userEmail }));
  }, []);

  const totals = useMemo(() => {
    const subTotal = data.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
    const discount = Math.min(Math.max(data.discountPercent, 0), 100) / 100 * subTotal;
    const taxable = Math.max(subTotal - discount, 0);
    const tax = Math.min(Math.max(data.taxPercent, 0), 100) / 100 * taxable;
    const grandTotal = taxable + tax;
    return { subTotal, discount, taxable, tax, grandTotal };
  }, [data]);

  const addItem = (category: LineItem['category']) => {
    setData((prev) => ({
      ...prev,
      items: [...prev.items, { id: crypto.randomUUID(), name: '', quantity: 1, unitPrice: 0, description: '', category }],
    }));
  };

  const updateItem = (id: string, patch: Partial<LineItem>) => {
    setData((prev) => ({ ...prev, items: prev.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));
  };

  const removeItem = (id: string) => setData((prev) => ({ ...prev, items: prev.items.filter((it) => it.id !== id) }));

  const saveToLocal = () => {
    if (!data.customerEmail) {
      setStatus('Please select a customer (email required)');
      return;
    }
    const key = `quote:${data.customerEmail}:${Date.now()}`;
    localStorage.setItem(key, JSON.stringify({ ...data, createdAt: new Date().toISOString(), totals }));
    setStatus('Quote saved locally');
    setTimeout(() => setStatus(''), 2500);
  };

  const sendEstimate = () => {
    // In real app, send via API/email. Here, store and show success.
    saveToLocal();
    setStatus('Quote submitted to customer (simulated)');
    setTimeout(() => setStatus(''), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create Quote</h1>
        <p className="text-gray-600 dark:text-gray-400">Prepare equipment and service quote for a customer</p>
      </div>

      {/* Customer & Project Details */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Customer & Project</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Customer Name</label>
            <input value={data.customerName} onChange={(e) => setData({ ...data, customerName: e.target.value })} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Customer Email</label>
            <input type="email" value={data.customerEmail} onChange={(e) => setData({ ...data, customerEmail: e.target.value })} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Type</label>
            <select value={data.projectType} onChange={(e) => setData({ ...data, projectType: e.target.value as any })} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="home">Home</option>
              <option value="office">Office</option>
              <option value="hall">Hall</option>
              <option value="room">Room</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Location</label>
            <input value={data.projectLocation} onChange={(e) => setData({ ...data, projectLocation: e.target.value })} placeholder="City / Address" className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <textarea value={data.notes} onChange={(e) => setData({ ...data, notes: e.target.value })} rows={3} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
      </div>

      {/* Items */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Quote Line Items</h2>
          <div className="flex gap-2">
            <button onClick={() => addItem('equipment')} className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg flex items-center"><Plus className="w-4 h-4 mr-1"/> Add Equipment</button>
            <button onClick={() => addItem('service')} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg flex items-center"><Plus className="w-4 h-4 mr-1"/> Add Service</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Item</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Description</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Qty</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Unit Price</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Total</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {data.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-4 py-2">
                    <input value={it.name} onChange={(e) => updateItem(it.id, { name: e.target.value })} className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                    <span className="mt-1 inline-block text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{it.category}</span>
                  </td>
                  <td className="px-4 py-2">
                    <input value={it.description || ''} onChange={(e) => updateItem(it.id, { description: e.target.value })} className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                  </td>
                  <td className="px-4 py-2 w-28">
                    <input type="number" min={1} value={it.quantity} onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value) })} className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                  </td>
                  <td className="px-4 py-2 w-40">
                    <input type="number" min={0} value={it.unitPrice} onChange={(e) => updateItem(it.id, { unitPrice: Number(e.target.value) })} className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                  </td>
                  <td className="px-4 py-2 text-right font-medium">{currency(it.quantity * it.unitPrice)}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => removeItem(it.id)} className="p-2 text-red-600 hover:text-red-700"><Trash2 className="w-5 h-5"/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Discounts & Taxes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Discount (%)</label>
            <input type="number" min={0} max={100} value={data.discountPercent} onChange={(e) => setData({ ...data, discountPercent: Number(e.target.value) })} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tax (GST %)</label>
            <input type="number" min={0} max={100} value={data.taxPercent} onChange={(e) => setData({ ...data, taxPercent: Number(e.target.value) })} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
        </div>
      </div>

      {/* Summary & Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Subtotal</span><span className="font-medium">{currency(totals.subTotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Discount</span><span className="font-medium">-{currency(totals.discount)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Taxable Amount</span><span className="font-medium">{currency(totals.taxable)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">GST</span><span className="font-medium">{currency(totals.tax)}</span></div>
              <div className="flex justify-between text-base mt-2 border-t border-gray-200 dark:border-gray-700 pt-2"><span className="font-semibold">Grand Total</span><span className="font-semibold">{currency(totals.grandTotal)}</span></div>
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Actions</h3>
            {status && <div className="mb-3 p-3 rounded bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-sm">{status}</div>}
            <div className="flex flex-wrap gap-3">
              <button onClick={saveToLocal} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg border border-gray-300 dark:border-gray-600 flex items-center"><FileText className="w-4 h-4 mr-2"/>Save Quote Draft</button>
              <button onClick={sendEstimate} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg flex items-center"><Send className="w-4 h-4 mr-2"/>Submit Quote</button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Sending is simulated. Integrate email or backend API later.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EstimationTool;
