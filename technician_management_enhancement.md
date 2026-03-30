# Technician & Dispatch Center Enhancement (Archived)

> **Status:** Rejected by user on 2026-03-28
> **Restore Guide:** Copy the code blocks below into their respective files to re-enable this feature.

---

## Step 1: Collections.ts — Append Technician Schema

> **File:** `src/models/Collections.ts`
> **Action:** Append to end of file

```typescript
// =====================
// Technicians Management
// =====================
export interface Technician {
  id?: string;
  fullName: string;
  phone: string;
  specialization: string;
  status: 'Available' | 'Busy' | 'Off-Duty' | string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export const COLLECTION_TECHNICIANS = 'Technicians';

export function techniciansCollection(db: Firestore): CollectionReference<Technician> {
  return collection(db, COLLECTION_TECHNICIANS) as CollectionReference<Technician>;
}

export function technicianDoc(db: Firestore, id: string): DocumentReference<Technician> {
  return doc(db, COLLECTION_TECHNICIANS, id) as DocumentReference<Technician>;
}
```

---

## Step 2: Create Technicians.tsx Component

> **File:** `src/components/dashboard/Admin/Technicians.tsx`
> **Action:** Create new file

```tsx
import React, { useState, useEffect } from 'react';
import { HardHat, Plus, Trash2, Calendar, Phone, Activity, Clock, FileText, CheckCircle, AlertCircle, X, Wrench } from 'lucide-react';
import { query, orderBy, getDocs, addDoc, serverTimestamp, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { techniciansCollection, technicianDoc, requestServicesCollection, requestServiceDoc, type Technician, type RequestService } from '../../../models/Collections';

interface TechnicianWithId extends Omit<Technician, 'id'> { id: string; }
interface RequestWithId extends RequestService { id: string; }

export default function Technicians() {
  const [technicians, setTechnicians] = useState<TechnicianWithId[]>([]);
  const [requests, setRequests] = useState<RequestWithId[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addSpecialization, setAddSpecialization] = useState('');
  const [addStatus, setAddStatus] = useState<Technician['status']>('Available');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const techSnap = await getDocs(query(techniciansCollection(db), orderBy('createdAt', 'desc')));
      const techList = techSnap.docs.map(d => ({ ...d.data(), id: d.id } as TechnicianWithId));
      setTechnicians(techList);

      const reqSnap = await getDocs(query(requestServicesCollection(db), orderBy('createdAt', 'desc')));
      const reqList = reqSnap.docs.map(d => ({ ...d.data(), id: d.id } as RequestWithId));
      setRequests(reqList);
    } catch (err: any) {
      setError(err?.message || 'Failed to load dispatch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName || !addPhone || !addSpecialization) return;
    setAdding(true);
    try {
      await addDoc(techniciansCollection(db), {
        fullName: addName,
        phone: addPhone,
        specialization: addSpecialization,
        status: addStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setShowAdd(false);
      setAddName(''); setAddPhone(''); setAddSpecialization('');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to add technician');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteTech = async (id: string, name: string) => {
    if (!confirm(`Remove technician ${name}?`)) return;
    try {
      await deleteDoc(technicianDoc(db, id));
      setTechnicians(prev => prev.filter(t => t.id !== id));
    } catch { alert('Failed to delete technician.'); }
  };

  const handleAssignTech = async (requestId: string, technicianId: string) => {
    try {
      await updateDoc(requestServiceDoc(db, requestId), {
        assignedTo: technicianId,
        assignedAt: serverTimestamp(),
        status: technicianId ? 'in_progress' : 'open'
      });
      setRequests(prev => prev.map(req =>
        req.id === requestId
          ? { ...req, assignedTo: technicianId, status: technicianId ? 'in_progress' : 'open' } as RequestWithId
          : req
      ));
    } catch { alert('Failed to assign technician'); }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden space-y-6">

      {/* Header */}
      <div className="glass-surface rounded-[24px] px-6 py-6 border border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white inline-flex items-center gap-2">
            Dispatch Center <HardHat className="h-5 w-5 text-teal-500" />
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your service technicians and assign jobs.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-xl shadow-sm hover:bg-teal-700 transition-colors focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900">
          <Plus className="h-4 w-4" /> Add Technician
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-4 rounded-xl border border-red-200 dark:border-red-800 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />{error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: Technician Roster */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            Team Roster <span className="bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-400 px-2 py-0.5 rounded-full text-xs">{technicians.length}</span>
          </h2>

          {technicians.length === 0 ? (
            <div className="bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 text-center text-gray-500">
              <HardHat className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No technicians on roster.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {technicians.map(tech => (
                <div key={tech.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-sm relative group overflow-hidden">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${tech.status === 'Available' ? 'bg-emerald-500' : tech.status === 'Busy' ? 'bg-amber-500' : 'bg-gray-400'}`}></div>
                  <button onClick={() => handleDeleteTech(tech.id, tech.fullName)} className="absolute right-3 top-3 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="pl-3">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-gray-900 dark:text-white text-base">{tech.fullName}</h3>
                      <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded-full border
                        ${tech.status === 'Available' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800' :
                          tech.status === 'Busy' ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800' :
                          'bg-gray-100 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700'}`}>
                        {tech.status}
                      </span>
                    </div>
                    <div className="space-y-1.5 mt-3">
                      <div className="flex items-center text-xs text-gray-600 dark:text-gray-400 gap-2"><Wrench className="h-3.5 w-3.5" /> {tech.specialization}</div>
                      <div className="flex items-center text-xs text-gray-600 dark:text-gray-400 gap-2"><Phone className="h-3.5 w-3.5" /> {tech.phone}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Dispatch Board */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            Active Dispatches <Activity className="h-5 w-5 text-gray-400" />
          </h2>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">
            {requests.length === 0 ? (
              <div className="p-10 text-center text-gray-500">
                <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-20 text-emerald-500" />
                <p>No active service requests.</p>
              </div>
            ) : (
              <div className="overflow-x-auto min-h-[400px]">
                <table className="w-full text-left text-sm text-gray-600 dark:text-gray-300">
                  <thead className="bg-gray-50/50 dark:bg-gray-900/50 text-xs uppercase font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-5 py-4">Job Details</th>
                      <th className="px-5 py-4">Date & Time</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4">Assigned Tech</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                    {requests.map(req => (
                      <tr key={req.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/30 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-medium text-gray-900 dark:text-white mb-1">{req.service || 'Service Request'}</div>
                          <div className="text-xs flex items-center gap-1"><FileText className="w-3 h-3" /> {req.description?.substring(0, 40) || 'No description'}...</div>
                          {req.priority === 'high' && <span className="inline-block mt-2 text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded border border-red-200 dark:border-red-900 uppercase">High Priority</span>}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-xs">
                          <div className="flex items-center gap-1.5 mb-1"><Calendar className="w-3.5 h-3.5 text-gray-400" /> {req.date}</div>
                          <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-gray-400" /> {req.time}</div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${
                            req.status === 'open' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800' :
                            req.status === 'in_progress' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800' :
                            req.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800' :
                            'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
                          }`}>{req.status === 'in_progress' ? 'Dispatched' : req.status}</span>
                        </td>
                        <td className="px-5 py-4">
                          <select value={req.assignedTo || ''} onChange={(e) => handleAssignTech(req.id, e.target.value)} disabled={req.status === 'completed'}
                            className="w-full text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:opacity-50">
                            <option value="">Unassigned</option>
                            {technicians.map(t => (<option key={t.id} value={t.id}>{t.fullName} ({t.status})</option>))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Technician Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAdd(false)} />
          <div className="relative z-10 bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white inline-flex items-center gap-2">
                <HardHat className="text-teal-500 h-6 w-6" /> Add Technician
              </h2>
              <button onClick={() => setShowAdd(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-50 dark:bg-gray-700/50 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Full Name</label>
                <input required value={addName} onChange={e => setAddName(e.target.value)} placeholder="e.g. John Doe" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-shadow" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Phone Number</label>
                <input required type="tel" value={addPhone} onChange={e => setAddPhone(e.target.value)} placeholder="+91 98765 43210" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-shadow" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Specialization</label>
                <input required value={addSpecialization} onChange={e => setAddSpecialization(e.target.value)} placeholder="e.g. Security Systems, Smart Lighting" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-shadow" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Current Status</label>
                <select value={addStatus} onChange={e => setAddStatus(e.target.value as Technician['status'])} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-shadow">
                  <option value="Available">🟢 Available</option>
                  <option value="Busy">🟠 Busy</option>
                  <option value="Off-Duty">⚪ Off-Duty</option>
                </select>
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-gray-100 dark:border-gray-700">
                <button type="button" onClick={() => setShowAdd(false)} className="px-5 py-2.5 rounded-xl font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                <button type="submit" disabled={adding} className="px-5 py-2.5 rounded-xl font-medium bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                  {adding ? 'Saving...' : 'Save Technician'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Step 3: AdminApp.tsx — Add Import & Route

> **File:** `src/components/dashboard/Admin/AdminApp.tsx`
> **Action:** Add import at top + route inside `<Routes>`

```tsx
// Add this import alongside other imports:
import Technicians from './Technicians';

// Add this route inside <Routes>, before the catch-all:
<Route path="/technicians" element={<Technicians />} />
```

---

## Step 4: AdminSidebar.tsx — Add Navigation Link

> **File:** `src/components/dashboard/Admin/AdminSidebar.tsx`
> **Action:** Add `HardHat` to imports + sidebar link

```tsx
// Update the lucide-react import to include HardHat:
import { Settings, Users, LayoutDashboard, FilePlus, Cpu, UserCircle2, BarChart2, MessageCircle, HardHat } from 'lucide-react';

// Add this <Item> block after Contact Submissions:
<Item href="/dashboard/admin/technicians">
  <span className="inline-flex items-center gap-2">
    <HardHat className="h-5 w-5" />
    Dispatch Center
  </span>
</Item>
```
