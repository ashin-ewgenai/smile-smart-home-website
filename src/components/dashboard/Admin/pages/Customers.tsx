import React, { useEffect, useMemo, useState } from 'react';
import { showToast } from '../../../../lib/toast';
import { db } from '../../../../lib/firebase';
import { contactMessagesCollection } from '../../../../models/Collections';
import { getDocs } from 'firebase/firestore';

const Customers: React.FC = () => {
  type CustomerDevice = { name: string; purchaseDate: string; warrantyMonths: number };
  type Customer = { name: string; email: string; devices: CustomerDevice[]; phone?: string; message?: string };
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
  const [detailsMessage, setDetailsMessage] = useState('');
  const [detailsPhone, setDetailsPhone] = useState('');

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

  // Load customers on mount — try Firestore(Contact_Messages) first, fallback to localStorage/defaults
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const snap = await getDocs(contactMessagesCollection(db));
        const seen = new Set<string>();
        const list: Customer[] = [];
        snap.forEach((doc) => {
          const data = doc.data() as any;
          const email = String(data?.email || '').trim();
          const name = String(data?.name || '').trim();
          const phone = String(data?.phone || '').trim();
          const message = String(data?.message || '').trim();
          if (email && !seen.has(email)) {
            seen.add(email);
            list.push({ name: name || email, email, devices: [], phone, message });
          }
        });
        if (!cancelled) {
          if (list.length) {
            setCustomers(list);
          } else {
            // fallback to local cache/defaults
            try {
              const raw = localStorage.getItem(STORAGE_KEY);
              if (raw) {
                const arr = JSON.parse(raw);
                setCustomers(Array.isArray(arr) ? arr : defaultCustomers);
              } else {
                setCustomers(defaultCustomers);
              }
            } catch { setCustomers(defaultCustomers); }
          }
          setLoaded(true);
        }
      } catch {
        // Firestore failed (rules/offline) — use local cache/defaults
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const arr = JSON.parse(raw);
            setCustomers(Array.isArray(arr) ? arr : defaultCustomers);
          } else {
            setCustomers(defaultCustomers);
          }
        } catch { setCustomers(defaultCustomers); }
        if (!cancelled) setLoaded(true);
      }
    };
    load();
    return () => { cancelled = true; };
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

  // Open WhatsApp helper (component scope)
  function openWhatsApp(rawPhone?: string, text?: string) {
    const digits = String(rawPhone || '').replace(/\D+/g, '');
    if (!digits) { showToast('No phone number available for WhatsApp.', 'warn'); return; }
    const url = `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
    try { window.open(url, '_blank'); } catch { window.location.href = url; }
  }

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

  const openDetails = (idx: number) => {
    setDetailsIdx(idx);
    const c = customers[idx];
    setDetailsMessage(c?.message || '');
    setDetailsPhone(c?.phone || '');
  };
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Customer Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Details</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider"><span className="sr-only">Connect</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-gray-300">
                {customers.map((c, idx) => (
                  <tr key={c.email}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500 dark:text-gray-400">{c.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button onClick={() => openDetails(idx)} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded border border-gray-300 dark:border-gray-600">Details</button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => openWhatsApp(customers[idx]?.phone, `Hi ${customers[idx]?.name}`)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded border text-white bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 border-red-700 dark:border-red-700"
                        aria-label="Connect"
                        title="Connect"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          width="16"
                          height="16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      

      {/* Details Modal */}
      {detailsIdx !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={closeDetails}>
          <div className="w-full max-w-lg rounded-lg bg-white dark:bg-gray-800 p-3 ml-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Details</h3>
              <button
                onClick={closeDetails}
                className="inline-flex items-center justify-center w-8 h-8 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Close"
                title="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Message</label>
                <div className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                  {detailsMessage || '-'}
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Phone Number</label>
                <div className="flex items-center gap-2">
                  <span className="inline-flex text-gray-900 dark:text-gray-100">{detailsPhone || '-'}</span>
                  {/* WhatsApp icon button */}
                  <button
                    type="button"
                    onClick={() => openWhatsApp(detailsPhone, detailsMessage ? detailsMessage : undefined)}
                    className="inline-flex items-center justify-center text-green-500 hover:text-green-600 focus:outline-none"
                    aria-label="Open WhatsApp chat"
                    title="Open WhatsApp chat"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      className="fill-current"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M20.52 3.48A11.77 11.77 0 0 0 12.01 0C5.75 0 .67 5.08.67 11.34c0 2 .52 3.98 1.52 5.72L0 24l6.12-2.06a11.3 11.3 0 0 0 5.89 1.6h.01c6.26 0 11.34-5.08 11.34-11.34 0-3.03-1.18-5.88-3.38-7.72ZM12.02 21.3h-.01a9.96 9.96 0 0 1-5.07-1.4l-.36-.21-3.63 1.22 1.2-3.53-.24-.36a9.93 9.93 0 0 1-1.57-5.28c0-5.5 4.48-9.98 9.99-9.98 2.67 0 5.18 1.04 7.07 2.92a9.92 9.92 0 0 1 2.92 7.06c0 5.5-4.48 9.98-9.99 9.98Zm5.73-7.46c-.31-.16-1.85-.91-2.14-1.01-.29-.11-.5-.16-.72.16-.21.31-.83 1.01-1.02 1.22-.19.2-.38.22-.7.06-.31-.16-1.33-.49-2.54-1.56-.94-.84-1.57-1.88-1.75-2.2-.18-.31-.02-.48.14-.64.14-.13.31-.34.47-.51.16-.18.21-.3.31-.5.1-.2.05-.38-.02-.54-.16-.16-.72-1.73-.98-2.36-.26-.63-.52-.53-.72-.54h-.62c-.2 0-.53.08-.81.38-.28.31-1.07 1.05-1.07 2.55 0 1.49 1.1 2.93 1.26 3.13.16.2 2.17 3.31 5.26 4.65.74.32 1.32.51 1.77.65.74.24 1.41.2 1.94.12.59-.09 1.85-.76 2.11-1.49.26-.73.26-1.36.18-1.49-.07-.13-.28-.21-.59-.37Z"/>
                    </svg>
                  </button>
                </div>
              </div>
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
