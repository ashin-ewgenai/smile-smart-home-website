import React, { useEffect, useState } from 'react';
import { setDoc, Timestamp, getDocs, query, collection, where, getDoc, doc } from 'firebase/firestore';
import { auth, db, storage } from '../../../../lib/firebase';
import { estimationQuoteDoc, estimationQuotePayload } from '../../../../models/Collections';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

type SelectedQuote = { type: 'quotes'; id: string; data: any } | null;

interface Props {
  selected: SelectedQuote;
  accountEmail?: string | null;
  accountUid?: string | null;
  estimation: any | null;
  onSaved?: (saved: any) => void;
}

const EstimationEditor: React.FC<Props> = ({ selected, accountEmail, accountUid, estimation, onSaved }) => {
  const [draft, setDraft] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const save = async (forceStatus?: 'Draft' | 'Pending' | 'Confirmed') => {
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

      const isCreate = !estimation;
      const statusForEstimation = forceStatus || (isCreate ? 'Confirmed' : (draft.status || 'Confirmed'));

      const payload = estimationQuotePayload({
        quoteId: draft.id || draft.quoteId || `Q-${selected.id}`,
        originalQuoteId: draft.originalQuoteId || selected.id,
        customerEmail: draft.customerEmail || accountEmail || selected.data?.userEmail || '',
        uid: accountUid || selected.data?.uid || selected.data?.userUid || undefined,
        status: statusForEstimation,
        issueDate: draft.issueDate,
        expiryDate: draft.expiryDate,
        items,
        subtotal,
        taxes,
        overallDiscount,
        shippingCharges,
        installationCharges,
        grandTotal,
        attachments: Array.isArray(draft.attachments) ? draft.attachments : [],
        createdByUid: auth.currentUser?.uid || '',
        createdByEmail: auth.currentUser?.email || '',
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
    const build = async () => {
      // Try to prefill items from user's devices
      let items: any[] = [];
      try {
        const uid = accountUid || selected.data?.uid || selected.data?.userUid;
        if (uid) {
          const userDevicesSnap = await getDocs(query(collection(db, 'User_Devices'), where('uid', '==', uid)));
          const rows = await Promise.all(userDevicesSnap.docs.map(async (d) => {
            const data: any = d.data();
            const sourceDeviceId = data.sourceDeviceId || d.id;
            let name = data.deviceName || data.name || 'Device';
            let description = data.description || '';
            let unitPrice = Number(data.unitPrice || 0);
            try {
              const details = await getDoc(doc(db, 'Devices', sourceDeviceId));
              if (details.exists()) {
                const det: any = details.data();
                name = det.deviceName || det.name || name;
                description = det.description || description;
                unitPrice = Number(det.price || det.unitPrice || unitPrice || 0);
              }
            } catch {}
            return {
              id: `row-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
              name,
              description,
              quantity: 1,
              unitPrice,
              discount: 0,
              taxPercent: 0,
            };
          }));
          // If devices found, use them; else fall back to one blank row
          items = rows.length > 0 ? rows : [];
        }
      } catch {}

      setDraft({
        id: newId,
        quoteId: newId,
        originalQuoteId: selected.id,
        customerEmail: accountEmail || selected.data?.userEmail || '',
        status: 'Confirmed',
        issueDate: new Date().toISOString().slice(0, 10),
        expiryDate: '',
        items: items.length > 0 ? items : [
          { id: `row-${Date.now()}`, name: '', description: '', quantity: 1, unitPrice: 0, discount: 0, taxPercent: 0 }
        ],
        overallDiscount: 0,
        shippingCharges: 0,
        installationCharges: 0,
        paymentTerms: 'Advance 50% / Balance Net 15',
        warranty: '',
        deliveryTimeline: '',
        notes: '',
        attachments: [] as string[]
      });
    };
    build();
  };

  const onFilesSelected = async (files: FileList | null) => {
    if (!files || !draft) return;
    setUploading(true);
    try {
      const quoteId = draft.quoteId || draft.id || `Q-${selected?.id ?? 'unknown'}`;
      const uploadedUrls: string[] = [];
      for (const file of Array.from(files)) {
        const path = `estimation_attachments/${quoteId}/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        uploadedUrls.push(url);
      }
      setDraft((prev: any) => ({
        ...prev,
        attachments: [...(prev.attachments || []), ...uploadedUrls],
      }));
    } catch (e) {
      console.error('Attachment upload failed:', e);
      alert('Failed to upload one or more attachments.');
    } finally {
      setUploading(false);
    }
  };

  const downloadPdf = () => {
    // Simple fallback: print dialog for now; can replace with html2canvas/jspdf if needed
    window.print();
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

          {/* Pricing Summary */}
          <div>
            <div className="text-gray-200 font-medium mb-2">Pricing Summary</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Subtotal</span>
                  <span className="text-gray-100 font-medium">{computeTotals(draft.items || []).subtotal.toFixed(2)}</span>
                </div>
                <div>
                  <div className="text-gray-400 text-sm mb-1">Overall Discount</div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-3 py-2"
                    value={Number(draft.overallDiscount || 0)}
                    onChange={(e) => setDraft((p: any) => ({ ...p, overallDiscount: Number(e.target.value) }))}
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Taxes</span>
                  <span className="text-gray-100 font-medium">{computeTotals(draft.items || []).taxes.toFixed(2)}</span>
                </div>
                <div>
                  <div className="text-gray-400 text-sm mb-1">Shipping/Delivery Charges</div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-3 py-2"
                    value={Number(draft.shippingCharges || 0)}
                    onChange={(e) => setDraft((p: any) => ({ ...p, shippingCharges: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <div className="text-gray-400 text-sm mb-1">Installation/Service Charges</div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-3 py-2"
                    value={Number(draft.installationCharges || 0)}
                    onChange={(e) => setDraft((p: any) => ({ ...p, installationCharges: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="bg-gray-800/60 rounded-md p-4 border border-gray-700 flex items-center justify-between">
                <span className="text-base font-medium text-gray-100">Grand Total</span>
                <span className="text-xl font-semibold text-indigo-400">
                  {(() => {
                    const { subtotal, taxes } = computeTotals(draft.items || []);
                    const afterDiscount = Math.max(0, subtotal - (Number(draft.overallDiscount) || 0));
                    const grand = afterDiscount + taxes + (Number(draft.shippingCharges) || 0) + (Number(draft.installationCharges) || 0);
                    return grand.toFixed(2);
                  })()}
                </span>
              </div>
            </div>
          </div>

          {/* Terms & Conditions */}
          <div>
            <div className="text-gray-200 font-medium mb-2">Terms & Conditions</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-gray-400 text-sm mb-1">Payment Terms</div>
                <select
                  className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-3 py-2"
                  value={draft.paymentTerms || ''}
                  onChange={(e) => setDraft((p: any) => ({ ...p, paymentTerms: e.target.value }))}
                >
                  <option>Advance 50% / Balance Net 15</option>
                  <option>Advance 30% / Balance Net 30</option>
                  <option>Net 15</option>
                  <option>Net 30</option>
                </select>
              </div>
              <div>
                <div className="text-gray-400 text-sm mb-1">Warranty / Support</div>
                <input
                  type="text"
                  className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-3 py-2"
                  value={draft.warranty || ''}
                  onChange={(e) => setDraft((p: any) => ({ ...p, warranty: e.target.value }))}
                  placeholder="e.g., 1 year standard warranty"
                />
              </div>
              <div>
                <div className="text-gray-400 text-sm mb-1">Delivery Timeline</div>
                <input
                  type="text"
                  className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-3 py-2"
                  value={draft.deliveryTimeline || ''}
                  onChange={(e) => setDraft((p: any) => ({ ...p, deliveryTimeline: e.target.value }))}
                  placeholder="e.g., 2-3 weeks from order"
                />
              </div>
              <div className="sm:col-span-2">
                <div className="text-gray-400 text-sm mb-1">Notes</div>
                <textarea
                  rows={3}
                  className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded px-3 py-2"
                  value={draft.notes || ''}
                  onChange={(e) => setDraft((p: any) => ({ ...p, notes: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Attachments */}
          <div>
            <div className="text-gray-200 font-medium mb-2">Attachments</div>
            <div className="flex items-center gap-3">
              <input
                type="file"
                multiple
                onChange={(e) => onFilesSelected(e.target.files)}
                disabled={uploading}
                className="text-gray-200"
              />
              {uploading && <span className="text-sm text-gray-400">Uploading...</span>}
            </div>
            {Array.isArray(draft.attachments) && draft.attachments.length > 0 && (
              <ul className="mt-2 list-disc list-inside text-sm text-gray-300 space-y-1">
                {draft.attachments.map((url: string, idx: number) => (
                  <li key={idx}>
                    <a href={url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">Attachment {idx + 1}</a>
                  </li>
                ))}
              </ul>
            )}
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDraft(null)}
                className="px-4 py-2 rounded border border-gray-600 text-gray-200 hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => save()}
                disabled={saving || uploading}
                className="px-4 py-2 rounded bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-60"
              >
                {saving ? 'Saving...' : (estimation ? 'Save Changes' : 'Create Estimation')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EstimationEditor;
