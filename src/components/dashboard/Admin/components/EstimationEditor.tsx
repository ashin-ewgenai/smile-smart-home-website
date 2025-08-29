import React, { useEffect, useState } from 'react';
import { setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../../../lib/firebase';
import { estimationQuoteDoc, estimationQuotePayload } from '../../../../models/Collections';

type SelectedQuote = { type: 'quotes'; id: string; data: any } | null;

interface Props {
  selected: SelectedQuote;
  accountEmail?: string | null;
  estimation: any | null;
  onSaved?: (saved: any) => void;
}

const EstimationEditor: React.FC<Props> = ({ selected, accountEmail, estimation, onSaved }) => {
  const [draft, setDraft] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const toDateInput = (d: any): string => {
    if (!d) return '';
    try {
      if (typeof d === 'string') return d.slice(0, 10);
      if (d instanceof Date) return d.toISOString().slice(0, 10);
      if (d && typeof d.toDate === 'function') return d.toDate().toISOString().slice(0, 10);
    } catch { /* noop */ }
    return '';
  };

  useEffect(() => {
    if (!estimation) { setDraft(null); return; }
    const d = {
      ...estimation,
      items: Array.isArray(estimation.items) ? estimation.items.map((it: any) => ({ ...it })) : [],
      issueDate: toDateInput(estimation.issueDate) || new Date().toISOString().slice(0, 10),
      expiryDate: toDateInput(estimation.expiryDate) || '',
      paymentTerms: estimation.paymentTerms || '',
      warranty: estimation.warranty || '',
      deliveryTimeline: estimation.deliveryTimeline || '',
      notes: estimation.notes || ''
    };
    setDraft(d);
  }, [estimation]);

  const addItem = () => {
    setDraft((prev: any) => {
      if (!prev) return prev;
      const items = Array.isArray(prev.items) ? [...prev.items] : [];
      items.push({ id: `row-${Date.now()}-${items.length + 1}`, name: '', description: '', quantity: 1, unitPrice: 0, discount: 0, taxPercent: 0 });
      return { ...prev, items };
    });
  };

  const removeItem = (id: string) => {
    setDraft((prev: any) => {
      if (!prev) return prev;
      const items = (prev.items || []).filter((r: any) => r.id !== id);
      return { ...prev, items };
    });
  };

  const patchItem = (id: string, patch: Record<string, any>) => {
    setDraft((prev: any) => {
      if (!prev) return prev;
      const items = (prev.items || []).map((r: any) => (r.id === id ? { ...r, ...patch } : r));
      return { ...prev, items };
    });
  };

  const calcLine = (r: any) => {
    const line = Math.max(0, (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0) - (Number(r.discount) || 0));
    const tax = (line * (Number(r.taxPercent) || 0)) / 100;
    return { line, tax, total: line + tax };
  };

  const computeTotals = (items: any[]) => {
    const subtotal = items.reduce((sum, r) => sum + calcLine(r).line, 0);
    const taxes = items.reduce((sum, r) => sum + calcLine(r).tax, 0);
    return { subtotal, taxes };
  };

  const save = async () => {
    if (!selected || selected.type !== 'quotes' || !draft) return;
    try {
      setSaving(true);
      const items = Array.isArray(draft.items) ? draft.items : [];
      const { subtotal, taxes } = computeTotals(items);
      const overallDiscount = Number(draft.overallDiscount) || 0;
      const shippingCharges = Number(draft.shippingCharges) || 0;
      const installationCharges = Number(draft.installationCharges) || 0;
      const afterDiscount = Math.max(0, subtotal - overallDiscount);
      const grandTotal = afterDiscount + taxes + shippingCharges + installationCharges;

      const payload = estimationQuotePayload({
        quoteId: draft.id || draft.quoteId || `Q-${selected.id}`,
        originalQuoteId: draft.originalQuoteId || selected.id,
        customerEmail: draft.customerEmail || accountEmail || selected.data?.userEmail || '',
        status: draft.status || 'Pending',
        issueDate: draft.issueDate,
        expiryDate: draft.expiryDate,
        items,
        subtotal,
        taxes,
        overallDiscount,
        shippingCharges,
        installationCharges,
        grandTotal,
        paymentTerms: draft.paymentTerms,
        warranty: draft.warranty,
        deliveryTimeline: draft.deliveryTimeline,
        notes: draft.notes,
      });

      await setDoc(estimationQuoteDoc(db, payload.quoteId), payload);
      const savedObj = { id: payload.quoteId, ...payload };
      onSaved?.(savedObj);
    } catch (e) {
      console.error('Failed to save estimation:', e);
      alert('Failed to save estimation.');
    } finally {
      setSaving(false);
    }
  };

  const initNew = () => {
    if (!selected || selected.type !== 'quotes') return;
    const newId = `Q-${selected.id}`;
    setDraft({
      id: newId,
      quoteId: newId,
      originalQuoteId: selected.id,
      customerEmail: accountEmail || selected.data?.userEmail || '',
      status: 'Pending',
      issueDate: new Date().toISOString().slice(0, 10),
      expiryDate: '',
      items: [
        { id: `row-${Date.now()}`, name: '', description: '', quantity: 1, unitPrice: 0, discount: 0, taxPercent: 0 }
      ],
      overallDiscount: 0,
      shippingCharges: 0,
      installationCharges: 0,
      paymentTerms: 'Advance 50% / Balance Net 15',
      warranty: '',
      deliveryTimeline: '',
      notes: ''
    });
  };

  if (!selected || selected.type !== 'quotes') return null;

  return (
    <div className="mt-4 border-t border-gray-700 pt-4">
      <div className="text-gray-200 font-medium mb-2">
        {draft ? 'Edit Estimation' : 'Create Estimation'}
      </div>

      {!draft ? (
        <div className="flex items-center justify-between gap-3 bg-gray-800/60 border border-gray-700 rounded p-3">
          <div className="text-gray-300">No estimation found for this quote.</div>
          <button
            onClick={initNew}
            className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Create Estimation
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <div className="text-gray-400 text-sm mb-1">Issue Date</div>
              <input
                type="date"
                className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-3 py-2"
                value={toDateInput(draft.issueDate)}
                onChange={(e) => setDraft((p: any) => ({ ...p, issueDate: e.target.value }))}
              />
            </div>
            <div>
              <div className="text-gray-400 text-sm mb-1">Expiry Date</div>
              <input
                type="date"
                className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-3 py-2"
                value={toDateInput(draft.expiryDate)}
                onChange={(e) => setDraft((p: any) => ({ ...p, expiryDate: e.target.value }))}
              />
            </div>
            <div>
              <div className="text-gray-400 text-sm mb-1">Payment Terms</div>
              <input
                type="text"
                className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-3 py-2"
                value={draft.paymentTerms || ''}
                onChange={(e) => setDraft((p: any) => ({ ...p, paymentTerms: e.target.value }))}
              />
            </div>
            <div>
              <div className="text-gray-400 text-sm mb-1">Warranty</div>
              <input
                type="text"
                className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-3 py-2"
                value={draft.warranty || ''}
                onChange={(e) => setDraft((p: any) => ({ ...p, warranty: e.target.value }))}
              />
            </div>
            <div>
              <div className="text-gray-400 text-sm mb-1">Delivery Timeline</div>
              <input
                type="text"
                className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-3 py-2"
                value={draft.deliveryTimeline || ''}
                onChange={(e) => setDraft((p: any) => ({ ...p, deliveryTimeline: e.target.value }))}
              />
            </div>
            <div>
              <div className="text-gray-400 text-sm mb-1">Overall Discount</div>
              <input
                type="number"
                className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-3 py-2"
                value={Number(draft.overallDiscount || 0)}
                onChange={(e) => setDraft((p: any) => ({ ...p, overallDiscount: Number(e.target.value) }))}
              />
            </div>
            <div>
              <div className="text-gray-400 text-sm mb-1">Shipping Charges</div>
              <input
                type="number"
                className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-3 py-2"
                value={Number(draft.shippingCharges || 0)}
                onChange={(e) => setDraft((p: any) => ({ ...p, shippingCharges: Number(e.target.value) }))}
              />
            </div>
            <div>
              <div className="text-gray-400 text-sm mb-1">Installation Charges</div>
              <input
                type="number"
                className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-3 py-2"
                value={Number(draft.installationCharges || 0)}
                onChange={(e) => setDraft((p: any) => ({ ...p, installationCharges: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div>
            <div className="text-gray-400 text-sm mb-1">Notes</div>
            <textarea
              rows={3}
              className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-3 py-2"
              value={draft.notes || ''}
              onChange={(e) => setDraft((p: any) => ({ ...p, notes: e.target.value }))}
            />
          </div>

          <div>
            <div className="text-gray-200 font-medium mb-2">Items</div>
            <div className="overflow-x-auto rounded-md border border-gray-700/70">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-700">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4 hidden sm:table-cell">Description</th>
                    <th className="py-2 pr-4">Qty</th>
                    <th className="py-2 pr-4">Unit Price</th>
                    <th className="py-2 pr-4">Discount</th>
                    <th className="py-2 pr-4">Tax %</th>
                    <th className="py-2 pr-4">Total</th>
                    <th className="py-2 pr-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(draft.items || []).map((it: any) => {
                    const c = calcLine(it);
                    return (
                      <tr key={it.id} className="border-b border-gray-700/50">
                        <td className="py-2 pr-2">
                          <input
                            className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1"
                            value={it.name || ''}
                            onChange={(e) => patchItem(it.id, { name: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2 hidden sm:table-cell">
                          <input
                            className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1"
                            value={it.description || ''}
                            onChange={(e) => patchItem(it.id, { description: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input type="number" className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1" value={Number(it.quantity || 0)} onChange={(e) => patchItem(it.id, { quantity: Number(e.target.value) })} />
                        </td>
                        <td className="py-2 pr-2">
                          <input type="number" className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1" value={Number(it.unitPrice || 0)} onChange={(e) => patchItem(it.id, { unitPrice: Number(e.target.value) })} />
                        </td>
                        <td className="py-2 pr-2">
                          <input type="number" className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1" value={Number(it.discount || 0)} onChange={(e) => patchItem(it.id, { discount: Number(e.target.value) })} />
                        </td>
                        <td className="py-2 pr-2">
                          <input type="number" className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1" value={Number(it.taxPercent || 0)} onChange={(e) => patchItem(it.id, { taxPercent: Number(e.target.value) })} />
                        </td>
                        <td className="py-2 pr-2 text-gray-100">{c.total.toFixed(2)}</td>
                        <td className="py-2 pr-2 text-right">
                          <button className="text-red-400 hover:text-red-300" onClick={() => removeItem(it.id)}>Remove</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-2">
              <button className="px-3 py-1.5 rounded border border-gray-600 text-gray-200 hover:bg-gray-700" onClick={addItem}>Add Item</button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-700">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-60"
            >
              {saving ? 'Saving...' : (estimation ? 'Save Changes' : 'Create Estimation')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EstimationEditor;
