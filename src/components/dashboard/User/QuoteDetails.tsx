import React, { useEffect, useState } from 'react';
import { doc, getDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { quoteDoc, type QuoteItem, estimationQuoteDoc, estimationQuotesCollection, type EstimationQuote } from '@/models/Collections';
import { useAuth } from '@/lib/useAuth';

interface Props {
  quoteId: string;
}

type FieldValue = string | number | null | undefined;

const Field: React.FC<{ label: string; value?: FieldValue }> = ({ label, value }) => {
  const display = value !== null && value !== undefined && value !== '' ? value : 'N/A';
  return (
    <div>
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</h3>
      <p className="mt-1 text-gray-900 dark:text-white">{display}</p>
    </div>
  );
};

const formatCurrency = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
    } catch {
      return `₹ ${value.toFixed(2)}`;
    }
  }
  if (typeof value === 'string') {
    return value.trim().length > 0 ? value : 'N/A';
  }
  if (value == null) {
    return 'N/A';
  }
  return String(value);
};

const formatDateTime = (value: unknown): string => {
  if (!value) return 'N/A';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as any).toDate === 'function') {
    try {
      return (value as any).toDate().toLocaleString();
    } catch {
      return 'N/A';
    }
  }
  return String(value);
};

type EstimationQuoteWithId = EstimationQuote & { id?: string };

