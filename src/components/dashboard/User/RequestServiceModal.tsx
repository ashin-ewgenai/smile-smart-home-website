import React, { useEffect, useState, useRef } from 'react';
import { X } from 'lucide-react';
import { db, auth } from '../../../lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

interface Props {
  open: boolean;
  onClose: () => void;
  deviceOptions: string[];
}

const RequestServiceModal: React.FC<Props> = ({ open, onClose, deviceOptions }) => {
  const [reqService, setReqService] = useState<'installation' | 'maintenance' | 'troubleshooting' | 'warranty' | 'internet' | 'tv'>('installation');
  const [reqDevice, setReqDevice] = useState('');
  const [reqDate, setReqDate] = useState('');
  const [reqTime, setReqTime] = useState('');
  const [reqPriority, setReqPriority] = useState<'normal' | 'high' | 'low'>('normal');
  const [reqDesc, setReqDesc] = useState('');
  const [reqSuccess, setReqSuccess] = useState('');
  const [reqError, setReqError] = useState('');
  // custom time dropdown state
  const [timeOpen, setTimeOpen] = useState(false);
  const timeDropdownRef = useRef<HTMLDivElement>(null);
  const timeSlots = [
    '09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30',
    '13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30',
    '17:00','17:30','18:00'
  ];
  const toLabel = (v: string) => {
    if (!v) return '';
    const [h, m] = v.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hh = ((h + 11) % 12) + 1; // 0->12, 13->1
    return `${hh}:${String(m).padStart(2,'0')} ${ampm}`;
  };

  const clearReqFeedback = () => { setReqSuccess(''); setReqError(''); };
  const touchStartYRef = useRef<number>(0);

  useEffect(() => { if (open) clearReqFeedback(); }, [open]);

  // close time dropdown on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!timeDropdownRef.current) return;
      if (timeDropdownRef.current && !timeDropdownRef.current.contains(e.target as Node)) {
        setTimeOpen(false);
      }
    };
    if (timeOpen) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [timeOpen]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Request Service">
      <div className="relative w-full max-w-2xl">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Request Service</h2>
            <button
              onClick={() => { clearReqFeedback(); onClose(); }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800 transition"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
              <span className="text-sm font-medium">Close</span>
            </button>
          </div>
          {reqSuccess && (
            <div className="mx-6 mt-4 rounded-md bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3">
              {reqSuccess}
            </div>
          )}
          {reqError && (
            <div className="mx-6 mt-4 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3">
              {reqError}
            </div>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!reqDevice || !reqDate || !reqTime) {
                alert('Please select device, date, and time.');
                return;
              }
              const user = auth.currentUser;
              if (!user) {
                alert('Please sign in to submit a service request.');
                return;
              }
              const payload = {
                uid: user.uid,
                service: reqService,
                device: reqDevice,
                date: reqDate,
                time: reqTime,
                priority: reqPriority,
                description: reqDesc,
                status: 'open' as const,
                createdAt: serverTimestamp(),
              };
              try {
                await addDoc(collection(db, 'serviceRequests'), payload);
                setReqSuccess('Submitted successfully.');
                setReqError('');
                setReqDevice('');
                setReqDate('');
                setReqTime('');
                setReqPriority('normal');
                setReqDesc('');
              } catch (err: any) {
                setReqError(`Failed to submit request: ${err?.message || err}`);
                setReqSuccess('');
              }
            }}
          >
            <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="reqService" className="text-sm text-gray-700 dark:text-gray-200">Service</label>
                <select
                  id="reqService"
                  value={reqService}
                  onChange={(e) => { clearReqFeedback(); setReqService(e.target.value as typeof reqService); }}
                  className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-2"
                >
                  <option value="installation">Installation</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="troubleshooting">Troubleshooting</option>
                  <option value="warranty">Warranty</option>
                  <option value="internet">Internet</option>
                  <option value="tv">TV</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="reqDevice" className="text-sm text-gray-700 dark:text-gray-200">Device</label>
                <select
                  id="reqDevice"
                  value={reqDevice}
                  onChange={(e) => { clearReqFeedback(); setReqDevice(e.target.value); }}
                  className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-2"
                >
                  <option value="">Select device</option>
                  {deviceOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="reqDate" className="text-sm text-gray-700 dark:text-gray-200">Preferred Date</label>
                <input
                  id="reqDate"
                  type="date"
                  value={reqDate}
                  onChange={(e) => { clearReqFeedback(); setReqDate(e.target.value); }}
                  className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-2"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="reqTime" className="text-sm text-gray-700 dark:text-gray-200">Preferred Time</label>
                <div ref={timeDropdownRef} className="relative">
                  <button
                    id="reqTime"
                    type="button"
                    onClick={() => setTimeOpen((v) => !v)}
                    aria-haspopup="listbox"
                    aria-expanded={timeOpen}
                    className="w-full text-left rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {reqTime ? toLabel(reqTime) : 'Select a time'}
                  </button>
                  {timeOpen && (
                    <div
                      className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 shadow-lg max-h-48 overflow-y-auto overscroll-contain touch-pan-y"
                      onWheel={(e) => {
                        e.stopPropagation();
                      }}
                      onTouchStart={(e) => {
                        if (e.touches && e.touches.length > 0) {
                          touchStartYRef.current = e.touches[0].clientY;
                        }
                      }}
                      onTouchMove={(e) => {
                        const el = e.currentTarget as HTMLDivElement;
                        if (e.touches && e.touches.length > 0) {
                          const currentY = e.touches[0].clientY;
                          const deltaY = touchStartYRef.current - currentY; // positive = scroll down
                          touchStartYRef.current = currentY;
                          const prev = el.scrollTop;
                          el.scrollTop += deltaY;
                          // Stop bubbling so background doesn't scroll
                          e.stopPropagation();
                        }
                      }}
                    >
                      <ul role="listbox" aria-label="Available times" className="py-1">
                        {timeSlots.map((t) => (
                          <li key={t} role="option" aria-selected={reqTime === t}>
                            <button
                              type="button"
                              onClick={() => { clearReqFeedback(); setReqTime(t); setTimeOpen(false); }}
                              className={`w-full text-left px-3 py-2 text-sm ${reqTime === t ? 'bg-teal-600 text-white' : 'text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600/40'}`}
                            >
                              {toLabel(t)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Quick picks:</span>
                  <button
                    type="button"
                    onClick={() => {
                      clearReqFeedback();
                      const now = new Date();
                      const minutes = now.getMinutes();
                      const rounded = minutes % 15 === 0 ? minutes : minutes + (15 - (minutes % 15));
                      if (rounded === 60) { now.setHours(now.getHours() + 1); now.setMinutes(0); }
                      else { now.setMinutes(rounded); }
                      const hh = String(now.getHours()).padStart(2,'0');
                      const mm = String(now.getMinutes()).padStart(2,'0');
                      setReqTime(`${hh}:${mm}`);
                    }}
                    className="px-2 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600/40"
                  >Now</button>
                  <button type="button" onClick={() => { clearReqFeedback(); setReqTime('09:00'); }} className="px-2 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600/40">9:00 AM</button>
                  <button type="button" onClick={() => { clearReqFeedback(); setReqTime('13:00'); }} className="px-2 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600/40">1:00 PM</button>
                  <button type="button" onClick={() => { clearReqFeedback(); setReqTime('17:00'); }} className="px-2 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600/40">5:00 PM</button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="reqPriority" className="text-sm text-gray-700 dark:text-gray-200">Priority</label>
                <select
                  id="reqPriority"
                  value={reqPriority}
                  onChange={(e) => { clearReqFeedback(); setReqPriority(e.target.value as typeof reqPriority); }}
                  className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-2"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="md:col-span-2 flex flex-col gap-1">
                <label htmlFor="reqDesc" className="text-sm text-gray-700 dark:text-gray-200">Describe the issue</label>
                <textarea
                  id="reqDesc"
                  value={reqDesc}
                  onChange={(e) => { clearReqFeedback(); setReqDesc(e.target.value); }}
                  placeholder="Provide details to help our technician"
                  rows={4}
                  className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-2"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button type="button" onClick={() => { clearReqFeedback(); onClose(); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
              <button type="submit" className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-teal-600 text-white hover:bg-teal-700">Submit Request</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default RequestServiceModal;
