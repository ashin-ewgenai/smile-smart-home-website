import React, { useEffect, useState } from 'react';
import { doc, getDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { quoteDoc, type QuoteItem, estimationQuoteDoc, estimationQuotesCollection, type EstimationQuote } from '@/models/Collections';
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
  const [estimation, setEstimation] = useState<EstimationQuote | null>(null);
  const [estLoading, setEstLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!user || !quoteId) { setLoading(false); return; }
      try {
        const ref = quoteDoc(db, user.uid, quoteId);
        const snap = await getDoc(ref as ReturnType<typeof doc>);
        if (!active) return;
        if (snap.exists()) {
          setData(snap.data() as QuoteItem);
        } else {
          // Fallback: look in root 'quotes' collection (legacy path used by QuoteForm list)
          try {
            const rootSnap = await getDoc(doc(db, 'quotes', quoteId));
            if (!active) return;
            setData(rootSnap.exists() ? (rootSnap.data() as any as QuoteItem) : null);
          } catch {
            setData(null);
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    return () => { active = false; };
  }, [user, quoteId]);

  // Fetch admin-created estimation quote linked to this quote
  useEffect(() => {
    let active = true;
    const fetchEstimation = async () => {
      if (!user) return;
      if (!data) { setEstimation(null); return; }
      setEstLoading(true);
      try {
        // 1) If the user quote stores a direct reference to estimation
        if (data.estimationQuoteId) {
          const esnap = await getDoc(estimationQuoteDoc(db, data.estimationQuoteId));
          if (!active) return;
          if (esnap.exists()) { setEstimation(esnap.data() as EstimationQuote); return; }
        }

        // 2) Fallback: try by originalQuoteId matching this quoteId
        try {
          const q1 = query(
            estimationQuotesCollection(db),
            where('originalQuoteId', '==', quoteId),
            limit(1)
          );
          const r1 = await getDocs(q1);
          if (!active) return;
          if (!r1.empty) { setEstimation(r1.docs[0].data() as EstimationQuote); return; }
        } catch {}

        // 3) Fallback: try by customerEmail if available
        if ((data as any).userEmail) {
          try {
            const q2 = query(
              estimationQuotesCollection(db),
              where('customerEmail', '==', (data as any).userEmail),
              limit(1)
            );
            const r2 = await getDocs(q2);
            if (!active) return;
            if (!r2.empty) { setEstimation(r2.docs[0].data() as EstimationQuote); return; }
          } catch {}
        }

        setEstimation(null);
      } finally {
        if (active) setEstLoading(false);
      }
    };
    fetchEstimation();
    return () => { active = false; };
  }, [db, data, quoteId, user]);

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

        {/* Estimation Quote Section */}
        <div className="mt-8">
          <div className="mb-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Admin Estimation</h3>
            <div className="h-1 w-16 bg-indigo-500 rounded mt-1" />
          </div>

          {estLoading && (
            <div className="text-gray-600 dark:text-gray-300">Loading estimation...</div>
          )}

          {!estLoading && !estimation && (
            <div className="text-gray-600 dark:text-gray-300">No estimation available yet.</div>
          )}

          {!estLoading && estimation && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Estimation ID" value={(estimation as any).quoteId} />
                <Field label="Status" value={estimation.status} />
                <Field label="Issue Date" value={(estimation.issueDate as any)?.toDate ? (estimation.issueDate as any).toDate().toLocaleDateString() : (typeof estimation.issueDate === 'string' ? estimation.issueDate : 'N/A')} />
                <Field label="Grand Total" value={estimation.grandTotal?.toFixed ? `₹ ${estimation.grandTotal.toFixed(2)}` : estimation.grandTotal} />
              </div>

              {Array.isArray(estimation.items) && estimation.items.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Line Items</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 dark:text-gray-300">
                          <th className="py-2 pr-4">Item</th>
                          <th className="py-2 pr-4 hidden md:table-cell">Description</th>
                          <th className="py-2 pr-4">Qty</th>
                          <th className="py-2 pr-4">Unit</th>
                          <th className="py-2 pr-4 hidden lg:table-cell">Discount</th>
                          <th className="py-2 pr-4 hidden lg:table-cell">Tax %</th>
                          <th className="py-2">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {estimation.items.map((it) => {
                          const line = Math.max(0, (it.quantity || 0) * (it.unitPrice || 0) - (it.discount || 0));
                          const tax = (line * (it.taxPercent || 0)) / 100;
                          const total = line + tax;
                          return (
                            <tr key={it.id} className="text-gray-900 dark:text-gray-100">
                              <td className="py-2 pr-4">{it.name}</td>
                              <td className="py-2 pr-4 hidden md:table-cell">{it.description}</td>
                              <td className="py-2 pr-4">{it.quantity}</td>
                              <td className="py-2 pr-4">{it.unitPrice}</td>
                              <td className="py-2 pr-4 hidden lg:table-cell">{it.discount}</td>
                              <td className="py-2 pr-4 hidden lg:table-cell">{it.taxPercent}</td>
                              <td className="py-2">{total.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Subtotal" value={estimation.subtotal?.toFixed ? `₹ ${estimation.subtotal.toFixed(2)}` : estimation.subtotal} />
                <Field label="Taxes" value={estimation.taxes?.toFixed ? `₹ ${estimation.taxes.toFixed(2)}` : estimation.taxes} />
                <Field label="Shipping Charges" value={estimation.shippingCharges} />
                <Field label="Installation Charges" value={estimation.installationCharges} />
                <Field label="Overall Discount" value={estimation.overallDiscount} />
              </div>

              {(estimation.paymentTerms || estimation.warranty || estimation.deliveryTimeline || estimation.notes) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Payment Terms" value={estimation.paymentTerms} />
                  <Field label="Warranty" value={estimation.warranty} />
                  <Field label="Delivery Timeline" value={estimation.deliveryTimeline} />
                  {estimation.notes && (
                    <div className="md:col-span-2">
                      <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Notes</h4>
                      <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded text-gray-900 dark:text-gray-100 whitespace-pre-line">{estimation.notes}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Attachments */}
              {(() => {
                const raw = (estimation as any)?.attachments as any;
                const list: string[] = Array.isArray(raw)
                  ? raw.filter((u) => typeof u === 'string' && u.trim().length > 0)
                  : (typeof raw === 'string' && raw.trim().length > 0)
                    ? [raw]
                    : [];
                return list.length > 0 ? (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Attachments</h4>
                    <ul className="space-y-2">
                      {list.map((url, idx) => {
                        const name = (() => {
                          try {
                            const u = new URL(url);
                            const last = u.pathname.split('/').pop() || '';
                            return decodeURIComponent(last) || `Attachment ${idx + 1}`;
                          } catch {
                            const last = url.split('?')[0].split('#')[0].split('/').pop() || '';
                            return last || `Attachment ${idx + 1}`;
                          }
                        })();
                        return (
                          <li key={idx} className="flex items-center justify-between gap-3 p-2 rounded bg-gray-50 dark:bg-gray-700/50">
                            <div className="flex items-center gap-2 min-w-0">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66L9.88 18.05a2 2 0 01-2.83-2.83l8.49-8.49" />
                              </svg>
                              <span className="truncate text-sm text-gray-900 dark:text-gray-100" title={name}>{name}</span>
                            </div>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 px-2 py-1 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-500"
                            >
                              View
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null;
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuoteDetails;
