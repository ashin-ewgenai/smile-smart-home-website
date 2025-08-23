import React, { useCallback, useMemo, useState } from 'react';
import { db } from '../../../lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

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

    if (!userEmail) {
      setError('You must be logged in to submit a quote.');
      return;
    }

    try {
      setSubmitting(true);
      const docRef = await addDoc(collection(db, 'quotes'), {
        userEmail,
        location,
        sqft: sqft ? Number(sqft) : null,
        area,
        details,
        status: 'submitted',
        createdAt: serverTimestamp(),
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
  }, [userEmail, location, sqft, area, details, onSubmitted]);

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 max-w-xl ${className}`}>
      {!userEmail && (
        <p className="text-red-600 text-sm">You are not logged in. Please login to submit a quote.</p>
      )}

      <div>
        <label htmlFor="location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Your Location</label>
        <input
          id="location"
          type="text"
          required
          placeholder="e.g., Chennai"
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal"
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
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal"
          value={sqft}
          onChange={(e) => setSqft(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="locationType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Where do you want to automate?</label>
        <select
          id="locationType"
          required
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal"
          value={area}
          onChange={(e) => setArea(e.target.value)}
        >
          {OPTIONS.map((opt) => (
            <option key={opt.value || 'placeholder'} value={opt.value} disabled={!!opt.disabled}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="details" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Details</label>
        <textarea
          id="details"
          rows={4}
          placeholder="Describe your requirement"
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </div>

      <button
        type="submit"
        id="submit-quote-react"
        className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
        disabled={submitting}
      >
        {submitting ? 'Submitting…' : 'Submit Request'}
      </button>

      {message && <p className="text-green-600 mt-2">{message}</p>}
      {error && <p className="text-red-600 mt-2">{error}</p>}
    </form>
  );
}
