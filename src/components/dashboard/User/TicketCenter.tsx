import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ticket } from 'lucide-react';

// Firebase
import { auth, db, storage, functions } from '../../../lib/firebase';
import { addDoc, serverTimestamp, query, orderBy, onSnapshot, Timestamp, getDocs, where, updateDoc, doc, collection } from 'firebase/firestore';
import { supportTicketsCollection, supportTicketDoc } from '../../../models/Collections';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';

// Support Chat Component
import SupportChatPanel from '../../supportChat/SupportChatPanel';
import GlassCard from '../../ui/GlassCard';

// Self-contained Support Ticket Center component
// No external state or libraries; safe to drop into the dashboard

// Using Firebase Auth UID as the unique user identifier

// Types
type TicketStatus = 'Pending' | 'In Progress' | 'Resolved' | 'Cancelled';

type Ticket = {
  id: string | number;
  subject: string;
  category: 'Device Issue' | 'Connectivity' | 'Billing' | 'Other';
  description: string;
  status: TicketStatus;
  createdAt: string; // ISO string
  imageUrl?: string;
  ticketNumber?: string;
  aiPromptPending?: boolean;
};

const TicketCenter: React.FC = () => {
  // Form state
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<'Device Issue' | 'Connectivity' | 'App/Portal Issue' | 'Feature Request' | 'Installation/Setup' | 'Other'>('Device Issue');
  const [devices, setDevices] = useState<{ id: string; name: string; type?: string }[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);

  // UI state
  const [errors, setErrors] = useState<{ subject?: string; description?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [processingAI, setProcessingAI] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [toastEnter, setToastEnter] = useState<boolean>(false);

  // Tickets list (local only)
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [hasUnresolvedTicket, setHasUnresolvedTicket] = useState<boolean>(false);
  
  // View state
  const [currentView, setCurrentView] = useState<'tickets' | 'chat'>('tickets');
  const [newlyCreatedTicketId, setNewlyCreatedTicketId] = useState<string | null>(null);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [hoveredTicketId, setHoveredTicketId] = useState<string | null>(null);

  // Auth presence and dynamic user id
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userUid, setUserUid] = useState<string | null>(null);

  // Determine login state and user UID via Firebase Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setIsLoggedIn(!!u);
      setUserUid(u?.uid ?? null);
    });
    return () => unsub();
  }, []);

  // Derived: sorted tickets (most recent first)
  const sortedTickets = useMemo(() => {
    return [...tickets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [tickets]);

  // Check if user has an unresolved ticket (only Pending or In Progress)
  useEffect(() => {
    const unresolved = tickets.some(ticket => ticket.status === 'Pending' || ticket.status === 'In Progress');
    setHasUnresolvedTicket(unresolved);
  }, [tickets]);

  // Date formatter: DD MMM YYYY (e.g., 05 Jan 2025)
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));

  // Status badge helper classes (keeps native class 'status-tag')
  const statusClasses = (status: TicketStatus) => {
    const base = 'status-tag inline-flex items-center px-2 py-0.5 rounded text-xs font-medium';
    switch (status) {
      case 'Resolved':
        return `${base} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`;
      case 'In Progress':
        return `${base} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`;
      case 'Cancelled':
        return `${base} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`;
      default:
        return `${base} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`;
    }
  };

  // Find if there is an unresolved ticket with an AI response pending notification
  const pendingPromptTicket = useMemo(() => {
    return tickets.find(t => (t.status === 'Pending' || t.status === 'In Progress') && t.aiPromptPending);
  }, [tickets]);

  const viewAIResponseFromBanner = async () => {
    if (!pendingPromptTicket) return;
    try {
      // Clear the persistent prompt flag on click
      await updateDoc(supportTicketDoc(db, String(pendingPromptTicket.id)), {
        aiPromptPending: false,
        updatedAt: serverTimestamp(),
      });
    } catch {}
    // Switch view to chat for this ticket
    setNewlyCreatedTicketId(String(pendingPromptTicket.id));
    setCurrentView('chat');
  };

  // Fetch existing tickets for the user from flat collection filtered by uid
  useEffect(() => {
    setFetchError('');
    setLoading(true);
    // Only subscribe if logged in and we have a UID
    if (!isLoggedIn || !userUid) {
      setTickets([]);
      setLoading(false);
      return;
    }

    const ticketsCol = supportTicketsCollection(db);
    const q = query(ticketsCol, where('uid', '==', userUid), orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Ticket[] = snap.docs.map((d) => {
          const data = d.data() as any;
          const ts = data.createdAt as Timestamp | undefined;
          return {
            id: d.id,
            subject: data.subject,
            category: data.category,
            description: data.description,
            status: (data.status as TicketStatus) ?? 'Pending',
            createdAt: ts ? ts.toDate().toISOString() : new Date().toISOString(),
            imageUrl: data.imageUrl,
            aiPromptPending: Boolean(data.aiPromptPending),
          } as Ticket;
        });
        setTickets(list);
        setLoading(false);
      },
      (error) => {
        console.error(error);
        setFetchError(error?.message || 'Unable to load tickets');
        setLoading(false);
      }
    );

    return () => {
      unsub();
    };
  }, [isLoggedIn, userUid]);

  // Auto-hide success toast after a short delay and handle slide-in/out
  useEffect(() => {
    if (!successMsg) return;
    // start enter animation on next tick
    const raf = requestAnimationFrame(() => setToastEnter(true));
    // start exit animation slightly before removal
    const exitTimer = setTimeout(() => setToastEnter(false), 4300);
    // remove from DOM after exit animation
    const removeTimer = setTimeout(() => setSuccessMsg(''), 4600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
      setToastEnter(false);
    };
  }, [successMsg]);

  // Basic client-side validation
  const validate = () => {
    const newErrors: { subject?: string; description?: string } = {};
    if (!subject.trim()) newErrors.subject = 'Subject is required';
    if (!description.trim()) newErrors.description = 'Description is required';
    setErrors(Object.keys(newErrors).length ? newErrors : null);
    return Object.keys(newErrors).length === 0;
  };

  // Fetch user devices if 'Device Issue' is selected and userUid is present
  useEffect(() => {
    if (category === 'Device Issue' && userUid) {
      const fetchDevices = async () => {
        try {
          const q = query(collection(db, 'User_Devices'), where('uid', '==', userUid));
          const snap = await getDocs(q);
          const devs = snap.docs.map(d => ({
            id: d.id,
            name: (d.data() as any).deviceName || (d.data() as any).name || 'Unnamed Device',
            type: (d.data() as any).deviceType || (d.data() as any).type || ''
          }));
          setDevices(devs);
        } catch {
          setDevices([]);
        }
      };
      fetchDevices();
    } else {
      setDevices([]);
      setSelectedDeviceId('');
    }
  }, [category, userUid]);

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    // Check if user already has an unresolved ticket
    if (hasUnresolvedTicket) {
      setFetchError('You already have an unresolved ticket. Please wait for it to be resolved or cancel it before raising a new one.');
      return;
    }

    setSubmitting(true);
    try {
      if (!userUid) {
        setFetchError('You must be logged in to raise a ticket.');
        return;
      }
      // Optional image upload to Firebase Storage
      let uploadedImageUrl: string | undefined;
      if (imageFile) {
        const path = `supportTickets/${userUid}/${Date.now()}_${imageFile.name}`;
        const ref = storageRef(storage, path);
        await uploadBytes(ref, imageFile);
        uploadedImageUrl = await getDownloadURL(ref);
      }

      // Generate ticket number client-side
      const currentYear = new Date().getFullYear();
      const timestamp = Date.now();
      const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const ticketNumber = `SMH-${currentYear}-${timestamp.toString().slice(-3)}${randomSuffix.slice(-2)}`;
      
      // Create ticket with generated number
      const payload: any = {
        uid: userUid,
        ticketNumber,
        subject: subject.trim(),
        category,
        description: description.trim(),
        status: 'Pending',
        priority: 'medium',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        aiPromptPending: true,
      };
      if (uploadedImageUrl) payload.imageUrl = uploadedImageUrl;
      if (category === 'Device Issue' && selectedDeviceId) payload.deviceId = selectedDeviceId;
      
      const ticketRef = await addDoc(supportTicketsCollection(db), payload);
      const ticketId = ticketRef.id;

      // Do not call OpenAI immediately. Inform user and allow chat to analyze on demand.
      setSuccessMsg(`Ticket ${ticketNumber} created successfully! Check Support Chat to view analysis.`);
      // Prepare to show chat for this ticket
      setNewlyCreatedTicketId(ticketId);

      // Clear form
      setSubject('');
      setCategory('Device Issue');
      setDescription('');
      setImageFile(null);
      setErrors(null);
    } catch (e) {
      // Surface minimal error state in form-level message via fetchError slot
      console.error(e);
      setFetchError('Failed to raise ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel ticket function
  const cancelTicket = async (ticketId: string) => {
    try {
      if (!userUid) {
        setFetchError('You must be logged in to cancel a ticket.');
        return;
      }
      
      const ticketRef = supportTicketDoc(db, ticketId);
      await updateDoc(ticketRef, {
        status: 'Cancelled',
        updatedAt: serverTimestamp(),
      });
      
      setSuccessMsg('Ticket cancelled successfully');
    } catch (e) {
      console.error(e);
      setFetchError((e as any)?.message || 'Unable to cancel ticket');
    }
  };

  // Check if we should show chat view (for direct ticket links)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ticketId = urlParams.get('ticketId');
    
    // If there's a ticketId in the URL and we're on the tickets page, 
    // switch to chat view
    if (ticketId && window.location.pathname.includes('support-tickets')) {
      setNewlyCreatedTicketId(ticketId);
      setCurrentView('chat');
    }
  }, []);

  // If not logged in or no UID, render nothing (keeps dashboard clean for guests)
  if (!isLoggedIn || !userUid) return null;

  return (
    <>
      {/* Success toast */}
      {successMsg && (
        <div
          className={`fixed top-6 right-6 z-[70] flex items-center gap-3 rounded-md bg-green-600 text-white shadow-lg px-4 py-3 transform transition-all duration-300 ease-out will-change-transform will-change-opacity ${toastEnter ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
          role="status"
          aria-live="polite"
        >
          {/* Check icon */}
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <div className="flex-1">
            <span className="text-sm font-medium block">{successMsg}</span>
          </div>
          {(successMsg.includes('AI response generated') || successMsg.includes('Check Support Chat')) && newlyCreatedTicketId && (
            <button
              onClick={() => setCurrentView('chat')}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded text-xs font-medium transition-colors"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              View AI Response
            </button>
          )}
        </div>
      )}

      <GlassCard className="p-0 overflow-hidden transition-all duration-300 hover:shadow-xl">
      <div className="px-4 py-4 sm:px-6 bg-gradient-to-r from-teal-50/30 to-blue-50/30 dark:from-teal-900/10 dark:to-blue-900/10">
        <div className="flex items-center justify-between">
          <div className="group">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              Support Tickets 
              <Ticket className="h-5 w-5 text-teal-500 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Raise a complaint and track its status</p>
          </div>
          {currentView === 'chat' && newlyCreatedTicketId && (
            <button
              onClick={() => setCurrentView('tickets')}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-gradient-to-r from-gray-100 to-gray-50 text-gray-800 hover:from-gray-200 hover:to-gray-100 dark:from-gray-700 dark:to-gray-800 dark:text-gray-200 dark:hover:from-gray-600 dark:hover:to-gray-700 text-sm font-medium transition-all duration-200 shadow-sm hover:shadow-md transform hover:-translate-x-1"
            >
              <svg className="h-4 w-4 mr-1.5 transition-transform duration-200 group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Tickets
            </button>
          )}
        </div>
      </div>

      {/* Content: Either ticket form or support chat */}
      <div className="px-4 pb-4 sm:px-6">
        {currentView === 'tickets' ? (
          <>
            {hasUnresolvedTicket ? (
              <div className="mb-4 p-4 rounded-xl bg-amber-50/70 border border-amber-200/70 dark:bg-amber-900/20 dark:border-amber-800/40 animate-pulse-slow shadow-lg">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-amber-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">Unresolved Ticket</h3>
                </div>
                <div className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                  <p>You already have an unresolved support ticket. Use Support Chat to get help resolving it, or cancel it to raise a new one.</p>
                  {pendingPromptTicket && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">AI response ready</span>
                      <button
                        onClick={viewAIResponseFromBanner}
                        className="inline-flex items-center px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-all duration-200 hover:scale-105 hover:shadow-lg active:scale-95"
                      >
                        <svg className="h-3 w-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        View AI Response
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                {fetchError && (
                  <div className="mb-3 p-3 rounded-xl bg-red-100/80 text-red-800 dark:bg-red-900/30 dark:text-red-200 border border-red-300 dark:border-red-800 animate-shake">
                    <div className="flex items-center gap-2">
                      <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{fetchError}</span>
                    </div>
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="form-group">
                    <label htmlFor="ticket-subject" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Subject
                    </label>
                    <input
                      id="ticket-subject"
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full pill-input transition-all duration-200 focus:ring-2 focus:ring-teal-500 focus:scale-[1.01]"
                      placeholder="Brief summary of the issue"
                      required
                    />
                    {errors?.subject && <p className="mt-1 text-xs text-red-600">{errors.subject}</p>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="ticket-category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Category
                    </label>
                    <select
                      id="ticket-category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value as 'Device Issue' | 'Connectivity' | 'Other')}
                      className="w-full pill-input transition-all duration-200 focus:ring-2 focus:ring-teal-500 cursor-pointer"
                      required
                    >
                      <option>Device Issue</option>
                      <option>Connectivity</option>
                      <option>Other</option>
                    </select>
                  </div>

                  {category === 'Device Issue' && devices.length > 0 && (
                    <div className="form-group">
                      <label htmlFor="ticket-device" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Device
                      </label>
                      <select
                        id="ticket-device"
                        value={selectedDeviceId}
                        onChange={e => setSelectedDeviceId(e.target.value)}
                        className="w-full pill-input transition-all duration-200 focus:ring-2 focus:ring-teal-500 cursor-pointer"
                        required
                      >
                        <option value="" disabled>Select your device</option>
                        {devices.map(device => (
                          <option key={device.id} value={device.id}>{device.name}{device.type ? ` (${device.type})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="form-group">
                    <label htmlFor="ticket-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description
                    </label>
                    <textarea
                      id="ticket-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      className="w-full pill-textarea transition-all duration-200 focus:ring-2 focus:ring-teal-500 focus:scale-[1.01]"
                      placeholder="Describe the problem in detail"
                      required
                    />
                    {errors?.description && <p className="mt-1 text-xs text-red-600">{errors.description}</p>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="ticket-image" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Optional image
                    </label>
                    <input
                      id="ticket-image"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setImageFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                      className="block w-full text-sm text-gray-900 dark:text-gray-200 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
                    />
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={submitting || processingAI}
                      className="inline-flex items-center px-6 py-2.5 rounded-full bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white font-medium border-2 border-teal-700 hover:border-teal-800 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 active:scale-95 disabled:hover:scale-100"
                    >
                      {submitting && (
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                      {submitting ? 'Creating Ticket…' : processingAI ? 'Preparing AI Response…' : 'Raise Ticket'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </>
        ) : (
          <div className="-mx-4 -mb-4 sm:-mx-6 sm:-mb-6">
            {newlyCreatedTicketId && (
              <SupportChatPanel 
                ticketId={newlyCreatedTicketId} 
                raiseTicketsHref="/dashboard/user/support-tickets" 
              />
            )}
          </div>
        )}
      </div>

      {/* Tickets list */}
      {currentView === 'tickets' && (
        <div className="px-4 pb-5 sm:px-6 border-t border-white/50 dark:border-white/10 bg-gradient-to-b from-transparent to-gray-50/30 dark:to-gray-900/20">
          <div className="flex items-center justify-between mb-3 pt-4">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Your Tickets</h3>
            {sortedTickets.length > 0 && (
              <span className="px-2 py-1 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-xs font-medium rounded-full">
                {sortedTickets.length} {sortedTickets.length === 1 ? 'ticket' : 'tickets'}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <svg className="animate-spin h-8 w-8 text-teal-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="ml-3 text-sm text-gray-600 dark:text-gray-400">Loading tickets…</span>
            </div>
          ) : sortedTickets.length === 0 ? (
            <div className="text-center py-8 px-4">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm text-gray-600 dark:text-gray-400">No tickets yet. Raise your first one above.</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/50 dark:divide-white/10 space-y-1">
              {sortedTickets.map((t, index) => (
                <li
                  key={t.id}
                  className={`py-3 transition-all duration-200 hover:bg-white/50 dark:hover:bg-gray-800/30 rounded-lg px-2 -mx-2 ${expandedTicketId === t.id.toString() ? 'bg-white/50 dark:bg-gray-800/30' : ''}`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 pr-4 flex-1 cursor-pointer group">
                      <div className="flex items-center gap-2 mb-1 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                        <span className="px-2.5 py-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-xs font-mono rounded-full font-semibold shadow-md transition-all duration-200">
                          #{t.ticketNumber || t.id.toString().slice(-6).toUpperCase()}
                        </span>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {t.subject}
                        </p>
                        <svg
                          className={`h-4 w-4 text-gray-400 transition-transform duration-200 ml-auto ${expandedTicketId === t.id.toString() ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                      <div className="mt-1 grid grid-cols-3 gap-2 w-full">
                        <span className="inline-flex items-center justify-center px-2 py-1 rounded-full bg-gradient-to-r from-gray-100 to-gray-50 text-gray-800 dark:from-gray-700 dark:to-gray-800 dark:text-gray-200 font-medium shadow-sm text-xs whitespace-nowrap">
                          {t.category}
                        </span>
                        <div className="flex justify-center">
                          <span className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium ${statusClasses(t.status).replace('shadow-sm', '')} shadow-sm transition-all duration-200 hover:scale-105 whitespace-nowrap`}>
                            {t.status}
                          </span>
                        </div>
                        <div className="flex justify-end">
                          <span className="text-gray-500 bg-gray-100 dark:bg-gray-800/50 px-2 py-1 rounded-full inline-flex items-center gap-1 text-xs whitespace-nowrap">
                            <svg className="h-3 w-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {formatDate(t.createdAt)}
                          </span>
                        </div>
                      </div>
                      
                      {/* Expanded Details */}
                      {expandedTicketId === t.id.toString() && (
                        <div className="mt-3 p-3 bg-gray-50/80 dark:bg-gray-800/50 rounded-lg border border-white/50 dark:border-white/10 animate-slideDown">
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{t.description}</p>
                        </div>
                      )}
                      {t.imageUrl && (
                        <div className="mt-2">
                          <img 
                            src={t.imageUrl} 
                            alt="attachment" 
                            className="h-20 w-20 object-cover rounded-lg border-2 border-gray-200 dark:border-gray-700 shadow-md hover:scale-150 transition-transform duration-300 cursor-zoom-in" 
                          />
                        </div>
                      )}
                    </div>
                    <div className="ml-2 flex-shrink-0 flex gap-2">
                      {/* Only show actions for active tickets */}
                      {(t.status === 'Pending' || t.status === 'In Progress') && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelTicket(t.id.toString());
                            }}
                            className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-gradient-to-r from-red-100 to-red-50 text-red-800 hover:from-red-200 hover:to-red-100 dark:from-red-900/30 dark:to-red-900/20 dark:text-red-200 dark:hover:from-red-900/50 dark:hover:to-red-900/40 transition-all duration-200 shadow-sm hover:shadow-md transform hover:scale-105 active:scale-95"
                          >
                            <svg className="h-3 w-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </GlassCard>
    </>
  );
};

export default TicketCenter;
