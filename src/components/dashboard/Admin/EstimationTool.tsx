import React, { useEffect, useState, useCallback } from 'react';
import { PDFViewer, PDFDownloadLink } from '@react-pdf/renderer';
import EstimatePDF from './EstimatePDF';
import { useSearchParams } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { collection, getDocs, query, orderBy, Timestamp, doc, updateDoc, setDoc, getDoc, where, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../../../lib/firebase';
import { estimationQuotesCollection, estimationQuoteDoc, estimationQuotePayload, accountsCollection } from '../../../models/Collections';
import QuoteDetails from './QuoteDetails';

interface QuoteItem {
  id: string;
  userEmail?: string | null;
  quoteType?: string;
  status?: string;
  budget?: string | number;
  budgetCurrency?: string;
  createdAt?: Timestamp | null;
  customerEmail?: string;
  propertyType?: string;
  numberOfRooms?: number;
  devicesRequired?: string[];
  additionalNotes?: string;
  newRoomsToAutomate?: string[];
  roomsAlreadySmart?: string[];
  timeline?: string;
  // Additional optional fields present on various quote types
  customDetails?: string;
  location?: { country?: string; state?: string; district?: string };
}

const EstimationTool: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<QuoteItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  // Load quotes and handle URL parameters
  React.useEffect(() => {
    const loadQuoteFromUrl = async () => {
      const quoteId = searchParams.get('quoteId');
      if (quoteId) {
        try {
          const quoteDoc = await getDoc(estimationQuoteDoc(db, quoteId));
          if (quoteDoc.exists()) {
            const quoteData = quoteDoc.data();
            setSelectedQuote({ ...quoteData, id: quoteDoc.id } as QuoteItem);
            setShowCreateForm(false);
          }
        } catch (err) {
          console.error('Error loading quote:', err);
          setError('Failed to load the requested quote.');
        }
      } else {
        setSelectedQuote(null);
        setShowCreateForm(false);
      }
      setValidationError(null);
    };

    loadQuoteFromUrl();
  }, [searchParams]);

  // Helper: fetch device details by name (description, price)
  const fetchDeviceDetails = useCallback(async (deviceName: string) => {
    let unitPrice = 0;
    let description = '';
    const name = (deviceName || '').trim();
    const nameLower = name.toLowerCase();
    try {
      const devCol = collection(db, 'Devices');
      // 1) Exact match on deviceName
      let snap = await getDocs(query(devCol, where('deviceName', '==', name), limit(1)));
      // 2) Exact match on legacy name
      if (snap.empty) {
        snap = await getDocs(query(devCol, where('name', '==', name), limit(1)));
      }
      // 3) Fallback: fetch a small batch and find best case-insensitive match client-side
      if (snap.empty) {
        const batch = await getDocs(query(devCol, limit(50)));
        let best: any | null = null;
        let bestScore = -1;
        batch.forEach((doc) => {
          const d = doc.data() as any;
          const dn = String(d.deviceName || d.name || '').trim();
          const dnLower = dn.toLowerCase();
          let score = 0;
          if (dnLower === nameLower) score = 100;
          else if (dnLower.includes(nameLower)) score = Math.max(score, 75);
          else if (nameLower.includes(dnLower) && dnLower.length > 0) score = Math.max(score, 60);
          if (score > bestScore) { bestScore = score; best = d; }
        });
        if (best) {
          unitPrice = Number(best.price || best.unitPrice || 0);
          description = String(best.description || '');
        }
      } else {
        const d = snap.docs[0].data() as any;
        unitPrice = Number(d.price || d.unitPrice || 0);
        description = String(d.description || '');
      }
    } catch {}
    return { unitPrice, description };
  }, []);

  // Try to fetch device details by name from Devices collection
  const resolveDeviceItemsWithPrices = useCallback(async (deviceNames: string[]) => {
    const results: LineItem[] = await Promise.all(
      deviceNames.map(async (device, idx) => {
        const det = await fetchDeviceDetails(device);
        return {
          id: `row-${Date.now()}-${idx}`,
          name: device,
          description: det.description || '',
          quantity: 1,
          unitPrice: det.unitPrice,
          discount: 0,
          taxPercent: 0,
        };
      })
    );
    return results;
  }, [fetchDeviceDetails]);

  const [createForm, setCreateForm] = useState({
    // Basic
    customerEmail: '',
    numDevices: 0,
    discount: 0,
    estimatedBudget: '',
    // Quote info
    quoteId: `Q-${Date.now()}`,
    status: 'Pending' as 'Pending' | 'Confirmed',
    issueDate: new Date().toISOString().slice(0, 10),
    expiryDate: '',
    // Charges
    // Discount: user edits percent; amount is computed for payload
    overallDiscount: 0,
    overallDiscountPercent: 0,
    shippingCharges: 0,
    installationCharges: 0,
    // Terms
    paymentTerms: 'Advance 50% / Balance Net 15',
    warranty: '',
    deliveryTimeline: '',
    notes: '',
    attachments: [] as string[],
    // Taxes: allow multiple named taxes (e.g., GST, Service Tax)
    taxType: 'GST' as 'GST' | 'Custom',
    taxPercent: 0,
    taxes: [] as Array<{ name: string; percent: number }>,
  });

  type LineItem = {
    id: string;
    name: string;
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number; // absolute, optional
    taxPercent: number; // e.g. 18
  };

  const [items, setItems] = useState<LineItem[]>([
    {
      id: `row-${Date.now()}`,
      name: '',
      description: '',
      quantity: 1,
      unitPrice: 0,
      discount: 0,
      taxPercent: 0,
    },
  ]);

  const addRow = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}-${prev.length + 1}`,
        name: '',
        description: '',
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        taxPercent: 0,
      },
    ]);
  };

  const removeRow = (id: string) => {
    setItems((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const calcRow = (r: LineItem) => {
    const pre = Math.max(0, r.quantity * r.unitPrice);
    const discountPct = Math.max(0, Math.min(100, Number(r.discount) || 0));
    const discountAmount = (pre * discountPct) / 100;
    const line = Math.max(0, pre - discountAmount);
    const tax = (line * (r.taxPercent || 0)) / 100;
    return { line, tax, total: line + tax };
  };

  const totals = React.useMemo(() => {
    const sub = items.reduce((sum, r) => sum + calcRow(r).line, 0);
    const extraTaxPercent = (createForm.taxes || []).reduce((acc, t) => acc + (Number(t?.percent) || 0), 0);
    // Taxes computed before discount and on subtotal
    const taxes = (sub * ((createForm.taxPercent || 0) + extraTaxPercent)) / 100;
    const preDiscountGrand =
      sub +
      taxes +
      (createForm.shippingCharges || 0) +
      (createForm.installationCharges || 0);
    const discountAmount = (preDiscountGrand * (createForm.overallDiscountPercent || 0)) / 100;
    const grand = Math.max(0, preDiscountGrand - discountAmount);
    return {
      subtotal: sub,
      discountAmount,
      taxes,
      grand,
    };
  }, [items, createForm.overallDiscountPercent, createForm.taxes, createForm.taxPercent, createForm.shippingCharges, createForm.installationCharges]);

  // Upload attachments to Firebase Storage and store URLs
  const onFilesSelected = async (files: FileList | null) => {
    if (!files) return;
    try {
      const quoteId = createForm.quoteId || `Q-${Date.now()}`;
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const path = `estimation_attachments/${quoteId}/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        uploaded.push(url);
      }
      setCreateForm((p) => ({ ...p, attachments: [...(p.attachments || []), ...uploaded] }));
    } catch (e) {
      console.error('Attachment upload failed:', e);
      alert('Failed to upload one or more attachments.');
    }
  };

  // Enable PDF when core fields are provided (do not require Payment Terms for preview)
  const isPdfReady = React.useMemo(() => {
    const hasId = !!(createForm.quoteId && createForm.quoteId.trim());
    const hasIssueDate = !!createForm.issueDate;
    const hasEmail = !!(createForm.customerEmail && createForm.customerEmail.trim());
    const hasValidItem = items.some(it => it.name.trim() && (it.quantity || 0) > 0 && (it.unitPrice || 0) > 0);
    return hasId && hasIssueDate && hasEmail && hasValidItem;
  }, [createForm.quoteId, createForm.issueDate, createForm.customerEmail, items]);

  const handleQuoteSelect = (quote: QuoteItem) => {
    setSelectedQuote(quote);
    // Reset form visibility when selecting a quote
    setShowCreateForm(false);
  };

  const handleSendQuote = async () => {
    if (!selectedQuote?.id) return;
    
    try {
      // Update in both collections for compatibility
      
      // Update original quotes collection
      const quoteRef = doc(db, 'quotes', selectedQuote.id);
      await updateDoc(quoteRef, {
        status: 'confirmed',
        updatedAt: Timestamp.now()
      });
      
      // Update Estimation Quote collection if it exists
      try {
        const estimationQuoteRef = estimationQuoteDoc(db, selectedQuote.id);
        await updateDoc(estimationQuoteRef, {
          status: 'Confirmed',
          updatedAt: Timestamp.now()
        });
      } catch (estimationError) {
        // Estimation quote might not exist yet, that's okay
        // Removed console.log
      }
      
      // Update local state
      setQuotes(quotes.map(quote => 
        quote.id === selectedQuote.id 
          ? { ...quote, status: 'confirmed' } 
          : quote
      ));
      
      // Update selected quote in modal
      setSelectedQuote({
        ...selectedQuote,
        status: 'confirmed'
      });
      
      alert('Quote has been confirmed and sent to the customer.');
    } catch (error) {
      console.error('Error updating quote status:', error);
      alert('Failed to update quote status. Please try again.');
    }
  };

  const saveEstimationQuote = async (status: 'Draft' | 'Pending' | 'Confirmed') => {
    if (!selectedQuote) {
      alert('No quote selected');
      return;
    }

    const customerEmail = selectedQuote.customerEmail || createForm.customerEmail;
    if (!customerEmail.trim()) {
      alert('Please enter customer email');
      return;
    }

    if (items.some(item => !item.name.trim())) {
      alert('Please fill in all product/service names');
      return;
    }

    setSaving(true);
    try {
      
      const estimationId = createForm.quoteId;
      // Resolve user UID from Accounts by email to store on estimation
      let resolvedUserUid: string | undefined = undefined;
      try {
        const accSnap = await getDocs(query(accountsCollection(db), where('Email', '==', customerEmail), limit(1)));
        if (!accSnap.empty) {
          resolvedUserUid = accSnap.docs[0].id;
        }
      } catch {}

      const payload = estimationQuotePayload({
        quoteId: estimationId,
        originalQuoteId: selectedQuote.id, // Link back to original quote
        customerEmail: customerEmail,
        uid: resolvedUserUid,
        status: status,
        issueDate: createForm.issueDate ? new Date(createForm.issueDate) : null,
        expiryDate: createForm.expiryDate ? new Date(createForm.expiryDate) : null,
        items: items.map(item => ({
          id: item.id,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          taxPercent: item.taxPercent
        })),
        subtotal: totals.subtotal,
        taxes: totals.taxes,
        overallDiscount: totals.discountAmount,
        shippingCharges: createForm.shippingCharges,
        installationCharges: createForm.installationCharges,
        grandTotal: totals.grand,
        attachments: createForm.attachments,
        taxType: createForm.taxType,
        taxPercent: createForm.taxPercent,
        taxBreakdown: [
          ...(createForm.taxPercent ? [{ name: createForm.taxType || 'Tax', percent: createForm.taxPercent, amount: (totals.subtotal * (createForm.taxPercent || 0)) / 100 }] : []),
          ...((createForm.taxes || []).map(t => ({ name: t.name || 'Tax', percent: Number(t.percent) || 0, amount: (totals.subtotal * (Number(t.percent) || 0)) / 100 })))
        ],
        paymentTerms: createForm.paymentTerms,
        warranty: createForm.warranty,
        deliveryTimeline: createForm.deliveryTimeline,
        notes: createForm.notes,
        createdByUid: auth.currentUser?.uid,
        createdByEmail: auth.currentUser?.email || undefined,
      });

      // Save estimation quote
      // Removed sensitive console.log
      await setDoc(estimationQuoteDoc(db, estimationId), payload);
      
      // Only update original quote status when sending to customer (Confirmed)
      if (status === 'Confirmed') {
        await updateDoc(doc(db, 'quotes', selectedQuote.id), {
          estimationQuoteId: estimationId,
          hasEstimation: true,
          status: 'confirmed',
          updatedAt: Timestamp.now()
        });
      } else {
        // For Draft/Pending, just add reference without changing status
        await updateDoc(doc(db, 'quotes', selectedQuote.id), {
          estimationQuoteId: estimationId,
          hasEstimation: true,
          updatedAt: Timestamp.now()
        });
      }
      
      alert(status === 'Draft' ? 'Quote saved as draft!' : 'Quote saved successfully!');

      // Refresh list and return to Pending Quotes view so user sees updates immediately
      await fetchPendingQuotes();
      setShowCreateForm(false);
      setSelectedQuote(null);
      
      if (status === 'Pending') {
        // Reset form and close modal
        setCreateForm({
          customerEmail: '',
          numDevices: 0,
          discount: 0,
          estimatedBudget: '',
          quoteId: `Q-${Date.now()}`,
          status: 'Pending' as 'Pending' | 'Confirmed',
          issueDate: new Date().toISOString().slice(0, 10),
          expiryDate: '',
          overallDiscount: 0,
          overallDiscountPercent: 0,
          shippingCharges: 0,
          installationCharges: 0,
          paymentTerms: 'Advance 50% / Balance Net 15',
          warranty: '',
          deliveryTimeline: '',
          notes: '',
          attachments: [],
          taxType: 'GST',
          taxPercent: 0,
          taxes: [],
        });
        setItems([{
          id: `row-${Date.now()}`,
          name: '',
          description: '',
          quantity: 1,
          unitPrice: 0,
          discount: 0,
          taxPercent: 0
        }]);
      }
    } catch (error) {
      console.error('Error saving estimation quote:', error);
      alert('Failed to save quote. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Reusable loader for Pending quotes
  const fetchPendingQuotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const quotesQuery = query(
        collection(db, 'quotes'),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(quotesQuery);

      const quotesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as QuoteItem[];

      setQuotes(
        quotesData.filter((quote) => {
          const isPending = quote.status && quote.status.toLowerCase() === 'pending';
          const isMaintenance = (quote.quoteType || '').toLowerCase() === 'maintenance';
          return isPending && !isMaintenance;
        })
      );
    } catch (err) {
      console.error('Error fetching quotes:', err);
      setError('Failed to load quotes. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingQuotes();
  }, [fetchPendingQuotes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-lg text-gray-500 dark:text-gray-400">Loading quotes...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-red-500">
          <p className="text-lg">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-0 mb-6">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">Quote Management</h1>
        </div>
        <div className="mt-1 sm:mt-0">
          <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
            {quotes.length > 0 && (
              <Clock className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {quotes.length} {quotes.length === 1 ? 'quote' : 'quotes'} pending
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 glass-surface p-4 text-sm sm:text-base rounded-[24px]">
        {showCreateForm ? (
          <div className="lg:col-span-3">
            <div className="glass-surface rounded-2xl shadow-soft-lg p-6">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Create Estimation Quote</h2>
                  <div className="h-1 w-20 bg-teal/70 rounded-full" />
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white"
                >
                  Cancel
                </button>
              </div>
              {validationError && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <div className="text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">{validationError}</div>
                </div>
              )}

              <div className="space-y-8">
                {/* Quote Information */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Quote Information</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Quote ID</label>
                      <input type="text" value={createForm.quoteId} readOnly className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 shadow-sm sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Date of Issue</label>
                      <input type="date" value={createForm.issueDate} onChange={(e) => setCreateForm({ ...createForm, issueDate: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Expiry Date</label>
                      <input type="date" value={createForm.expiryDate} onChange={(e) => setCreateForm({ ...createForm, expiryDate: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm" />
                    </div>
                  </div>
                </div>

                {/* Customer & quick fields */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Customer & Estimate</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="col-span-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Customer Email</label>
                      <input type="email" value={createForm.customerEmail} onChange={(e) => setCreateForm({ ...createForm, customerEmail: e.target.value })} placeholder="customer@example.com" className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm" />
                    </div>
                  </div>
                </div>

                {/* Quote Context (Read-only from the original request) */}
                {selectedQuote && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Quote Context</h3>
                    {(() => {
                      const t = (selectedQuote.quoteType || '').toLowerCase();
                      const budgetText = selectedQuote.budget ? `${selectedQuote.budgetCurrency || ''}${selectedQuote.budget}` : undefined;
                      const loc = selectedQuote.location;
                      const LocationBlock = loc ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {loc.country && (
                            <div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">Country</div>
                              <div className="text-gray-900 dark:text-white">{loc.country}</div>
                            </div>
                          )}
                          {loc.state && (
                            <div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">State</div>
                              <div className="text-gray-900 dark:text-white">{loc.state}</div>
                            </div>
                          )}
                          {loc.district && (
                            <div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">District</div>
                              <div className="text-gray-900 dark:text-white">{loc.district}</div>
                            </div>
                          )}
                        </div>
                      ) : null;
                      if (t.includes('custom')) {
                        return (
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {budgetText && (
                                <div>
                                  <div className="text-sm text-gray-500 dark:text-gray-400">Budget</div>
                                  <div className="text-gray-900 dark:text-white">{budgetText}</div>
                                </div>
                              )}
                              {selectedQuote.timeline && (
                                <div>
                                  <div className="text-sm text-gray-500 dark:text-gray-400">Timeline</div>
                                  <div className="text-gray-900 dark:text-white">{selectedQuote.timeline}</div>
                                </div>
                              )}
                            </div>
                            {LocationBlock}
                            {selectedQuote.customDetails && (
                              <div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">Custom Details</div>
                                <div className="text-gray-900 dark:text-white whitespace-pre-wrap">{selectedQuote.customDetails}</div>
                              </div>
                            )}
                          </div>
                        );
                      }
                      if (t.includes('upgrade')) {
                        const rooms = selectedQuote.newRoomsToAutomate || [];
                        return (
                          <div className="space-y-4">
                            {rooms.length > 0 && (
                              <div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">New Rooms to Automate</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {rooms.map((room, idx) => (
                                    <span key={idx} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">{room}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {selectedQuote.timeline && (
                              <div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">Timeline</div>
                                <div className="text-gray-900 dark:text-white">{selectedQuote.timeline}</div>
                              </div>
                            )}
                            {LocationBlock}
                          </div>
                        );
                      }
                      // New Installation or others
                      const devices = selectedQuote.devicesRequired || [];
                      return (
                        <div className="space-y-4">
                          {devices.length > 0 && (
                            <div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">Devices Required</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {devices.map((device, idx) => (
                                  <span key={idx} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">{device}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {selectedQuote.propertyType && (
                              <div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">Property Type</div>
                                <div className="text-gray-900 dark:text-white">{selectedQuote.propertyType}</div>
                              </div>
                            )}
                            {(selectedQuote.numberOfRooms as any) && (
                              <div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">Number of Rooms</div>
                                <div className="text-gray-900 dark:text-white">{String(selectedQuote.numberOfRooms)}</div>
                              </div>
                            )}
                            {selectedQuote.timeline && (
                              <div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">Timeline</div>
                                <div className="text-gray-900 dark:text-white">{selectedQuote.timeline}</div>
                              </div>
                            )}
                          </div>
                          {LocationBlock}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Products & Services */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Products & Services</h3>
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="min-w-full table-auto divide-y divide-gray-200 dark:divide-gray-700">
                      <thead>
                        <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          <th className="px-2 py-2 min-w-[140px] text-left">Product/Service</th>
                          <th className="px-2 py-2 min-w-[120px] text-left hidden sm:table-cell">Description</th>
                          <th className="px-2 py-2 min-w-[60px] text-left">Qty</th>
                          <th className="px-2 py-2 min-w-[80px] text-left">Price</th>
                          <th className="px-2 py-2 min-w-[70px] text-left hidden md:table-cell">Discount (%)</th>
                          <th className="px-2 py-2 min-w-[80px] text-left">Total</th>
                          <th className="px-2 py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {items.map((r) => {
                          const pre = Math.max(0, r.quantity * r.unitPrice);
                          const discountPct = Math.max(0, Math.min(100, Number(r.discount) || 0));
                          const discountAmount = (pre * discountPct) / 100;
                          const line = Math.max(0, pre - discountAmount);
                          const tax = (line * (r.taxPercent || 0)) / 100;
                          const total = line + tax;
                          return (
                            <tr key={r.id} className="text-sm">
                              <td className="px-2 py-2">
                                <input
                                  type="text"
                                  placeholder="Product name"
                                  className="w-full min-w-[120px] rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
                                  value={r.name}
                                  onChange={(e) => updateRow(r.id, { name: e.target.value })}
                                  onBlur={async () => {
                                    if (!r.name || !r.name.trim()) return;
                                    try {
                                      const det = await fetchDeviceDetails(r.name.trim());
                                      const patch: Partial<LineItem> = {};
                                      if ((!r.description || !r.description.trim()) && det.description) patch.description = det.description;
                                      if (((Number(r.unitPrice) || 0) <= 0) && (det.unitPrice || 0) > 0) patch.unitPrice = det.unitPrice;
                                      if (Object.keys(patch).length) updateRow(r.id, patch);
                                    } catch {}
                                  }}
                                />
                              </td>
                              <td className="px-2 py-2 hidden sm:table-cell">
                                <input
                                  type="text"
                                  placeholder="Description"
                                  className="w-full min-w-[100px] rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
                                  value={r.description}
                                  onChange={(e) => updateRow(r.id, { description: e.target.value })}
                                  onFocus={async () => {
                                    if (!r.name?.trim()) return;
                                    try {
                                      const det = await fetchDeviceDetails(r.name.trim());
                                      const patch: Partial<LineItem> = {};
                                      if (det.description) patch.description = det.description;
                                      if ((det.unitPrice || 0) > 0) patch.unitPrice = det.unitPrice;
                                      if (Object.keys(patch).length) updateRow(r.id, patch);
                                    } catch {}
                                  }}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="number"
                                  min={1}
                                  inputMode="numeric"
                                  onFocus={(e) => e.currentTarget.select()}
                                  className="no-spin w-full min-w-[50px] rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
                                  value={r.quantity}
                                  onChange={(e) => updateRow(r.id, { quantity: Number(e.target.value) })}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  inputMode="decimal"
                                  onFocus={async (e) => {
                                    e.currentTarget.select();
                                    if (!r.name?.trim()) return;
                                    try {
                                      const det = await fetchDeviceDetails(r.name.trim());
                                      const patch: Partial<LineItem> = {};
                                      if ((det.unitPrice || 0) > 0) patch.unitPrice = det.unitPrice;
                                      if (det.description && !r.description?.trim()) patch.description = det.description;
                                      if (Object.keys(patch).length) updateRow(r.id, patch);
                                    } catch {}
                                  }}
                                  className="no-spin w-full min-w-[70px] rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
                                  value={r.unitPrice}
                                  onChange={(e) => updateRow(r.id, { unitPrice: Number(e.target.value) })}
                                />
                              </td>
                              <td className="px-2 py-2 hidden md:table-cell">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step="0.01"
                                  inputMode="decimal"
                                  placeholder="%"
                                  onFocus={(e) => e.currentTarget.select()}
                                  className="no-spin w-full min-w-[60px] rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
                                  value={r.discount}
                                  onChange={(e) => updateRow(r.id, { discount: Number(e.target.value) })}
                                />
                              </td>
                              <td className="px-2 py-2 whitespace-nowrap text-gray-900 dark:text-gray-100 font-medium">{total.toFixed(2)}</td>
                              <td className="px-2 py-2 text-right">
                                <button type="button" className="text-red-600 hover:text-red-700 p-1" onClick={() => removeRow(r.id)} aria-label="Delete row" title="Delete">
                                  ×
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3">
                    <button type="button" className="inline-flex justify-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700" onClick={addRow}>
                      Add Product/Service
                    </button>
                  </div>
                </div>

                {/* Pricing Summary */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Pricing Summary</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-300">Subtotal</span>
                        <span className="text-gray-900 dark:text-white font-medium">{totals.subtotal.toFixed(2)}</span>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Overall Discount (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          inputMode="decimal"
                          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm"
                          value={createForm.overallDiscountPercent}
                          onChange={(e) => setCreateForm({ ...createForm, overallDiscountPercent: Number(e.target.value) })}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tax Type</label>
                          <select
                            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm"
                            value={createForm.taxType}
                            onChange={(e) => setCreateForm({ ...createForm, taxType: e.target.value as 'GST' | 'Custom' })}
                          >
                            <option value="GST">GST</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tax Percent</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            inputMode="decimal"
                            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm"
                            value={createForm.taxPercent}
                            onChange={(e) => setCreateForm({ ...createForm, taxPercent: Number(e.target.value) })}
                          />
                        </div>
                        <div className="flex flex-col justify-end">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-300">Taxes</span>
                            <span className="text-gray-900 dark:text-white font-medium">{totals.taxes.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      {/* Manage additional named taxes - moved here below tax type/percent */}
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Additional Taxes</span>
                          <button
                            type="button"
                            onClick={() => setCreateForm((p) => ({ ...p, taxes: [...(p.taxes || []), { name: '', percent: 0 }] }))}
                            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                          >
                            + Add Tax
                          </button>
                        </div>
                        {(createForm.taxes || []).map((t, idx) => (
                          <div key={idx} className="grid grid-cols-5 gap-2">
                            <input
                              type="text"
                              placeholder="Tax name (e.g., SGST)"
                              className="col-span-3 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm px-2 py-1.5"
                              value={t.name}
                              onChange={(e) => setCreateForm((p) => {
                                const taxes = [...(p.taxes || [])];
                                taxes[idx] = { ...taxes[idx], name: e.target.value };
                                return { ...p, taxes };
                              })}
                            />
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              inputMode="decimal"
                              placeholder="%"
                              className="col-span-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm px-2 py-1.5"
                              value={t.percent}
                              onChange={(e) => setCreateForm((p) => {
                                const taxes = [...(p.taxes || [])];
                                taxes[idx] = { ...taxes[idx], percent: Number(e.target.value) };
                                return { ...p, taxes };
                              })}
                            />
                            <button
                              type="button"
                              className="col-span-1 text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                              onClick={() => setCreateForm((p) => ({ ...p, taxes: (p.taxes || []).filter((_, i) => i !== idx) }))}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Shipping/Delivery Charges</label>
                        <input type="number" min={0} step="0.01" className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm" value={createForm.shippingCharges} onChange={(e) => setCreateForm({ ...createForm, shippingCharges: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Installation/Service Charges</label>
                        <input type="number" min={0} step="0.01" className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm" value={createForm.installationCharges} onChange={(e) => setCreateForm({ ...createForm, installationCharges: Number(e.target.value) })} />
                      </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-4 flex items-center justify-between">
                      <span className="text-base font-medium text-gray-900 dark:text-white">Grand Total</span>
                      <span className="text-xl font-semibold text-teal-600">{totals.grand.toFixed(2)}</span>
                    </div>
                    {/* Payable Summary */}
                    <div className="mt-2 bg-gray-50 dark:bg-gray-700 rounded-md p-4 space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-300">Total Price</span><span className="text-gray-900 dark:text-white">{totals.subtotal.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-300">Discount</span><span className="text-gray-900 dark:text-white">-{totals.discountAmount.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-300">Tax</span><span className="text-gray-900 dark:text-white">{totals.taxes.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-300">Shipping</span><span className="text-gray-900 dark:text-white">{createForm.shippingCharges.toFixed?.(2) ?? Number(createForm.shippingCharges).toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-300">Installation</span><span className="text-gray-900 dark:text-white">{createForm.installationCharges.toFixed?.(2) ?? Number(createForm.installationCharges).toFixed(2)}</span></div>
                      <div className="flex justify-between font-semibold"><span className="text-gray-900 dark:text-white">Payable</span><span className="text-teal-600">{totals.grand.toFixed(2)}</span></div>
                    </div>
                  </div>
                </div>

                {/* Terms & Conditions */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Terms & Conditions</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Payment Terms</label>
                      <select className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm" value={createForm.paymentTerms} onChange={(e) => setCreateForm({ ...createForm, paymentTerms: e.target.value })}>
                        <option value="">Not selected</option>
                        <option>Advance 50% / Balance Net 15</option>
                        <option>Advance 30% / Balance Net 30</option>
                        <option>Net 15</option>
                        <option>Net 30</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Warranty / Support</label>
                      <input type="text" className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm" value={createForm.warranty} onChange={(e) => setCreateForm({ ...createForm, warranty: e.target.value })} placeholder="e.g., 1 year standard warranty" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Delivery Timeline</label>
                      <input type="text" className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm" value={createForm.deliveryTimeline} onChange={(e) => setCreateForm({ ...createForm, deliveryTimeline: e.target.value })} placeholder="e.g., 2-3 weeks from order" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
                      <textarea rows={4} className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm" value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} />
                    </div>
                  </div>
                </div>

                {/* Attachments */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Attachments</h3>
                  <input
                    type="file"
                    multiple
                    className="block w-full text-sm text-gray-700 dark:text-gray-300"
                    onChange={(e) => onFilesSelected(e.target.files)}
                  />
                  {Array.isArray(createForm.attachments) && createForm.attachments.length > 0 && (
                    <ul className="mt-2 list-disc list-inside text-sm text-gray-700 dark:text-gray-300 space-y-1">
                      {createForm.attachments.map((url, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <a href={url} target="_blank" rel="noreferrer" className="text-teal-600 dark:text-teal-400 hover:underline">Attachment {idx + 1}</a>
                          <button
                            type="button"
                            className="text-xs text-red-600 dark:text-red-400 hover:underline"
                            onClick={() => setCreateForm((p) => ({ ...p, attachments: (p.attachments || []).filter((_, i) => i !== idx) }))}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row flex-wrap gap-3">
                  <button type="button" className="inline-flex justify-center rounded-full border border-transparent px-4 py-2 text-sm font-medium text-white shadow-soft focus:outline-none focus:ring-2 focus:ring-offset-2 bg-teal-600 hover:bg-teal-700 focus:ring-teal-500 disabled:opacity-50" onClick={() => {
                    setValidationError(null);
                    const missingFields: string[] = [];
                    if (!createForm.quoteId.trim()) missingFields.push('Quote ID');
                    if (!createForm.issueDate) missingFields.push('Date of Issue');
                    const customerEmail = createForm.customerEmail;
                    if (!customerEmail?.trim()) missingFields.push('Customer Email');
                    if (!createForm.paymentTerms.trim()) missingFields.push('Payment Terms');
                    if (items.length === 0 || items.every(item => !item.name.trim())) missingFields.push('At least one product/service item');
                    const incompleteItems = items.filter(item => item.name.trim() && (!item.quantity || item.quantity <= 0 || !item.unitPrice || item.unitPrice <= 0));
                    if (incompleteItems.length > 0) missingFields.push('Complete quantity and unit price for all items');
                    if (missingFields.length > 0) { setValidationError(`• ${missingFields.join('\n• ')}`); (document.querySelector('.bg-white.dark\\:bg-gray-800') as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth' }); return; }
                    saveEstimationQuote('Confirmed');
                  }} disabled={saving}>
                    {saving ? 'Sending...' : 'Send to Customer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => isPdfReady && setShowPdfPreview(true)}
                    className={`inline-flex justify-center rounded-md px-4 py-2 text-sm font-medium border ${isPdfReady ? 'text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700' : 'text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 cursor-not-allowed'}`}
                    disabled={!isPdfReady}
                    title={isPdfReady ? 'Preview and download PDF' : 'Fill required fields (Quote ID, Issue Date, Customer Email, Payment Terms, and at least one valid item)'}
                  >
                    Download PDF
                  </button>
                  <button type="button" className="inline-flex justify-center rounded-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700" onClick={() => setShowCreateForm(false)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        ) : selectedQuote ? (
          <div className="lg:col-span-3">
            <QuoteDetails 
              quote={selectedQuote!} 
              onBack={() => setSelectedQuote(null)}
              onCreateQuote={() => {
                if (!selectedQuote) return;
                setShowCreateForm(true);
                setCreateForm((prev) => ({
                  ...prev,
                  customerEmail: selectedQuote.customerEmail || '',
                  numDevices: selectedQuote.devicesRequired?.length || 0,
                  discount: 0,
                  estimatedBudget: String(selectedQuote.budget ?? ''),
                  // Prefill delivery timeline from quote when available
                  deliveryTimeline: selectedQuote.timeline || prev.deliveryTimeline
                }));
                // Prefill items based on quote type
                const t = (selectedQuote.quoteType || '').toLowerCase();
                if (t.includes('upgrade')) {
                  const rooms = selectedQuote.newRoomsToAutomate || [];
                  if (rooms.length > 0) {
                    setItems(rooms.map((room, idx) => ({ id: `row-${Date.now()}-${idx}`, name: room, description: '', quantity: 1, unitPrice: 0, discount: 0, taxPercent: 0 })));
                  } else {
                    setItems([{ id: `row-${Date.now()}`, name: '', description: '', quantity: 1, unitPrice: 0, discount: 0, taxPercent: 0 }]);
                  }
                } else if (t.includes('custom')) {
                  const budgetNum = Number(selectedQuote.budget);
                  setItems([
                    {
                      id: `row-${Date.now()}`,
                      name: 'Custom Requirement',
                      description: selectedQuote.customDetails || '',
                      quantity: 1,
                      unitPrice: Number.isFinite(budgetNum) ? budgetNum : 0,
                      discount: 0,
                      taxPercent: 0,
                    },
                  ]);
                } else {
                  // New Installation or others -> use devicesRequired
                  const devices = selectedQuote.devicesRequired || [];
                  if (devices.length > 0) {
                    // Resolve prices asynchronously from Devices collection
                    (async () => {
                      const rows = await resolveDeviceItemsWithPrices(devices);
                      setItems(rows);
                    })();
                  } else {
                    setItems([{ id: `row-${Date.now()}`, name: '', description: '', quantity: 1, unitPrice: 0, discount: 0, taxPercent: 0 }]);
                  }
                }
              }}
            />
          </div>
        ) : (
          <div className="lg:col-span-2">
            <div className="glass-surface rounded-2xl shadow-soft-lg overflow-hidden">
              <div className="p-4 border-b border-white/50 dark:border-white/10">
                <h2 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white">Pending Quotes</h2>
              </div>
              {quotes.length === 0 ? (
                <div className="p-6 text-sm text-gray-600 dark:text-gray-400">No pending quotes.</div>
              ) : (
                <ul className="divide-y divide-white/50 dark:divide-white/10">
                  {quotes.map((quote) => (
                    <li
                      key={quote.id}
                      className="px-6 py-4 hover:bg-white/40 dark:hover:bg-white/10 cursor-pointer"
                      onClick={() => setSelectedQuote(quote)}
                    >
                      <div className="w-full flex items-center">
                        <div className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-xs font-medium text-indigo-700 dark:text-indigo-300">
                          {(quote.customerEmail || 'U').toString().charAt(0).toUpperCase()}
                        </div>
                        <div className="ml-3 sm:ml-4 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{quote.customerEmail || 'No email provided'}</div>
                          <div className="text-sm text-gray-500 break-words">{quote.quoteType || 'No type specified'} • {quote.propertyType || 'No property type'}</div>
                        </div>
                        <div className="hidden sm:block ml-auto">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">{quote.status || 'Pending'}</span>
                        </div>
                      </div>
                      <div className="mt-2 sm:hidden">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">{quote.status || 'Pending'}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {/* PDF Preview Modal */}
        {showPdfPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowPdfPreview(false)} />
            <div className="relative z-10 bg-white dark:bg-gray-900 rounded-xl shadow-xl w-[95vw] h-[90vh] max-w-6xl border border-gray-200 dark:border-gray-700 flex flex-col">
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Estimate Preview</h3>
                <div className="flex items-center gap-2">
                  <PDFDownloadLink
                    document={<EstimatePDF createForm={createForm} items={items} totals={totals} />}
                    fileName={`${createForm.quoteId || 'estimate'}.pdf`}
                  >
                    {({ loading }) => (
                      <button
                        type="button"
                        className="inline-flex justify-center rounded-full px-3 py-1.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700"
                      >
                        {loading ? 'Preparing…' : 'Download PDF'}
                      </button>
                    )}
                  </PDFDownloadLink>
                  <button
                    type="button"
                    onClick={() => setShowPdfPreview(false)}
                    className="inline-flex justify-center rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <PDFViewer width="100%" height="100%" showToolbar>
                  <EstimatePDF createForm={createForm} items={items} totals={totals} />
                </PDFViewer>
              </div>
            </div>
          </div>
        )}
        {/* Input UX helpers */}
        <style>
          {`
            .no-spin::-webkit-outer-spin-button,
            .no-spin::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
            .no-spin { -moz-appearance: textfield; }
          `}
        </style>
      </div>
    </div>
  );
};

export default EstimationTool;
