import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { db, auth, functions as firebaseFunctions } from '../../../lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

export type DeviceFormValues = {
  name: string;
  type: string;
  location?: string;
  serial?: string;
  status: 'Active' | 'Inactive';
  assignedToEmail?: string;
};

const initialState: DeviceFormValues = {
  name: '',
  type: '',
  location: '',
  serial: '',
  status: 'Active',
  assignedToEmail: '',
};

export default function DeviceForm() {
  const [values, setValues] = useState<DeviceFormValues>(initialState);
  const [submitting, setSubmitting] = useState(false);
  // Product preview/embed state
  const [productUrl, setProductUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [embeddedUrl, setEmbeddedUrl] = useState<string | null>(null);
  type ProductPreview = {
    url: string;
    site?: string | null;
    title?: string | null;
    image?: string | null;
    description?: string | null;
    price?: string | null;
    rating?: string | null;
    canonical?: string | null;
  };
  const [previewData, setPreviewData] = useState<ProductPreview | null>(null);
  const [embeddedPreview, setEmbeddedPreview] = useState<ProductPreview | null>(null);

  // Prefill assigned email from URL (?userEmail=...)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const userEmail = params.get('userEmail') ?? '';
      if (userEmail) {
        setValues((v) => ({ ...v, assignedToEmail: userEmail }));
      }
    } catch {}
  }, []);

  const canSubmit = useMemo(() => {
    return values.name.trim() !== '' && values.type.trim() !== '' && !submitting;
  }, [values.name, values.type, submitting]);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setValues((v) => ({ ...v, [name]: value }));
    },
    []
  );

  // Simple URL validation for Amazon/Flipkart (allows others too if https)
  const isSupportedProductUrl = useCallback((url: string) => {
    try {
      const u = new URL(url);
      return (
        u.protocol === 'https:' &&
        (/amazon\./i.test(u.hostname) || /flipkart\./i.test(u.hostname))
      );
    } catch {
      return false;
    }
  }, []);

  const onOpenPreview = useCallback(async () => {
    if (!isSupportedProductUrl(productUrl)) {
      alert('Please paste a valid Amazon or Flipkart product page URL (https).');
      return;
    }
    const url = productUrl.trim();
    setPreviewUrl(url);
    setShowPreview(true);
    setPreviewData(null);
    try {
      const callable = httpsCallable<{ url: string }, ProductPreview>(firebaseFunctions, 'fetchProductPreview');
      const res = await callable({ url });
      if (res?.data && typeof res.data === 'object') {
        setPreviewData(res.data as ProductPreview);
      }
    } catch {
      // Ignore; will fall back to iframe
    }
  }, [productUrl, isSupportedProductUrl]);

  const onConfirmAdd = useCallback(() => {
    if (previewData) {
      setEmbeddedPreview(previewData);
      setEmbeddedUrl(null);
    } else if (previewUrl) {
      setEmbeddedUrl(previewUrl);
      setEmbeddedPreview(null);
    }
    setShowPreview(false);
  }, [previewUrl, previewData]);

  const onCancelPreview = useCallback(() => {
    setShowPreview(false);
  }, []);

  // Pretty label for domain
  const getDomainLabel = useCallback((url: string) => {
    try {
      const u = new URL(url);
      if (/amazon\./i.test(u.hostname)) return 'Amazon';
      if (/flipkart\./i.test(u.hostname)) return 'Flipkart';
      return u.hostname.replace(/^www\./, '');
    } catch {
      return 'Website';
    }
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;
      setSubmitting(true);
      try {
        const payload = {
          name: values.name.trim(),
          type: values.type.trim(),
          location: values.location?.trim() || '',
          serial: values.serial?.trim() || '',
          status: values.status,
          assignedToEmail: values.assignedToEmail?.trim() || '',
          createdAt: serverTimestamp(),
          createdByUid: auth?.currentUser?.uid ?? null,
          createdByEmail: auth?.currentUser?.email ?? null,
        };
        await addDoc(collection(db, 'devices'), payload);
        alert('Device added successfully.');
        setValues((v) => ({ ...initialState, assignedToEmail: v.assignedToEmail }));
        // Optionally navigate back to devices list, preserving filter if present
        const params = new URLSearchParams(window.location.search);
        const filter = params.get('userEmail');
        const backUrl = filter ? `/dashboard/admin/devices?userEmail=${encodeURIComponent(filter)}` : '/dashboard/admin/devices';
        window.location.href = backUrl;
      } catch (err) {
        console.error('Failed to add device:', err);
        alert('Error adding device. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [values, canSubmit]
  );

  return (
    <>
      {/* Product URL search and preview */}
      <div className="mb-6">
        <label htmlFor="productUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Product URL (Amazon/Flipkart)</label>
        <div className="mt-1 flex gap-2">
          <input
            id="productUrl"
            name="productUrl"
            type="url"
            placeholder="https://www.amazon.in/... or https://www.flipkart.com/..."
            className="flex-1 block rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
          />
          <button
            type="button"
            onClick={onOpenPreview}
            className="inline-flex items-center px-4 py-2 rounded-md bg-teal-600 text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
          >
            Preview
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Note: Some sites may block embedding inside iframes. If the preview does not load, the site likely disallows embedding.</p>
      </div>

      {/* Persistent embedded product (after Add) */}
      {embeddedPreview && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Embedded Product</h3>
            <button
              type="button"
              onClick={() => setEmbeddedPreview(null)}
              className="text-sm px-3 py-1 rounded border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Remove
            </button>
          </div>
          <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex gap-4">
            {embeddedPreview.image && (
              <img src={embeddedPreview.image} alt={embeddedPreview.title ?? 'Product'} className="w-28 h-28 object-contain rounded" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{embeddedPreview.title ?? 'Product'}</div>
              {embeddedPreview.price && (
                <div className="mt-1 text-sm text-gray-900 dark:text-gray-100 font-semibold">{embeddedPreview.price}</div>
              )}
              {embeddedPreview.rating && (
                <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">Rating: {embeddedPreview.rating}</div>
              )}
              <div className="mt-2 text-xs">
                <a href={embeddedPreview.url} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline dark:text-teal-400">
                  Open on {getDomainLabel(embeddedPreview.url)}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
      {!embeddedPreview && embeddedUrl && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Embedded Product Preview</h3>
            <button
              type="button"
              onClick={() => setEmbeddedUrl(null)}
              className="text-sm px-3 py-1 rounded border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Remove
            </button>
          </div>
          <div className="rounded-md overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <iframe
              src={embeddedUrl}
              title="Product"
              className="w-full h-[60vh]"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
            If the preview is blocked, open on
            {' '}
            <a
              href={embeddedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-600 hover:underline dark:text-teal-400"
            >
              {getDomainLabel(embeddedUrl)}
            </a>
            .
          </div>
        </div>
      )}

      {/* Main Device form */}
      <form className="space-y-5" onSubmit={onSubmit}>
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Device Name</label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="e.g., Living Room Camera"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
            value={values.name}
            onChange={onChange}
          />
        </div>

      <div>
        <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Device Type</label>
        <select
          id="type"
          name="type"
          required
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
          value={values.type}
          onChange={onChange}
        >
          <option value="">Select a type</option>
          <option value="Camera">Camera</option>
          <option value="Sensor">Sensor</option>
          <option value="Lock">Lock</option>
          <option value="Thermostat">Thermostat</option>
          <option value="Light">Light</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="location" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Location</label>
          <input
            id="location"
            name="location"
            type="text"
            placeholder="e.g., Living Room"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
            value={values.location}
            onChange={onChange}
          />
        </div>
        <div>
          <label htmlFor="serial" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number</label>
          <input
            id="serial"
            name="serial"
            type="text"
            placeholder="e.g., ABCD-1234"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
            value={values.serial}
            onChange={onChange}
          />
        </div>
      </div>

      <div>
        <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
        <select
          id="status"
          name="status"
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
          value={values.status}
          onChange={onChange}
        >
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <a href="/dashboard/admin/devices" className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</a>
        <button type="submit" className="inline-flex items-center px-4 py-2 rounded-md bg-teal-600 text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500" disabled={!canSubmit}>
          {submitting ? 'Saving…' : 'Save Device'}
        </button>
      </div>
    </form>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={onCancelPreview} />
          <div className="relative z-10 w-[95vw] max-w-4xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Product Preview</h3>
              <button onClick={onCancelPreview} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">✕</button>
            </div>
            {previewUrl && (
              <div className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                If the preview is blocked, open on
                {' '}
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-600 hover:underline dark:text-teal-400"
                >
                  {getDomainLabel(previewUrl)}
                </a>
                .
              </div>
            )}
            <div className="flex-1 overflow-auto">
              {previewData ? (
                <div className="p-4">
                  <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex gap-4">
                    {previewData.image && (
                      <img src={previewData.image} alt={previewData.title ?? 'Product'} className="w-32 h-32 object-contain rounded" />
                    )}
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">{previewData.title ?? 'Product'}</div>
                      {previewData.price && (
                        <div className="mt-1 text-sm text-gray-900 dark:text-gray-100 font-semibold">{previewData.price}</div>
                      )}
                      {previewData.rating && (
                        <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">Rating: {previewData.rating}</div>
                      )}
                      <div className="mt-2 text-xs">
                        <a href={previewData.url} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline dark:text-teal-400">
                          Open on {getDomainLabel(previewData.url)}
                        </a>
                      </div>
                      {previewData.description && (
                        <div className="mt-2 text-xs text-gray-600 dark:text-gray-300 line-clamp-3">{previewData.description}</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : previewUrl ? (
                <iframe
                  src={previewUrl}
                  title="Preview"
                  className="w-full h-[70vh]"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              ) : (
                <div className="p-6 text-sm text-gray-600 dark:text-gray-300">Invalid URL.</div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCancelPreview}
                className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmAdd}
                className="px-4 py-2 rounded-md bg-teal-600 text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
              >
                Add to page
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
