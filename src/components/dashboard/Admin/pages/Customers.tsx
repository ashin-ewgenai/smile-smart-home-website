import React, { useEffect, useMemo, useState } from 'react';
import { showToast } from '../../../../lib/toast';

const Customers: React.FC = () => {
  type CustomerDevice = { name: string; purchaseDate: string; warrantyMonths: number };
  type Customer = { name: string; email: string; devices: CustomerDevice[] };
  type Bill = { id: string; customer: string; device: string; amount: number; date: string; notes: string };

  const STORAGE_KEY = 'adminCustomers';
  const BILLS_KEY = 'adminBills' as const;

  const defaultCustomers: Customer[] = useMemo(() => ([
    { name: 'Acme Corp', email: 'ops@acme.com', devices: [
      { name: 'Smart Thermostat', purchaseDate: '2024-07-10', warrantyMonths: 24 },
      { name: 'Door Lock', purchaseDate: '2023-05-01', warrantyMonths: 12 },
    ]},
    { name: 'John Family', email: 'john@example.com', devices: [
      { name: 'Security Camera', purchaseDate: '2023-12-15', warrantyMonths: 18 },
    ]},
  ]), []);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Add/Edit modal state
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [devices, setDevices] = useState<CustomerDevice[]>([]);
  const [showForm, setShowForm] = useState(false);

  // Details modal state
  const [detailsIdx, setDetailsIdx] = useState<number | null>(null);

  // Bill view modal state
  const [billViewDevice, setBillViewDevice] = useState<string | null>(null);
  const [billViewImage, setBillViewImage] = useState<string | null>(null);
  const [showBillView, setShowBillView] = useState(false);

  // Bill create modal state
  const [showBillCreate, setShowBillCreate] = useState(false);
  const [billCustomer, setBillCustomer] = useState('');
  const [billDevice, setBillDevice] = useState('');
  const [billAmount, setBillAmount] = useState<number | ''>('');
  const [billDate, setBillDate] = useState('');
  const [billNotes, setBillNotes] = useState('');

  // Load customers on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setCustomers(arr);
        else setCustomers(defaultCustomers);
      } else {
        setCustomers(defaultCustomers);
      }
    } catch { setCustomers(defaultCustomers); }
    setLoaded(true);
  }, [defaultCustomers]);

  // Persist on changes
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(customers)); } catch {}
  }, [customers, loaded]);

  const addDeviceRow = () => setDevices(d => [...d, { name: '', purchaseDate: '', warrantyMonths: 0 }]);
  const updateDevice = (i: number, patch: Partial<CustomerDevice>) => setDevices(d => d.map((x, idx) => idx===i? { ...x, ...patch }: x));
  const removeDevice = (i: number) => setDevices(d => d.filter((_, idx) => idx!==i));

  function warrantyInfo(device: CustomerDevice) {
    const purchase = new Date(device.purchaseDate);
    const end = new Date(purchase);
    end.setMonth(end.getMonth() + (device.warrantyMonths || 0));
    const now = new Date();
    const remainingMs = end.getTime() - now.getTime();
    const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
    const active = remainingMs > 0;
    return { end, remainingDays, active };
  }
  const formatDate = (d: Date) => d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  const remainingText = (end: Date) => {
    const now = new Date();
    const diffMs = end.getTime() - now.getTime();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'Expired';
    if (days > 365) return `${(days / 365).toFixed(1)} years`;
    return `${days} days`;
  };

  // Form open/close
  const openAdd = () => { setEditIndex(null); setName(''); setEmail(''); setDevices([{ name: '', purchaseDate: '', warrantyMonths: 0 }]); setShowForm(true); };
  const openEdit = (idx: number) => { const c = customers[idx]; setEditIndex(idx); setName(c.name); setEmail(c.email); setDevices(c.devices||[]); setShowForm(true); };
  const closeForm = () => setShowForm(false);

  const saveForm = () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail) return;
    const duplicate = customers.some((u, i) => u.email.toLowerCase() === trimmedEmail.toLowerCase() && i !== (editIndex ?? -1));
    if (duplicate) { showToast('A customer with this email already exists.', 'warn'); return; }
    const cleanDevices = devices.filter(d => d.name && d.purchaseDate);
    if (editIndex === null) {
      setCustomers(prev => [...prev, { name: trimmedName, email: trimmedEmail, devices: cleanDevices }]);
      showToast('Customer added', 'success');
    } else {
      setCustomers(prev => prev.map((c, i) => i===editIndex ? { name: trimmedName, email: trimmedEmail, devices: cleanDevices } : c));
      showToast('Customer updated', 'success');
    }
    setShowForm(false);
  };

  const openDetails = (idx: number) => setDetailsIdx(idx);
  const closeDetails = () => setDetailsIdx(null);

  const deleteCustomer = (idx: number) => {
    if (!confirm('Delete this customer?')) return;
    setCustomers(prev => prev.filter((_, i) => i!==idx));
    showToast('Customer deleted', 'success');
  };

  // Bills helpers
  const billImageKey = (customerName: string, deviceName: string) => `billImage:${customerName}::${deviceName}`;
  const loadBillImage = (customerName: string, deviceName: string) => {
    try { return localStorage.getItem(billImageKey(customerName, deviceName)); } catch { return null; }
  };
  const saveBillImage = (customerName: string, deviceName: string, dataUrl: string) => {
    try { localStorage.setItem(billImageKey(customerName, deviceName), dataUrl); } catch {}
  };
  const loadBills = (): Bill[] => { try { return JSON.parse(localStorage.getItem(BILLS_KEY) || '[]') || []; } catch { return []; } };
  const saveBills = (v: Bill[]) => { try { localStorage.setItem(BILLS_KEY, JSON.stringify(v)); } catch {} };

  // Bill view
  const openBillView = (deviceName: string, customerName: string) => {
    setBillViewDevice(deviceName);
    setBillViewImage(loadBillImage(customerName, deviceName));
    setShowBillView(true);
    try { document.documentElement.classList.add('overflow-hidden'); } catch {}
  };
  const closeBillView = () => { setShowBillView(false); try { document.documentElement.classList.remove('overflow-hidden'); } catch {} };

  const onChooseBillImage = (file: File, customerName: string, deviceName: string) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setBillViewImage(dataUrl);
      saveBillImage(customerName, deviceName, dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const shareOrEmailBill = async (customerEmail: string, deviceName: string) => {
    const customerName = detailsIdx !== null ? customers[detailsIdx].name : '';
    const img = billViewImage;
    if (!img) { showToast('No bill image found. Please upload an image first.', 'warn'); return; }
    try {
      const res = await fetch(img);
      const blob = await res.blob();
      if ((navigator as any).share && blob) {
        const file = new File([blob], `${deviceName.replace(/\s+/g,'_')}_bill.png`, { type: blob.type || 'image/png' });
        await (navigator as any).share({ title: 'Bill', text: `Bill for ${deviceName} — ${customerName}`, files: [file] });
        return;
      }
      // fallback: download then open mailto
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${deviceName.replace(/\s+/g,'_')}_bill.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {}
    const subject = encodeURIComponent(`Bill for ${deviceName}`);
    const body = encodeURIComponent(`Hi,\n\nPlease find the bill for ${deviceName}.\n\nRegards,\nSmile Smart Home`);
    const mailto = `mailto:${encodeURIComponent(customerEmail)}?subject=${subject}&body=${body}`;
    try { window.open(mailto, '_blank'); showToast('Opening email client…', 'info'); } catch { window.location.href = mailto; }
  };

  // Bill create
  const openBillCreate = (customerName: string, deviceName: string) => {
    setBillCustomer(customerName);
    setBillDevice(deviceName);
    setBillAmount('');
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth()+1).padStart(2,'0');
    const dd = String(today.getDate()).padStart(2,'0');
    setBillDate(`${yyyy}-${mm}-${dd}`);
    setBillNotes('');
    setShowBillCreate(true);
    try { document.documentElement.classList.add('overflow-hidden'); } catch {}
  };
  const closeBillCreate = () => { setShowBillCreate(false); try { document.documentElement.classList.remove('overflow-hidden'); } catch {} };
  const saveBillCreate = () => {
    const list = loadBills();
    list.push({ id: `${Date.now()}`, customer: billCustomer, device: billDevice, amount: Number(billAmount||0), date: billDate, notes: billNotes });
    saveBills(list);
    setShowBillCreate(false);
    showToast('Bill saved.', 'success');
  };

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold text-white mb-3">Customers</h1>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-400">View and manage customer profiles.</p>
        <button onClick={openAdd} className="px-3 py-1.5 rounded bg-teal-600 text-white hover:bg-teal-700">Add Customer</button>
      </div>

      {!loaded ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-gray-300">Loading…</div>
      ) : (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-800">
              <thead className="bg-gray-800/60">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Devices</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Warranty</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-gray-300">
                {customers.map((c, idx) => {
                  const count = (c.devices || []).length;
                  const anyActive = (c.devices || []).some(d => warrantyInfo(d).active);
                  const label = count === 0 ? '-' : (anyActive ? 'Active' : 'Expired');
                  const badgeClass = anyActive ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
                  return (
                    <tr key={c.email}>
                      <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</div><div className="text-xs text-gray-500 dark:text-gray-400">{c.email}</div></td>
                      <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-900 dark:text-gray-200">{count}</div></td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center gap-3 justify-center">
                          <span className={`inline-flex items-center justify-center h-6 w-20 px-2 rounded text-xs ${badgeClass}`}>{label}</span>
                          <button onClick={() => openDetails(idx)} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded border border-gray-300 dark:border-gray-600">Details</button>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => openEdit(idx)} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded border border-gray-300 dark:border-gray-600">Edit</button>
                          <button onClick={() => deleteCustomer(idx)} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded">Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white dark:bg-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{editIndex===null?'Add Customer':'Edit Customer'}</h3>
              <button onClick={closeForm} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm">Close</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300">Name</label>
                  <input value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300">Email</label>
                  <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm text-gray-600 dark:text-gray-300">Devices</label>
                  <button type="button" onClick={addDeviceRow} className="px-2 py-1 text-sm rounded bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100">Add Row</button>
                </div>
                <div className="space-y-2">
                  {devices.map((d, i) => (
                    <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                      <input placeholder="Device name" value={d.name} onChange={e=>updateDevice(i,{name: e.target.value})} className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                      <input type="date" value={d.purchaseDate} onChange={e=>updateDevice(i,{purchaseDate: e.target.value})} className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                      <input type="number" min={0} placeholder="Warranty (months)" value={d.warrantyMonths} onChange={e=>updateDevice(i,{warrantyMonths: Number(e.target.value||0)})} className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                      <button type="button" onClick={()=>removeDevice(i)} className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600">Remove</button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={closeForm} className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600">Cancel</button>
                <button onClick={saveForm} className="px-3 py-1.5 rounded bg-teal-600 text-white">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {detailsIdx !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl rounded-lg bg-white dark:bg-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Customer Devices</h3>
              <button onClick={closeDetails} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm">Close</button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Device Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Warranty Start</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Warranty End</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Remaining</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Extend Warranty</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Bill</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {(customers[detailsIdx].devices||[]).map((d) => {
                    const info = warrantyInfo(d);
                    const start = new Date(d.purchaseDate);
                    const end = info.end;
                    const remaining = remainingText(end);
                    return (
                      <tr key={`${d.name}-${d.purchaseDate}`}>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{d.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400"></div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">{formatDate(start)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">{formatDate(end)}</td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm ${remaining === 'Expired' ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'}`}>{remaining}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">Extend</button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => openBillView(d.name, customers[detailsIdx].name)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">View Bill</button>
                            <button onClick={() => openBillCreate(customers[detailsIdx].name, d.name)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-teal-600 text-white hover:bg-teal-700">Create Bill</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Bill View Modal */}
      {showBillView && detailsIdx !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white dark:bg-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Bill Image</h3>
              <button onClick={closeBillView} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm">Close</button>
            </div>
            <div className="space-y-3">
              <img src={billViewImage || ''} alt={billViewImage ? `Bill image for ${billViewDevice}` : 'No bill image uploaded yet'} className="w-full max-h-[60vh] object-contain rounded border border-gray-300 dark:border-gray-700" />
              <input id="billImageInputReact" type="file" accept="image/*" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; if (f && billViewDevice) onChooseBillImage(f, customers[detailsIdx].name, billViewDevice); }} />
              <div className="flex items-center gap-2">
                <label htmlFor="billImageInputReact" className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 cursor-pointer">Upload/Change Image</label>
                <button onClick={()=>shareOrEmailBill(customers[detailsIdx].email, billViewDevice || '')} className="px-3 py-1.5 rounded bg-teal-600 text-white">Send to Customer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bill Create Modal */}
      {showBillCreate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white dark:bg-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Create Bill</h3>
              <button onClick={closeBillCreate} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm">Close</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300">Customer</label>
                  <input value={billCustomer} onChange={e=>setBillCustomer(e.target.value)} className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300">Device</label>
                  <input value={billDevice} onChange={e=>setBillDevice(e.target.value)} className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300">Amount</label>
                  <input type="number" value={billAmount} onChange={e=>setBillAmount(e.target.value===''?'':Number(e.target.value))} className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300">Date</label>
                  <input type="date" value={billDate} onChange={e=>setBillDate(e.target.value)} className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300">Notes</label>
                <textarea value={billNotes} onChange={e=>setBillNotes(e.target.value)} className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" rows={3} />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={closeBillCreate} className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600">Cancel</button>
                <button onClick={saveBillCreate} className="px-3 py-1.5 rounded bg-teal-600 text-white">Save Bill</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default Customers;
