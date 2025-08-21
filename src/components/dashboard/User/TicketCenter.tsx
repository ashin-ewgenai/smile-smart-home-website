import React, { useEffect, useMemo, useState } from 'react';

// Firebase
import { db, storage } from '../../../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

// Self-contained Support Ticket Center component
// No external state or libraries; safe to drop into the dashboard

// Default dummy user id as per requirement (used if app doesn't store one)
const FALLBACK_USER_ID = 12345;

// Types
type TicketStatus = 'Pending' | 'In Progress' | 'Resolved';

type Ticket = {
  id: string | number;
  subject: string;
  category: 'Device Issue' | 'Connectivity' | 'Billing' | 'Other';
  description: string;
  status: TicketStatus;
  createdAt: string; // ISO string
  imageUrl?: string;
};

const TicketCenter: React.FC = () => {
  // Form state
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<'Device Issue' | 'Connectivity' | 'Billing' | 'Other'>('Device Issue');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);

  // UI state
  const [errors, setErrors] = useState<{ subject?: string; description?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string>('');

  // Tickets list (local only)
  const [tickets, setTickets] = useState<Ticket[]>([]);

  // Auth presence and dynamic user id
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userId, setUserId] = useState<number>(FALLBACK_USER_ID);

  // Determine login state and user id from localStorage
  useEffect(() => {
    const email = localStorage.getItem('userEmail');
    setIsLoggedIn(!!email);

    // If your app stores a userId in localStorage, use it; otherwise fallback
    const storedUserId = localStorage.getItem('userId');
    const parsed = storedUserId ? parseInt(storedUserId, 10) : NaN;
    setUserId(Number.isFinite(parsed) ? parsed : FALLBACK_USER_ID);
  }, []);

  // Derived: sorted tickets (most recent first)
  const sortedTickets = useMemo(() => {
    return [...tickets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
      default:
        return `${base} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`;
    }
  };

  // Fetch existing tickets for the user
  useEffect(() => {
    setFetchError('');
    setLoading(true);
    // Only subscribe if logged in
    if (!isLoggedIn) {
      setTickets([]);
      setLoading(false);
      return;
    }

    const ticketsCol = collection(db, 'tickets');
    const q = query(
      ticketsCol,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

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
  }, [isLoggedIn, userId]);

  // Basic client-side validation
  const validate = () => {
    const newErrors: { subject?: string; description?: string } = {};
    if (!subject.trim()) newErrors.subject = 'Subject is required';
    if (!description.trim()) newErrors.description = 'Description is required';
    setErrors(Object.keys(newErrors).length ? newErrors : null);
    return Object.keys(newErrors).length === 0;
  };

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      // Optional image upload to Firebase Storage
      let uploadedImageUrl: string | undefined;
      if (imageFile) {
        const path = `tickets/${userId}/${Date.now()}_${imageFile.name}`;
        const ref = storageRef(storage, path);
        await uploadBytes(ref, imageFile);
        uploadedImageUrl = await getDownloadURL(ref);
      }

      // Create the ticket document in Firestore
      await addDoc(collection(db, 'tickets'), {
        subject: subject.trim(),
        category,
        description: description.trim(),
        userId,
        status: 'Pending',
        createdAt: serverTimestamp(),
        imageUrl: uploadedImageUrl || null,
      });

      // Clear form
      setSubject('');
      setCategory('Device Issue');
      setDescription('');
      setImageFile(null);
      setErrors(null);
    } catch (e) {
      // Surface minimal error state in form-level message via fetchError slot
      console.error(e);
      setFetchError((e as any)?.message || 'Unable to raise ticket');
    } finally {
      setSubmitting(false);
    }
  };

  // If not logged in, render nothing (keeps dashboard clean for guests)
  if (!isLoggedIn) return null;

  return (
    <section className="dashboard-card bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
      <div className="px-4 py-4 sm:px-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Support Tickets</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">Raise a complaint and track its status</p>
      </div>

      {/* Form: Raise new ticket */}
      <div className="px-4 pb-4 sm:px-6">
        {fetchError && (
          <div className="mb-3 p-3 rounded bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
            {fetchError}
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
              className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
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
              onChange={(e) => setCategory(e.target.value as Ticket['category'])}
              className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              required
            >
              <option>Device Issue</option>
              <option>Connectivity</option>
              <option>Billing</option>
              <option>Other</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="ticket-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              id="ticket-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
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
              className="block w-full text-sm text-gray-900 dark:text-gray-200 file:mr-4 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center px-5 py-2 rounded bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-medium"
            >
              {submitting ? 'Submitting…' : 'Raise Ticket'}
            </button>
          </div>
        </form>
      </div>

      {/* Tickets list */}
      <div className="px-4 pb-5 sm:px-6 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Your Tickets</h3>

        {loading ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading tickets…</p>
        ) : sortedTickets.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">No tickets yet. Raise your first one above.</p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {sortedTickets.map((t) => (
              <li key={t.id} className="py-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 pr-4">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{t.subject}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                        {t.category}
                      </span>
                      <span className={statusClasses(t.status)}>{t.status}</span>
                      <span className="text-gray-500">{formatDate(t.createdAt)}</span>
                    </div>
                    {t.imageUrl && (
                      <div className="mt-2">
                        <img src={t.imageUrl} alt="attachment" className="h-16 w-16 object-cover rounded border border-gray-200 dark:border-gray-700" />
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default TicketCenter;
