import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { db, auth } from '../../../lib/firebase';
import { addDoc, collection, serverTimestamp, doc, setDoc } from 'firebase/firestore';

export type QuoteFormProps = {
  userEmail?: string | null;
  className?: string;
  onSubmitted?: (docId: string | undefined) => void;
};

const OPTIONS = [
  { value: '', label: 'Select a location', disabled: true },
  { value: 'hall', label: 'Hall' },
  { value: 'room', label: 'Room' },
  { value: 'house', label: 'House' },
  { value: 'office', label: 'Office' },
  { value: 'garden', label: 'Garden' },
  { value: 'other', label: 'Other' },
];

export default function QuoteForm({ userEmail: emailProp, className = '', onSubmitted }: QuoteFormProps) {
  const userEmail = useMemo(() => emailProp ?? (typeof window !== 'undefined' ? localStorage.getItem('userEmail') : null), [emailProp]);
  // Avoid SSR flash: only show auth-dependent messages after hydration
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  const [location, setLocation] = useState('');
  const [sqft, setSqft] = useState<string>('');
  const [area, setArea] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    const user = auth.currentUser;
    if (!user) {
      setError('You must be logged in to submit a quote.');
      return;
    }

    try {
      setSubmitting(true);
      // 1) Ensure parent doc exists at quotes/{uid}
      const parentRef = doc(db, 'quotes', user.uid);
      await setDoc(
        parentRef,
        { uid: user.uid, userEmail: user.email ?? userEmail ?? null, updatedAt: serverTimestamp() },
        { merge: true }
      );

      // 2) Add a quote into subcollection 'quote'
      const docRef = await addDoc(collection(parentRef, 'quote'), {
        uid: user.uid,
        userEmail: user.email ?? userEmail ?? null,
        location,
        sqft: sqft ? Number(sqft) : null,
        area,
        details,
        status: 'submitted',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setMessage("Request submitted! We'll get back to you shortly.");
      setLocation('');
      setSqft('');
      setArea('');
      setDetails('');
      onSubmitted?.(docRef?.id);
    } catch (err: any) {
      console.error('Failed to submit quote:', err);
      setError(err?.message || 'Failed to submit. Please try again.');
      onSubmitted?.(undefined);
    } finally {
      setSubmitting(false);
    }
  }, [location, sqft, area, details, onSubmitted, userEmail]);

  return (
    <form
      onSubmit={handleSubmit}
      className={`max-w-2xl mx-auto ${className} rounded-2xl border border-gray-200/60 dark:border-gray-700/60 bg-white/80 dark:bg-gray-800/70 backdrop-blur shadow-xl p-6 sm:p-8 transition-shadow duration-200 hover:shadow-2xl`}
    >
      {/* Header */}
      <div className="mb-6 flex items-center justify-center gap-3 text-center">
        <div>
          <h2 className="text-2xl font-semibold text-charcoal dark:text-white">Quote Portal</h2>
          <p className="text-gray-700 dark:text-gray-300">Fill the form to request a quote.</p>
        </div>
      </div>

      {hydrated && !userEmail && (
        <p className="mb-4 text-red-600 text-sm">You are not logged in. Please login to submit a quote.</p>
      )}

      <div className="space-y-5">
        <div>
          <label htmlFor="location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Your Location</label>
          <input
            id="location"
            type="text"
            required
            placeholder="e.g., Chennai"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300/70 dark:border-gray-600/60 bg-white/80 dark:bg-gray-900/40 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="sqft" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Write your sqft?</label>
          <input
            id="sqft"
            type="number"
            min={1}
            step={1}
            required
            placeholder="e.g., 1200"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300/70 dark:border-gray-600/60 bg-white/80 dark:bg-gray-900/40 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
            value={sqft}
            onChange={(e) => setSqft(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="locationType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Where do you want to automate?</label>
          <div className="relative">
            <select
              id="locationType"
              required
              className="w-full appearance-none px-4 py-2.5 rounded-xl border border-gray-300/70 dark:border-gray-700 bg-white dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 placeholder-gray-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            >
              {OPTIONS.map((opt) => (
                <option
                  key={opt.value || 'placeholder'}
                  value={opt.value}
                  disabled={!!opt.disabled}
                  className={opt.disabled ? 'text-gray-400' : 'text-black dark:text-gray-100'}
                >
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400 dark:text-gray-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" /></svg>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="details" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Details</label>
          <textarea
            id="details"
            rows={4}
            placeholder="Describe your requirement"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300/70 dark:border-gray-600/60 bg-white/80 dark:bg-gray-900/40 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-6 sm:flex sm:justify-end">
        <button
          type="submit"
          id="submit-quote-react"
          className="group cursor-pointer w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-teal-500/40 bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold shadow-lg hover:from-teal-600 hover:to-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-teal-500 transition-all duration-200 transform hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={submitting}
        >
          {/* paper-plane icon */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5">
            <path d="M22 2L11 13"></path>
            <path d="M22 2l-7 20-4-9-9-4 20-7z"></path>
          </svg>
          {submitting ? 'Submitting…' : 'Submit Request'}
        </button>
      </div>

      {message && <p className="text-green-600 mt-3">{message}</p>}
      {error && <p className="text-red-600 mt-3">{error}</p>}
    </form>
  );
}
