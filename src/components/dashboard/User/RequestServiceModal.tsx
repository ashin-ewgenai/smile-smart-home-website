import React, { useEffect, useState, useRef } from 'react';
import { X } from 'lucide-react';
import { db, auth } from '../../../lib/firebase';
import { addDoc, serverTimestamp, setDoc, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { requestServicesCollection } from '../../../models/Collections';

interface Props {
  open: boolean;
  onClose: () => void;
  deviceOptions: string[];
}

const RequestServiceModal = ({ open, onClose, deviceOptions }: Props) => {
  const [reqService, setReqService] = useState<'installation' | 'maintenance' | 'troubleshooting' | 'warranty' | 'internet' | 'tv'>('maintenance');
  const [reqDevices, setReqDevices] = useState<string[]>([]);
  const [reqDate, setReqDate] = useState('');
  const [reqTime, setReqTime] = useState('');
  const [reqPriority, setReqPriority] = useState<'normal' | 'high' | 'low'>('normal');
  const [reqDesc, setReqDesc] = useState('');
  const [reqSuccess, setReqSuccess] = useState('');
  const [reqError, setReqError] = useState('');
  const [timeOpen, setTimeOpen] = useState(false);
  const [openRequestsCount, setOpenRequestsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
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

  useEffect(() => {
    if (open) {
      clearReqFeedback();
      // Live subscription to open requests count while modal is open
      const user = auth.currentUser;
      if (!user) return;
      setIsLoading(true);
      const qOpen = query(
        requestServicesCollection(db),
        where('uid', '==', user.uid),
        where('status', '==', 'open')
      );
      const unsub = onSnapshot(qOpen, (snap) => {
        setOpenRequestsCount(snap.size);
        setIsLoading(false);
      }, (err) => {
        console.error('Error subscribing open requests:', err);
        setIsLoading(false);
      });
      return () => unsub();
    }
  }, [open]);

  // keep legacy function name but not used anymore; left in case of reuse
  const fetchOpenRequestsCount = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const q = query(
        requestServicesCollection(db),
        where('uid', '==', user.uid),
        where('status', '==', 'open')
      );
      const querySnapshot = await getDocs(q);
      setOpenRequestsCount(querySnapshot.size);
    } catch (error) {
      console.error('Error fetching open requests:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const hasReachedLimit = openRequestsCount >= 3;

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
            className={`modal-scroll-content flex-1 px-6 py-4 ${hasReachedLimit ? 'opacity-75' : ''}`}
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
            {hasReachedLimit && (
              <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                <p className="text-yellow-700 dark:text-yellow-300">
                  Maximum limit reached. You already have 3 open service requests. Please wait until your existing requests are closed before submitting a new one.
                </p>
              </div>
            )}
            <form 
              id="service-request-form"
              aria-disabled={hasReachedLimit}
              className={hasReachedLimit ? 'pointer-events-none' : ''}
              onSubmit={async (e) => {
                e.preventDefault();
                // Guard: check live limit and required fields
                if (openRequestsCount >= 3) {
                  setReqError('You already have 3 open service requests. Please wait until one is closed.');
                  return;
                }
                if (reqDevices.length === 0 || !reqDate || !reqTime) {
                  alert('Please select at least one device, date, and time.');
                  return;
                }
                const user = auth.currentUser;
                if (!user) {
                  alert('Please sign in to submit a service request.');
                  return;
                }
                const request = {
                  uid: user.uid,
                  service: reqService,
                  devices: reqDevices,
                  date: reqDate,
                  time: reqTime,
                  priority: reqPriority,
                  description: reqDesc,
                  status: 'open' as const,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp()
                };
                try {
                  // Create a single service request with multiple devices
                  await addDoc(requestServicesCollection(db), request);
                  // Optimistically bump count; onSnapshot will reconcile
                  setOpenRequestsCount((c) => c + 1);
                  
                  setReqSuccess(`Service request submitted for ${reqDevices.length} device${reqDevices.length > 1 ? 's' : ''}.`);
                  setReqError('');
                  setReqDevices([]);
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
                    className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-2 w-full"
                  >
                    <option value="maintenance">Maintenance</option>
                    <option value="device_replacement">Device Replacement</option>
                    <option value="warranty_claim">Warranty Claim</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    Select Devices
                  </label>
                  
                  {deviceOptions.length === 0 ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      No devices available
                    </div>
                  ) : (
                    <div
                      className="space-y-2 h-48 overflow-y-auto p-1 -mx-1 rounded-md"
                      style={{
                        overscrollBehavior: 'contain',
                        WebkitOverflowScrolling: 'touch',
                        scrollbarWidth: 'thin',
                        scrollbarColor: 'rgba(156,163,175,0.6) transparent'
                      }}
                    >
                      {deviceOptions.map((device) => (
                        <label 
                          key={device}
                          className={`flex items-center p-2 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                            reqDevices.includes(device) ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={reqDevices.includes(device)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setReqDevices([...reqDevices, device]);
                              } else {
                                setReqDevices(reqDevices.filter(d => d !== device));
                              }
                            }}
                            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:ring-offset-gray-800"
                          />
                          <span className="ml-3 text-sm text-gray-700 dark:text-gray-300">
                            {device}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  
                  {reqDevices.length > 0 && (
                    <div className="mt-2">
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Selected Devices ({reqDevices.length}):
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {reqDevices.map((device) => (
                          <span 
                            key={device}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                          >
                            {device}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setReqDevices(reqDevices.filter(d => d !== device));
                              }}
                              className="ml-1.5 inline-flex items-center justify-center h-3.5 w-3.5 rounded-full text-blue-400 hover:bg-blue-200 hover:text-blue-500 dark:hover:bg-blue-800 dark:hover:text-blue-300"
                            >
                              <span className="sr-only">Remove {device}</span>
                              <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                                <path strokeLinecap="round" strokeWidth="1.5" d="M1 1l6 6m0-6L1 7" />
                              </svg>
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="reqDate" className="text-sm text-gray-700 dark:text-gray-200">Preferred Date</label>
                  <input
                    type="date"
                    id="reqDate"
                    value={reqDate}
                    min={new Date().toISOString().split('T')[0]}
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
                  disabled={hasReachedLimit || isLoading}
                  className={`px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 
                    ${hasReachedLimit || isLoading ? 'bg-teal-400 cursor-not-allowed opacity-70' : 'bg-teal-600 hover:bg-teal-700'}`}
                  title={hasReachedLimit ? 'You already have 3 open service requests.' : undefined}
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