const QuoteDetails: React.FC<Props> = ({ quoteId }) => {
  const { user } = useAuth();
  const [data, setData] = useState<QuoteItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [estimation, setEstimation] = useState<EstimationQuoteWithId | null>(null);
  const [estLoading, setEstLoading] = useState(false);

  const isEstimationForQuote = React.useCallback((est: Partial<EstimationQuote> | null | undefined, docId?: string, expectedId?: string) => {
    if (!est) return false;
    if (expectedId && (docId === expectedId || est.quoteId === expectedId)) return true;
    if (est.originalQuoteId && est.originalQuoteId === quoteId) return true;
    if (est.quoteId && est.quoteId === quoteId) return true;
    return false;
  }, [quoteId]);

  // Handle wheel events for scrollable content
  const onContentWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // Do NOT call preventDefault to avoid passive listener issues
    el.scrollTop += e.deltaY;
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!quoteId) { setLoading(false); return; }
      try {
        let fetched: QuoteItem | null = null;
        if (user?.uid) {
          try {
            const ref = quoteDoc(db, user.uid, quoteId);
            const snap = await getDoc(ref as ReturnType<typeof doc>);
            if (!active) return;
            if (snap.exists()) {
              fetched = snap.data() as QuoteItem;
            }
          } catch {}
        }

        if (!fetched) {
          try {
            const rootSnap = await getDoc(doc(db, 'quotes', quoteId));
            if (!active) return;
            if (rootSnap.exists()) {
              fetched = rootSnap.data() as any as QuoteItem;
            }
          } catch {}
        }

        if (!active) return;
        setData(fetched);
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
      if (!user) {
        console.log('[QuoteDetails] No authenticated user; estimation fetch skipped', { quoteId });
      }
      if (!data) {
        console.log('[QuoteDetails] No quote data; skipping estimation fetch', { quoteId });
        setEstimation(null);
        return;
      }
      setEstimation(null);
      setEstLoading(true);
      try {
        console.log('[QuoteDetails] Fetching estimation for quote', { quoteId, estimationQuoteId: data.estimationQuoteId, data, user: user?.uid });
        // 1) If the user quote stores a direct reference to estimation
        if (data.estimationQuoteId) {
          const esnap = await getDoc(estimationQuoteDoc(db, data.estimationQuoteId));
          if (!active) return;
          if (esnap.exists()) {
            console.log('[QuoteDetails] Estimation found via direct estimationQuoteId');
            const payload = esnap.data() as EstimationQuote;
            if (isEstimationForQuote(payload, esnap.id, data.estimationQuoteId)) {
              setEstimation({ id: esnap.id, ...payload });
              return;
            }
          }
          console.log('[QuoteDetails] No estimation via estimationQuoteId');
        }

        // 2) Fallback: direct lookup by quoteId (documents stored at /Estimation_Quote/{quoteId})
        try {
          const directSnap = await getDoc(estimationQuoteDoc(db, quoteId));
          if (!active) return;
          if (directSnap.exists()) {
            console.log('[QuoteDetails] Estimation found via direct document id Estimation_Quote');
            const payload = directSnap.data() as EstimationQuote;
            if (isEstimationForQuote(payload, directSnap.id, data.estimationQuoteId)) {
              setEstimation({ id: directSnap.id, ...payload });
              return;
            }
          }
        } catch (err) {
          console.warn('[QuoteDetails] Error fetching direct estimation doc', err);
        }

        // 3) Fallback: query by quoteId field
        try {
          const qExact = query(
            estimationQuotesCollection(db),
            where('quoteId', '==', quoteId),
            limit(1)
          );
          const rExact = await getDocs(qExact);
          if (!active) return;
          if (!rExact.empty) {
            console.log('[QuoteDetails] Estimation found via quoteId field in Estimation_Quote');
            const docSnap = rExact.docs[0];
            const payload = docSnap.data() as EstimationQuote;
            if (isEstimationForQuote(payload, docSnap.id, data.estimationQuoteId)) {
              setEstimation({ id: docSnap.id, ...payload });
              return;
            }
          }
        } catch (err) {
          console.warn('[QuoteDetails] Error querying estimationQuotesCollection by quoteId', err);
        }

        // 4) Fallback: try by originalQuoteId matching this quoteId
        try {
          const q1 = query(
            estimationQuotesCollection(db),
            where('originalQuoteId', '==', quoteId),
            limit(1)
          );
          const r1 = await getDocs(q1);
          if (!active) return;
          if (!r1.empty) {
            console.log('[QuoteDetails] Estimation found via originalQuoteId in Estimation_Quote');
            const docSnap = r1.docs[0];
            const payload = docSnap.data() as EstimationQuote;
            if (isEstimationForQuote(payload, docSnap.id, data.estimationQuoteId)) {
              setEstimation({ id: docSnap.id, ...payload });
              return;
            }
          }
        } catch (err) {
          console.warn('[QuoteDetails] Error querying estimationQuotesCollection by originalQuoteId', err);
        }

        // 5) Fallback: try by customerEmail if available
        const email = (data as any).userEmail || (data as any).customerEmail;
        if (email) {
          try {
            const q2 = query(
              estimationQuotesCollection(db),
              where('customerEmail', '==', email),
              limit(5)
            );
            const r2 = await getDocs(q2);
            if (!active) return;
            for (const docSnap of r2.docs) {
              const payload = docSnap.data() as EstimationQuote;
              if (isEstimationForQuote(payload, docSnap.id, data.estimationQuoteId)) {
                console.log('[QuoteDetails] Estimation found via customerEmail in Estimation_Quote');
                setEstimation({ id: docSnap.id, ...payload });
                return;
              }
            }
          } catch (err) {
            console.warn('[QuoteDetails] Error querying estimationQuotesCollection by customerEmail', err);
          }
        }

        // 6) Fallback: match by customer UID if available
        const customerUid = (data as any).userUid || (data as any).uid;
        if (customerUid) {
          try {
            const q3 = query(
              estimationQuotesCollection(db),
              where('uid', '==', customerUid),
              limit(5)
            );
            const r3 = await getDocs(q3);
            if (!active) return;
            for (const docSnap of r3.docs) {
              const payload = docSnap.data() as EstimationQuote;
              if (isEstimationForQuote(payload, docSnap.id, data.estimationQuoteId)) {
                console.log('[QuoteDetails] Estimation found via uid in Estimation_Quote');
                setEstimation({ id: docSnap.id, ...payload });
                return;
              }
            }
          } catch (err) {
            console.warn('[QuoteDetails] Error querying estimationQuotesCollection by uid', err);
          }
        }

        console.debug('[QuoteDetails] No estimation found after all fallbacks');
        setEstimation(null);
      } finally {
        if (active) setEstLoading(false);
      }
    };
    fetchEstimation();
    return () => { active = false; };
  }, [data, quoteId, user, isEstimationForQuote]);

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
    <div 
      className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 max-h-[80vh] overflow-y-auto custom-scrollbar"
      onWheel={onContentWheel}
      onWheelCapture={onContentWheel}
      tabIndex={0}
    >
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
                <Field label="Estimation Doc ID" value={estimation.id || 'N/A'} />
                <Field label="Estimation Ref" value={(estimation as any).quoteId || 'N/A'} />
                <Field label="Status" value={estimation.status} />
                <Field label="Customer Email" value={estimation.customerEmail} />
                <Field label="Original Quote ID" value={estimation.originalQuoteId || 'N/A'} />
                <Field label="Issue Date" value={formatDateTime(estimation.issueDate)} />
                <Field label="Expiry Date" value={formatDateTime(estimation.expiryDate)} />
                <Field label="Grand Total" value={formatCurrency(estimation.grandTotal)} />
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
                              <td className="py-2 pr-4">{formatCurrency(it.unitPrice)}</td>
                              <td className="py-2 pr-4 hidden lg:table-cell">{formatCurrency(it.discount)}</td>
                              <td className="py-2 pr-4 hidden lg:table-cell">{it.taxPercent}</td>
                              <td className="py-2">{formatCurrency(total)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Subtotal" value={formatCurrency(estimation.subtotal)} />
                <Field label="Taxes" value={formatCurrency(estimation.taxes)} />
                <Field label="Shipping Charges" value={formatCurrency(estimation.shippingCharges)} />
                <Field label="Installation Charges" value={formatCurrency(estimation.installationCharges)} />
                <Field label="Overall Discount" value={formatCurrency(estimation.overallDiscount)} />
                <Field label="Tax Type" value={estimation.taxType || 'N/A'} />
                <Field label="Tax Percent" value={typeof estimation.taxPercent === 'number' ? `${estimation.taxPercent}%` : 'N/A'} />
                <Field label="Created At" value={formatDateTime(estimation.createdAt)} />
                <Field label="Updated At" value={formatDateTime(estimation.updatedAt)} />
                <Field label="Created By Email" value={estimation.createdByEmail || 'N/A'} />
                <Field label="Created By UID" value={estimation.createdByUid || 'N/A'} />
              </div>

              {Array.isArray(estimation.taxBreakdown) && estimation.taxBreakdown.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Tax Breakdown</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 dark:text-gray-300">
                          <th className="py-2 pr-4">Name</th>
                          <th className="py-2 pr-4">Percent</th>
                          <th className="py-2">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {estimation.taxBreakdown.map((entry, idx) => (
                          <tr key={idx} className="text-gray-900 dark:text-gray-100">
                            <td className="py-2 pr-4">{(entry as any).name || (entry as any).taxType || `Tax ${idx + 1}`}</td>
                            <td className="py-2 pr-4">{typeof (entry as any).percent === 'number' ? `${(entry as any).percent}%` : typeof (entry as any).taxPercent === 'number' ? `${(entry as any).taxPercent}%` : 'N/A'}</td>
                            <td className="py-2">{formatCurrency((entry as any).amount ?? (entry as any).taxes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

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
