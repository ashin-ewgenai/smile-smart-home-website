import React, { useEffect, useState, useRef } from 'react';
import { X } from 'lucide-react';
import { db, auth } from '../../../lib/firebase';
import { addDoc, serverTimestamp, setDoc, getDocs, query, where } from 'firebase/firestore';
import { userServiceRequestsParentDoc, userServiceRequestsCollection } from '../../../models/Collections';

interface Props {
  open: boolean;
  onClose: () => void;
  deviceOptions: string[];
}

const RequestServiceModal = ({ open, onClose, deviceOptions }: Props) => {
  const [reqService, setReqService] = useState<'installation' | 'maintenance' | 'troubleshooting' | 'warranty' | 'internet' | 'tv'>('installation');
  const [reqDevice, setReqDevice] = useState('');
  const [reqDate, setReqDate] = useState('');
  const [reqTime, setReqTime] = useState('');
  const [reqPriority, setReqPriority] = useState<'normal' | 'high' | 'low'>('normal');
  const [reqDesc, setReqDesc] = useState('');
  const [reqSuccess, setReqSuccess] = useState('');
  const [reqError, setReqError] = useState('');
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

  // Close time dropdown on outside click
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

  // Lock background/body scroll when modal is open
  useEffect(() => {
    if (!open) return;
    
    // Save current scroll position
    const scrollY = window.scrollY;
    const body = document.body;
    const html = document.documentElement;
    
    // Lock the body scroll
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    
    // Prevent touch events from reaching document
    const preventDefault = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      const isScrollable = target.closest('.modal-scroll-content');
      if (!isScrollable) {
        e.preventDefault();
      }
    };
    
    document.addEventListener('touchmove', preventDefault, { passive: false });

    // Prevent background scrolling via touchpad/mouse wheel outside modal content
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      const isInsideScrollable = target?.closest?.('.modal-scroll-content');
      if (!isInsideScrollable) {
        e.preventDefault();
      }
    };
    document.addEventListener('wheel', onWheel, { passive: false });
    
    return () => {
      // Restore body styles and scroll position
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.overflow = '';
      html.style.overflow = '';
      window.scrollTo(0, scrollY);
      
      // Remove event listener
      document.removeEventListener('touchmove', preventDefault);
      document.removeEventListener('wheel', onWheel as EventListener);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto overscroll-none touch-none"
      role="dialog"
      aria-modal="true"
      aria-label="Request Service"
      onWheel={(e) => {
        // If wheel happens on overlay and not inside scrollable content, block it
        const target = e.target as HTMLElement;
        const isScrollable = target.closest('.modal-scroll-content');
        if (!isScrollable && e.cancelable) {
          e.preventDefault();
        }
      }}
      onTouchMove={(e) => {
        e.stopPropagation();
        const target = e.target as HTMLElement;
        const isScrollable = target.closest('.modal-scroll-content');
        if (!isScrollable) {
          e.preventDefault();
        }
      }}
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[90vh]">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center sticky top-0 z-10 bg-white dark:bg-gray-800">
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
          <div 
            className="modal-scroll-content flex-1 px-6 py-4"
            style={{
              maxHeight: '70vh',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(156, 163, 175, 0.5) transparent',
              touchAction: 'pan-y',
              msOverflowStyle: 'none',
              overflowY: 'auto',
              willChange: 'transform',
              WebkitTransform: 'translateZ(0)',
              transform: 'translateZ(0)'
            }}
            onWheel={(e) => {
              // Keep wheel inside the modal and prevent scroll chaining at edges
              e.stopPropagation();
              const el = e.currentTarget as HTMLDivElement;
              const { scrollTop, scrollHeight, clientHeight } = el;
              const atTop = scrollTop <= 0;
              const atBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight;
              if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
                if (e.cancelable) e.preventDefault();
              }
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
              const target = e.target as HTMLElement;
              const scrollable = target.closest('.modal-scroll-content');
              if (scrollable) {
                const { scrollTop, scrollHeight, clientHeight } = scrollable;
                const isAtTop = scrollTop === 0 && e.touches[0].clientY > 0;
                const isAtBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight - 1 && e.touches[0].clientY < 0;
                
                if ((isAtTop || isAtBottom) && e.cancelable) {
                  e.preventDefault();
                }
              }
            }}
          >
            <form 
              id="service-request-form"
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
                  // Ensure parent doc exists at serviceRequests/{uid}
                  const parentRef = userServiceRequestsParentDoc(db, user.uid);
                  await setDoc(
                    parentRef,
                    { uid: user.uid, updatedAt: serverTimestamp() },
                    { merge: true }
                  );

                  // Add the request into subcollection 'requests'
                  await addDoc(userServiceRequestsCollection(db, user.uid), {
                    ...payload,
                    updatedAt: serverTimestamp(),
                  });

                  // Recompute aggregates on parent: total_no and review_no (closed only)
                  const listRef = userServiceRequestsCollection(db, user.uid);
                  const [allSnap, closedSnap] = await Promise.all([
                    getDocs(listRef),
                    getDocs(query(listRef, where('status', '==', 'closed'))),
                  ]);
                  const total_no = allSnap.size;
                  const review_no = closedSnap.size; // exclude 'open'
                  await setDoc(
                    parentRef,
                    { total_no, review_no, updatedAt: serverTimestamp() },
                    { merge: true }
                  );
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor="reqService" className="text-sm text-gray-700 dark:text-gray-200">Service</label>
                  <select
                    id="reqService"
                    value={reqService}
                    onChange={(e) => { clearReqFeedback(); setReqService(e.target.value as typeof reqService); }}
                    className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-2"
                  >
                    <option value="maintenance">Maintenance</option>
                    <option value="troubleshooting">Troubleshooting</option>
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
                        style={{
                          overscrollBehavior: 'contain',
                          WebkitOverflowScrolling: 'touch',
                        }}
                        onWheel={(e) => {
                          e.stopPropagation();
                          const el = e.currentTarget;
                          const { scrollTop, scrollHeight, clientHeight } = el;
                          const isAtTop = scrollTop === 0;
                          const isAtBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight;
                          
                          if ((e.deltaY < 0 && isAtTop) || (e.deltaY > 0 && isAtBottom)) {
                            e.preventDefault();
                          }
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
                            const deltaY = touchStartYRef.current - currentY;
                            touchStartYRef.current = currentY;
                            
                            const { scrollTop, scrollHeight, clientHeight } = el;
                            const isAtTop = scrollTop === 0 && deltaY < 0;
                            const isAtBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight && deltaY > 0;
                            
                            if (!isAtTop && !isAtBottom) {
                              e.stopPropagation();
                              e.preventDefault();
                              el.scrollTop += deltaY;
                            } else if ((isAtTop && deltaY > 0) || (isAtBottom && deltaY < 0)) {
                              e.stopPropagation();
                            } else {
                              e.preventDefault();
                            }
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
                  <label htmlFor="reqDesc" className="text-sm text-gray-700 dark:text-gray-200">Describe what service do you need</label>
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
              <div className="mt-6 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => { clearReqFeedback(); onClose(); }} 
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-600 border border-transparent rounded-md hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RequestServiceModal;
