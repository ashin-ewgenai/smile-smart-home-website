import React, { useEffect, useState } from 'react';
import { doc, getDoc, getDocs, query, where, limit, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { quoteDoc, type QuoteItem, estimationQuoteDoc, estimationQuotesCollection, type EstimationQuote } from '@/models/Collections';
import { useAuth } from '@/lib/useAuth';
import { CheckCircle2, ShieldCheck, Zap, Sparkles, ShoppingBag, ArrowRight } from 'lucide-react';

interface Props {
  quoteId: string;
}

type FieldValue = string | number | null | undefined;

const Field: React.FC<{ label: string; value?: FieldValue }> = ({ label, value }) => {
  const display = value !== null && value !== undefined && value !== '' ? value : 'N/A';
  return (
    <div>
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</h3>
      <p className="mt-1 text-gray-900 dark:text-white font-medium">{display}</p>
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
  const [isAccepting, setIsAccepting] = useState(false);

  const handleAcceptQuote = async () => {
    if (!estimation?.id) return;
    setIsAccepting(true);
    try {
      const estRef = doc(db, 'Estimation_Quote', estimation.id);
      await updateDoc(estRef, {
        status: 'confirmed',
        acceptedAt: new Date().toISOString()
      });
      alert('Thank you! Your quote has been accepted. We will contact you shortly to finalize the installation.');
      window.location.reload();
    } catch (error) {
      console.error('Error accepting quote:', error);
      alert('Failed to accept quote. Please try again or contact support.');
    } finally {
      setIsAccepting(false);
    }
  };

  const isEstimationForQuote = React.useCallback((est: Partial<EstimationQuote> | null | undefined, docId?: string, expectedId?: string) => {
    if (!est) return false;
    if (expectedId && (docId === expectedId || est.quoteId === expectedId)) return true;
    if (est.originalQuoteId && est.originalQuoteId === quoteId) return true;
    if (est.quoteId && est.quoteId === quoteId) return true;
    return false;
  }, [quoteId]);

  const onContentWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
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
          } catch { }
        }

        if (!fetched) {
          try {
            const rootSnap = await getDoc(doc(db, 'quotes', quoteId));
            if (!active) return;
            if (rootSnap.exists()) {
              fetched = rootSnap.data() as any as QuoteItem;
            }
          } catch { }
        }

        if (active) {
          setData(fetched);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          setLoading(false);
        }
      }
    };
    run();
    return () => { active = false; };
  }, [quoteId, user]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!quoteId) return;
      setEstLoading(true);
      try {
        const q = query(estimationQuotesCollection(db), where('quoteId', '==', quoteId), limit(1));
        const snap = await getDocs(q);
        if (!active) return;
        if (!snap.empty) {
          setEstimation({ ...snap.docs[0].data(), id: snap.docs[0].id });
        } else {
          const q2 = query(estimationQuotesCollection(db), where('originalQuoteId', '==', quoteId), limit(1));
          const snap2 = await getDocs(q2);
          if (!active) return;
          if (!snap2.empty) {
            setEstimation({ ...snap2.docs[0].data(), id: snap2.docs[0].id });
          }
        }
      } catch (err) {
        console.error('Error fetching estimation:', err);
      } finally {
        if (active) setEstLoading(false);
      }
    };
    run();
    return () => { active = false; };
  }, [quoteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
        <p className="text-gray-500 dark:text-gray-400">Quote details not found.</p>
      </div>
    );
  }

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden max-h-[80vh] flex flex-col"
      onWheel={onContentWheel}
    >
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Quote Details</h2>
        <span className="text-xs font-mono text-gray-400">#{quoteId}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Field label="Service Type" value={data.quoteType} />
          <Field label="Status" value={data.status} />
          <Field label="Created At" value={formatDateTime(data.createdAt)} />
          <Field label="Customer Email" value={data.customerEmail} />
          <Field label="Property Type" value={data.propertyType} />
          <Field label="Rooms" value={data.numberOfRooms} />
        </div>

        {data.additionalNotes && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Additional Notes</h3>
            <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {data.additionalNotes}
            </div>
          </div>
        )}

        {(data.devicesRequired?.length ?? 0) > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Required Devices</h3>
            <div className="flex flex-wrap gap-2">
              {data.devicesRequired?.map((device: string, index: number) => (
                <span key={index} className="px-3 py-1 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full text-sm font-medium border border-teal-100 dark:border-teal-800">
                  {device}
                </span>
              ))}
            </div>
          </div>
        )}

        {estLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading estimation details...</p>
          </div>
        ) : estimation ? (
          <div className="pt-8 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-6">
              <div className="h-8 w-1 bg-teal-500 rounded-full" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Official Estimation</h3>
              <span className={`ml-auto px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${estimation.status === 'confirmed' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' :
                  estimation.status === 'paid' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' :
                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
                }`}>
                {estimation.status}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="p-4 bg-teal-50 dark:bg-teal-900/20 rounded-xl border border-teal-100 dark:border-teal-900/30">
                <p className="text-xs text-teal-600 dark:text-teal-400 uppercase font-bold mb-1">Grand Total</p>
                <p className="text-2xl font-black text-teal-700 dark:text-teal-300">{formatCurrency(estimation.grandTotal)}</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold mb-1">Payment Terms</p>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{estimation.paymentTerms || 'Standard'}</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold mb-1">Warranty</p>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{estimation.warranty || 'Standard'}</p>
              </div>
            </div>

            {Array.isArray(estimation.items) && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      <th className="py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Item</th>
                      <th className="py-3 text-xs font-black text-gray-400 uppercase tracking-wider text-right">Qty</th>
                      <th className="py-3 text-xs font-black text-gray-400 uppercase tracking-wider text-right">Price</th>
                      <th className="py-3 text-xs font-black text-gray-400 uppercase tracking-wider text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                    {estimation.items.map((item, idx) => (
                      <tr key={idx} className="group hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="py-4">
                          <p className="text-sm font-bold text-gray-900 dark:text-white">{item.name}</p>
                          {item.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.description}</p>}
                        </td>
                        <td className="py-4 text-sm text-gray-600 dark:text-gray-400 text-right">{item.quantity}</td>
                        <td className="py-4 text-sm text-gray-600 dark:text-gray-400 text-right">{formatCurrency(item.unitPrice)}</td>
                        <td className="py-4 text-sm font-bold text-gray-900 dark:text-white text-right">
                          {formatCurrency((item.quantity || 0) * (item.unitPrice || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {estimation.status === 'pending' && (
              <div className="mt-8 flex justify-end">
                <button
                  onClick={handleAcceptQuote}
                  disabled={isAccepting}
                  className="px-8 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 flex items-center gap-2"
                >
                  {isAccepting ? 'Processing...' : 'Accept & Secure Quote'}
                  <CheckCircle2 size={18} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 bg-gray-50 dark:bg-gray-900/30 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 text-center">
            <p className="text-gray-500 dark:text-gray-400 italic">Official estimation is being prepared by our team.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuoteDetails;
