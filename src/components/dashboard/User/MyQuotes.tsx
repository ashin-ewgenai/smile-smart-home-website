import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/lib/useAuth';
import { quotesCollection, type QuoteItem } from '@/models/Collections';
import { Link } from 'react-router-dom';

// Lightweight fallback link if react-router isn't active in this view
const ALink: React.FC<{ href: string; children: React.ReactNode; className?: string }> = ({ href, children, className }) => (
  <a href={href} className={className}>{children}</a>
);

const MyQuotes: React.FC = () => {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<Array<{ id: string; data: QuoteItem }>>([]);
  const [subLoading, setSubLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setSubLoading(true);
    // subscribe to user's quotes
    const q = query(quotesCollection(db, user.uid), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, data: d.data() as QuoteItem }));
      setItems(list);
      setSubLoading(false);
    }, () => setSubLoading(false));
    return () => unsub();
  }, [user]);

  if (loading || subLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
        <div className="space-y-2">
          <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  if (!auth.currentUser) {
    return <div className="p-6 text-gray-700 dark:text-gray-200">Please sign in to view your quotes.</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">My Quotes</h1>
      {items.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-300">No quotes yet.</p>
      ) : (
        <ul className="divide-y divide-white/50 dark:divide-white/10 rounded-2xl overflow-hidden glass-surface shadow-soft-lg">
          {items.map(({ id, data }) => {
            const Wrapper: any = (Link as any)?.to ? Link : ALink;
            const href = `/dashboard/user/quote-details/${id}`;
            return (
              <li key={id} className="p-4 hover:bg-white/50 dark:hover:bg-white/10 transition">
                <Wrapper to={href} href={href} className="flex justify-between items-center gap-3">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">{data.area || data.location || 'Quote'}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-300">
                      Status: {data.status || 'submitted'}
                    </div>
                  </div>
                  <span className="px-3 py-1 text-xs rounded-full bg-indigo-600/90 text-white hover:bg-indigo-600 shadow-soft">View</span>
                </Wrapper>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default MyQuotes;
