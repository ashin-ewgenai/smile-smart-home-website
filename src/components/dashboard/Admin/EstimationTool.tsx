import React, { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, query, orderBy, Timestamp, doc, updateDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { estimationQuotesCollection, estimationQuoteDoc, estimationQuotePayload } from '../../../models/Collections';
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
}

const EstimationTool: React.FC = () => {
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<QuoteItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset to quote list when component mounts or route changes
  React.useEffect(() => {
    setSelectedQuote(null);
    setShowCreateForm(false);
    setValidationError(null);
  }, []);

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
    overallDiscount: 0,
    shippingCharges: 0,
    installationCharges: 0,
    // Terms
    paymentTerms: 'Advance 50% / Balance Net 15',
    warranty: '',
    deliveryTimeline: '',
    notes: ''
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
      taxPercent: 0
    }
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
        taxPercent: 0
      }
    ]);
  };

  const removeRow = (id: string) => {
    setItems((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const calcRow = (r: LineItem) => {
    const line = Math.max(0, r.quantity * r.unitPrice - (r.discount || 0));
    const tax = (line * (r.taxPercent || 0)) / 100;
    return { line, tax, total: line + tax };
  };

  const totals = React.useMemo(() => {
    const sub = items.reduce((sum, r) => sum + calcRow(r).line, 0);
    const taxes = items.reduce((sum, r) => sum + calcRow(r).tax, 0);
    const afterDiscount = Math.max(0, sub - (createForm.overallDiscount || 0));
    const grand =
      afterDiscount +
      taxes +
      (createForm.shippingCharges || 0) +
      (createForm.installationCharges || 0);
    return {
      subtotal: sub,
      taxes,
      grand
    };
  }, [items, createForm.overallDiscount, createForm.shippingCharges, createForm.installationCharges]);
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
        console.log('Estimation quote not found, only updated original quote');
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
      
      const payload = estimationQuotePayload({
        quoteId: estimationId,
        originalQuoteId: selectedQuote.id, // Link back to original quote
        customerEmail: customerEmail,
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
        overallDiscount: createForm.overallDiscount,
        shippingCharges: createForm.shippingCharges,
        installationCharges: createForm.installationCharges,
        grandTotal: totals.grand,
        paymentTerms: createForm.paymentTerms,
        warranty: createForm.warranty,
        deliveryTimeline: createForm.deliveryTimeline,
        notes: createForm.notes,
        createdByUid: auth.currentUser?.uid,
        createdByEmail: auth.currentUser?.email || undefined,
      });

      // Save estimation quote
      console.log('Saving payload with originalQuoteId:', payload.originalQuoteId);
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
          shippingCharges: 0,
          installationCharges: 0,
          paymentTerms: 'Advance 50% / Balance Net 15',
          warranty: '',
          deliveryTimeline: '',
          notes: ''
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
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Quote Management</h1>
        </div>
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {quotes.length} {quotes.length === 1 ? 'quote' : 'quotes'} pending
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {!selectedQuote && !showCreateForm && (
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">Pending Quotes</h2>
              </div>
              {quotes.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-gray-500 dark:text-gray-400">No pending quotes found</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {quotes.map((quote) => (
                    <li 
                      key={quote.id} 
                      className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                      onClick={() => handleQuoteSelect(quote)}
                    >
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                          <span className="text-indigo-600 dark:text-indigo-300 font-medium">
                            {quote.customerEmail ? quote.customerEmail.charAt(0).toUpperCase() : 'Q'}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {quote.customerEmail || 'No email provided'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {quote.quoteType || 'No type specified'} • {quote.propertyType || 'No property type'}
                          </div>
                        </div>
                        <div className="ml-auto">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                            {quote.status || 'Pending'}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {showCreateForm ? (
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Create Estimation Quote</h2>
                  <div className="h-1 w-20 bg-indigo-600 rounded"></div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 111.414 1.414L5.414 9H17a1 1 0 110 2H5.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                  Back
                </button>
              </div>

              {/* Validation Error Message */}
              {validationError && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                        Please enter the required fields:
                      </h3>
                      <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                        <pre className="whitespace-pre-wrap">{validationError}</pre>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-8">
                {/* Quote Information */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Quote Information</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Quote ID</label>
                      <input
                        type="text"
                        value={createForm.quoteId}
                        readOnly
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 shadow-sm sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Date of Issue</label>
                      <input
                        type="date"
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm"
                        value={createForm.issueDate}
                        onChange={(e) => setCreateForm({ ...createForm, issueDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Expiry Date</label>
                      <input
                        type="date"
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm"
                        value={createForm.expiryDate}
                        onChange={(e) => setCreateForm({ ...createForm, expiryDate: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Customer & quick fields */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Customer & Estimate</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="col-span-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Customer Email</label>
                      <input
                        type="email"
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        value={createForm.customerEmail}
                        onChange={(e) => setCreateForm({ ...createForm, customerEmail: e.target.value })}
                        placeholder="customer@example.com"
                      />
                    </div>
                  </div>
                </div>

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
                          <th className="px-2 py-2 min-w-[70px] text-left hidden md:table-cell">Discount</th>
                          <th className="px-2 py-2 min-w-[60px] text-left hidden md:table-cell">Tax %</th>
                          <th className="px-2 py-2 min-w-[80px] text-left">Total</th>
                          <th className="px-2 py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {items.map((r) => {
                          const c = calcRow(r);
                          return (
                            <tr key={r.id} className="text-sm">
                              <td className="px-2 py-2">
                                <input
                                  type="text"
                                  placeholder="Product name"
                                  className="w-full min-w-[120px] rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
                                  value={r.name}
                                  onChange={(e) => updateRow(r.id, { name: e.target.value })}
                                />
                              </td>
                              <td className="px-2 py-2 hidden sm:table-cell">
                                <input
                                  type="text"
                                  placeholder="Description"
                                  className="w-full min-w-[100px] rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
                                  value={r.description}
                                  onChange={(e) => updateRow(r.id, { description: e.target.value })}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="number"
                                  min={1}
                                  className="w-full min-w-[50px] rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
                                  value={r.quantity}
                                  onChange={(e) => updateRow(r.id, { quantity: Number(e.target.value) })}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  className="w-full min-w-[70px] rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
                                  value={r.unitPrice}
                                  onChange={(e) => updateRow(r.id, { unitPrice: Number(e.target.value) })}
                                />
                              </td>
                              <td className="px-2 py-2 hidden md:table-cell">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  className="w-full min-w-[60px] rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
                                  value={r.discount}
                                  onChange={(e) => updateRow(r.id, { discount: Number(e.target.value) })}
                                />
                              </td>
                              <td className="px-2 py-2 hidden md:table-cell">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  className="w-full min-w-[50px] rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
                                  value={r.taxPercent}
                                  onChange={(e) => updateRow(r.id, { taxPercent: Number(e.target.value) })}
                                />
                              </td>
                              <td className="px-2 py-2 whitespace-nowrap text-gray-900 dark:text-gray-100 font-medium">{(c.total).toFixed(2)}</td>
                              <td className="px-2 py-2 text-right">
                                <button
                                  type="button"
                                  className="text-red-600 hover:text-red-700 p-1"
                                  onClick={() => removeRow(r.id)}
                                  aria-label="Delete row"
                                  title="Delete"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                                    <path fillRule="evenodd" d="M9 3.75A2.25 2.25 0 0 1 11.25 1.5h1.5A2.25 2.25 0 0 1 15 3.75V4.5h3.75a.75.75 0 0 1 0 1.5h-.71l-1.03 12.004A3.75 3.75 0 0 1 13.27 21H10.73a3.75 3.75 0 0 1-3.74-2.996L5.96 6H5.25a.75.75 0 0 1 0-1.5H9V3.75Zm1.5.75h3V3.75a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0-.75.75V4.5Zm-2.97 1.5 1.02 11.88a2.25 2.25 0 0 0 2.22 1.995h2.54a2.25 2.25 0 0 0 2.22-1.995L18.47 6H7.53ZM9.75 9a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-1.5 0v-6a.75.75 0 0 1 .75-.75Zm4.5 0a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-1.5 0v-6a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                      onClick={addRow}
                    >
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Overall Discount</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm"
                          value={createForm.overallDiscount}
                          onChange={(e) => setCreateForm({ ...createForm, overallDiscount: Number(e.target.value) })}
                        />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-300">Taxes</span>
                        <span className="text-gray-900 dark:text-white font-medium">{totals.taxes.toFixed(2)}</span>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Shipping/Delivery Charges</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm"
                          value={createForm.shippingCharges}
                          onChange={(e) => setCreateForm({ ...createForm, shippingCharges: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Installation/Service Charges</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm"
                          value={createForm.installationCharges}
                          onChange={(e) => setCreateForm({ ...createForm, installationCharges: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-4 flex items-center justify-between">
                      <span className="text-base font-medium text-gray-900 dark:text-white">Grand Total</span>
                      <span className="text-xl font-semibold text-indigo-600">{totals.grand.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Terms & Conditions */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Terms & Conditions</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Payment Terms</label>
                      <select
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm"
                        value={createForm.paymentTerms}
                        onChange={(e) => setCreateForm({ ...createForm, paymentTerms: e.target.value })}
                      >
                        <option>Advance 50% / Balance Net 15</option>
                        <option>Advance 30% / Balance Net 30</option>
                        <option>Net 15</option>
                        <option>Net 30</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Warranty / Support</label>
                      <input
                        type="text"
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm"
                        value={createForm.warranty}
                        onChange={(e) => setCreateForm({ ...createForm, warranty: e.target.value })}
                        placeholder="e.g., 1 year standard warranty"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Delivery Timeline</label>
                      <input
                        type="text"
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm"
                        value={createForm.deliveryTimeline}
                        onChange={(e) => setCreateForm({ ...createForm, deliveryTimeline: e.target.value })}
                        placeholder="e.g., 2-3 weeks from order"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
                      <textarea
                        rows={4}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm sm:text-sm"
                        value={createForm.notes}
                        onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Attachments */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Attachments</h3>
                  <input type="file" multiple className="block w-full text-sm text-gray-700 dark:text-gray-300" />
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row flex-wrap gap-3">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500 disabled:opacity-50"
                    onClick={() => {
                      // Clear previous validation errors
                      setValidationError(null);
                      
                      // Validate required fields before sending
                      const missingFields = [];
                      
                      if (!createForm.quoteId.trim()) missingFields.push('Quote ID');
                      if (!createForm.issueDate) missingFields.push('Date of Issue');
                      const customerEmail = selectedQuote?.customerEmail || createForm.customerEmail;
                      if (!customerEmail?.trim()) missingFields.push('Customer Email');
                      if (!createForm.paymentTerms.trim()) missingFields.push('Payment Terms');
                      
                      // Check if there are any line items
                      if (items.length === 0 || items.every(item => !item.name.trim())) {
                        missingFields.push('At least one product/service item');
                      }
                      
                      // Check if line items have required fields
                      const incompleteItems = items.filter(item => 
                        item.name.trim() && (!item.quantity || item.quantity <= 0 || !item.unitPrice || item.unitPrice <= 0)
                      );
                      
                      if (incompleteItems.length > 0) {
                        missingFields.push('Complete quantity and unit price for all items');
                      }
                      
                      if (missingFields.length > 0) {
                        setValidationError(`• ${missingFields.join('\n• ')}`);
                        // Scroll to top to show error message
                        document.querySelector('.bg-white.dark\\:bg-gray-800')?.scrollIntoView({ behavior: 'smooth' });
                        return;
                      }
                      
                      saveEstimationQuote('Confirmed');
                    }}
                    disabled={saving}
                  >
                    {saving ? 'Sending...' : 'Send to Customer'}
                  </button>
                  <button type="button" className="inline-flex justify-center rounded-md px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">Download PDF</button>
                  <div className="ml-auto">
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                      onClick={() => setShowCreateForm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          selectedQuote && (
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
                    estimatedBudget: String(selectedQuote.budget ?? '')
                  }));
                  // Pre-populate line items from devicesRequired
                  const devices = selectedQuote.devicesRequired || [];
                  if (devices.length > 0) {
                    setItems(
                      devices.map((device, idx) => ({
                        id: `row-${Date.now()}-${idx}`,
                        name: device,
                        description: '',
                        quantity: 1,
                        unitPrice: 0,
                        discount: 0,
                        taxPercent: 0,
                      }))
                    );
                  } else {
                    // Ensure at least one empty row
                    setItems([
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
                  }
                }} 
              />
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default EstimationTool;
