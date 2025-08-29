import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { quoteDoc, type QuoteItem } from '@/models/Collections';
import { useAuth } from '@/lib/useAuth';

interface Props {
  quoteId: string;
}

const Field: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div>
    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</h3>
    <p className="mt-1 text-gray-900 dark:text-white">{value ?? 'N/A'}</p>
  </div>
);

const QuoteDetails: React.FC<Props> = ({ quoteId }) => {
  const { user } = useAuth();
  const [data, setData] = useState<QuoteItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!user || !quoteId) { setLoading(false); return; }
      try {
        const ref = quoteDoc(db, user.uid, quoteId);
        const snap = await getDoc(ref as ReturnType<typeof doc>);
        if (!active) return;
        setData((snap.exists() ? (snap.data() as QuoteItem) : null));
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    return () => { active = false; };
  }, [user, quoteId]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return <div className="p-6 text-gray-700 dark:text-gray-200">Please sign in to view the quote.</div>;
  }

  if (!data) {
    return <div className="p-6 text-gray-700 dark:text-gray-200">Quote not found.</div>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Quote Details</h2>
        <div className="h-1 w-20 bg-indigo-600 rounded" />
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="Status" value={data.status || 'submitted'} />
          <Field label="Area / Location" value={data.area || data.location} />
          <Field label="Square Feet" value={data.sqft ?? 'N/A'} />
          <Field label="Created" value={data.createdAt && (data.createdAt as any).toDate ? (data.createdAt as any).toDate().toLocaleString() : 'N/A'} />
        </div>

        {data.details && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Details</h3>
            <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
              <p className="text-gray-900 dark:text-gray-200 whitespace-pre-line">{data.details}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuoteDetails;
