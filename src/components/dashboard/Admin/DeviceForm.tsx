import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { db, auth, functions as firebaseFunctions, storage } from '../../../lib/firebase';
import { addDoc, serverTimestamp, onSnapshot, query, orderBy, updateDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { devicesCollection, deviceDoc } from '../../../models/Collections';
import { httpsCallable } from 'firebase/functions';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

export type DeviceFormValues = {
  name: string;
  type: string;
  location?: string;
  serial?: string;
  status: 'Active' | 'Inactive';
  assignedToEmail?: string;
  imageUrl?: string;
  price?: number;
  stock?: number;
  description?: string;
  brand?: string;
  rating?: number; // 0-5
  discount?: number; // 0-100
  warrantyValue?: number;
  warrantyUnit?: 'months' | 'years';
};

const initialState: DeviceFormValues = {
  name: '',
  type: '',
  location: '',
  serial: '',
  status: 'Active',
  assignedToEmail: '',
  imageUrl: '',
  price: undefined,
  stock: undefined,
  description: '',
  brand: '',
  rating: undefined,
  discount: undefined,
  warrantyValue: undefined,
  warrantyUnit: 'months',
};

export default function DeviceForm() {
  const [values, setValues] = useState<DeviceFormValues>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  type DeviceDoc = {
    id: string;
    name: string;
    type: string;
    status: 'Active' | 'Inactive';
    serial?: string;
    imageUrl?: string;
    assignedToEmail?: string;
    price?: number;
    stock?: number;
    description?: string;
    brand?: string;
    rating?: number;
    discount?: number;
    warranty?: string | number;
  };
  const [devices, setDevices] = useState<DeviceDoc[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const filteredDevices = useMemo(() => {
    const s = search.trim().toLowerCase();
    return devices.filter((d) => {
      const matchesSearch = !s || d.name.toLowerCase().includes(s) || (d.serial ?? '').toLowerCase().includes(s);
      const matchesType = !typeFilter || d.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [devices, search, typeFilter]);

  // Edit modal state
  const [editing, setEditing] = useState<null | DeviceDoc>(null);
  type EditValues = Partial<DeviceDoc> & { warrantyValue?: number; warrantyUnit?: 'months' | 'years' };
  const [editValues, setEditValues] = useState<EditValues>({});
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

  // Warranty helpers
  const formatWarranty = useCallback((value?: number, unit: 'months' | 'years' = 'months') => {
    if (!value && value !== 0) return '';
    const u = unit === 'years' ? (value === 1 ? 'year' : 'years') : 'months';
    return `${value} ${u}`;
  }, []);

  const parseWarranty = useCallback((w: unknown): { value?: number; unit: 'months' | 'years' } => {
    if (typeof w === 'number') return { value: w, unit: 'months' };
    if (typeof w === 'string') {
      const s = w.toLowerCase();
      const num = parseInt(s.replace(/[^0-9]/g, ''), 10);
      const unit: 'months' | 'years' = /year/.test(s) ? 'years' : 'months';
      return { value: isNaN(num) ? undefined : num, unit };
    }
    return { value: undefined, unit: 'months' };
  }, []);

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

  // Subscribe to all devices (newest first)
  useEffect(() => {
    const q = query(devicesCollection(db), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list: DeviceDoc[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: (data.deviceName ?? data.name) ?? '',
          type: data.type ?? '',
          status: (data.status as 'Active' | 'Inactive') ?? 'Active',
          serial: (data.modelNumber ?? data.serial) ?? '',
          imageUrl: data.imageUrl ?? '',
          assignedToEmail: data.assignedToEmail ?? '',
          price: typeof data.price === 'number' ? data.price : (typeof data.price === 'string' ? parseFloat(data.price) : undefined),
          stock: typeof data.stock === 'number' ? data.stock : (typeof data.stock === 'string' ? parseInt(data.stock) : undefined),
          description: data.description ?? '',
          brand: data.brand ?? '',
          rating: typeof data.rating === 'number' ? data.rating : (typeof data.rating === 'string' ? parseFloat(data.rating) : undefined),
          discount: typeof data.discount === 'number' ? data.discount : (typeof data.discount === 'string' ? parseFloat(data.discount) : undefined),
          warranty: data.warranty,
        };
      });
      setDevices(list);
      setLoadingDevices(false);
    });
    return () => unsub();
  }, []);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setValues((v) => ({ ...v, [name]: value }));
    },
    []
  );

  // Numeric and long-text handlers
  const onPriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValues((v) => ({ ...v, price: val === '' ? undefined : Number(val) }));
  }, []);

  const onStockChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValues((v) => ({ ...v, stock: val === '' ? undefined : Number(val) }));
  }, []);

  const onDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, description: e.target.value }));
  }, []);

  const onRatingChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValues((v) => ({ ...v, rating: val === '' ? undefined : Number(val) }));
  }, []);

  const onDiscountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValues((v) => ({ ...v, discount: val === '' ? undefined : Number(val) }));
  }, []);

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

  // File is uploaded during submit (mirrors TicketCenter)

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
        // Require authentication (mirrors TicketCenter behavior)
        const uid = auth?.currentUser?.uid;
        if (!uid) {
          alert('You must be signed in to add a device.');
          setSubmitting(false);
          return;
        }
        // Optional image upload to Firebase Storage (like TicketCenter)
        let uploadedImageUrl: string | undefined;
        if (imageFile) {
          // Store under a shared devices/images/ path (no per-user UID segment)
          const path = `devices/images/${Date.now()}_${imageFile.name}`;
          const ref = storageRef(storage, path);
          await uploadBytes(ref, imageFile);
          uploadedImageUrl = await getDownloadURL(ref);
        }

        // Build payload and omit empty optional fields; dual-write new keys
        const payload: Record<string, any> = {
          deviceName: values.name.trim(),
          type: values.type.trim(),
          serial: values.serial?.trim() || '',
          modelNumber: values.serial?.trim() || '',
          imageUrl: uploadedImageUrl || values.imageUrl?.trim() || '',
          status: values.status,
          assignedToEmail: values.assignedToEmail?.trim() || '',
          location: values.location?.trim() || '',
          price: typeof values.price === 'number' ? values.price : (values.price ? Number(values.price) : null),
          stock: typeof values.stock === 'number' ? values.stock : (values.stock ? Number(values.stock) : null),
          description: values.description?.trim() || '',
          brand: values.brand?.trim() || '',
          rating: typeof values.rating === 'number' ? values.rating : (values.rating ? Number(values.rating) : null),
          discount: typeof values.discount === 'number' ? values.discount : (values.discount ? Number(values.discount) : null),
          warranty: formatWarranty(values.warrantyValue, values.warrantyUnit),
          createdAt: serverTimestamp(),
          createdByUid: auth?.currentUser?.uid ?? null,
          createdByEmail: auth?.currentUser?.email ?? null,
        };
        // Omit empty string or null fields for assignedToEmail and location
        if (!payload.assignedToEmail) delete payload.assignedToEmail;
        if (!payload.location) delete payload.location;
        if (!payload.serial) delete payload.serial;
        if (!payload.modelNumber) delete payload.modelNumber;
        if (!payload.brand) delete payload.brand;
        if (!payload.warranty) delete payload.warranty;
        await addDoc(devicesCollection(db), payload);
        alert('Device added successfully.');
        setValues((v) => ({ ...initialState, assignedToEmail: v.assignedToEmail }));
        setImageFile(null);
        // Stay on this page; the real-time list below will reflect the new device
      } catch (err) {
        console.error('Failed to add device:', err);
        alert('Error adding device. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [values, canSubmit]
  );

  // Handlers: Edit / Delete
  const openEdit = useCallback((d: DeviceDoc) => {
    setEditing(d);
    const parsed = parseWarranty(d.warranty);
    setEditValues({
      name: d.name,
      type: d.type,
      status: d.status,
      serial: d.serial ?? '',
      assignedToEmail: d.assignedToEmail ?? '',
      price: typeof d.price === 'number' ? d.price : undefined,
      stock: typeof d.stock === 'number' ? d.stock : undefined,
      description: d.description ?? '',
      brand: d.brand ?? '',
      rating: typeof d.rating === 'number' ? d.rating : undefined,
      discount: typeof d.discount === 'number' ? d.discount : undefined,
      warrantyValue: parsed.value as any,
      warrantyUnit: parsed.unit as any,
    });
  }, [parseWarranty]);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    const ref = deviceDoc(db, editing.id);
    const nm = (editValues.name ?? '').toString().trim();
    const md = (editValues.serial ?? '').toString().trim();
    const email = (editValues.assignedToEmail ?? '').toString().trim();
    const brand = (editValues.brand ?? '').toString().trim();
    const warranty = formatWarranty(editValues.warrantyValue, editValues.warrantyUnit ?? 'months');
    const update: Record<string, any> = {
      deviceName: nm,
      type: (editValues.type ?? '').toString().trim(),
      status: (editValues.status as 'Active' | 'Inactive') ?? 'Active',
      serial: md,
      modelNumber: md,
      price: typeof editValues.price === 'number' ? editValues.price : null,
      stock: typeof editValues.stock === 'number' ? editValues.stock : null,
      description: (editValues.description ?? '').toString().trim(),
      rating: typeof editValues.rating === 'number' ? editValues.rating : null,
      discount: typeof editValues.discount === 'number' ? editValues.discount : null,
      warranty: warranty,
    };
    // Remove legacy 'name' field if it exists
    update.name = deleteField();
    if (email) update.assignedToEmail = email; else update.assignedToEmail = deleteField();
    if (brand) update.brand = brand; else update.brand = deleteField();
    if (!warranty) update.warranty = deleteField();
    await updateDoc(ref, update);
    setEditing(null);
  }, [editing, editValues, formatWarranty]);

  const removeDevice = useCallback(async (id: string) => {
    if (!confirm('Delete this device? This action cannot be undone.')) return;
    await deleteDoc(deviceDoc(db, id));
  }, []);

  return (
    <>
      

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
          <label htmlFor="serial" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Model No</label>
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
        <div>
          <label htmlFor="imageFile" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Image</label>
          <input
            id="imageFile"
            name="imageFile"
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
            className="mt-1 block w-full text-sm text-gray-900 dark:text-gray-200 file:mr-4 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
          />
        </div>
      </div>

      {/* Brand */}
      <div>
        <label htmlFor="brand" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Brand</label>
        <input
          id="brand"
          name="brand"
          type="text"
          placeholder="e.g., Samsung"
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
          value={values.brand ?? ''}
          onChange={onChange}
        />
      </div>

      {/* Warranty */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Warranty</label>
        <div className="mt-1 grid grid-cols-3 gap-2">
          <input
            id="warrantyValue"
            name="warrantyValue"
            type="number"
            min="0"
            step="1"
            placeholder="e.g., 12"
            className="col-span-2 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
            value={typeof values.warrantyValue === 'number' ? values.warrantyValue : ''}
            onChange={(e) => setValues((v) => ({ ...v, warrantyValue: e.target.value === '' ? undefined : Number(e.target.value) }))}
          />
          <select
            id="warrantyUnit"
            name="warrantyUnit"
            className="block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
            value={values.warrantyUnit ?? 'months'}
            onChange={(e) => setValues((v) => ({ ...v, warrantyUnit: (e.target.value as 'months' | 'years') }))}
          >
            <option value="months">months</option>
            <option value="years">years</option>
          </select>
        </div>
      </div>

      {/* Price & Stock */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="price" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Price</label>
          <input
            id="price"
            name="price"
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g., 99.99"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
            value={values.price ?? ''}
            onChange={onPriceChange}
          />
        </div>
        <div>
          <label htmlFor="stock" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Stock</label>
          <input
            id="stock"
            name="stock"
            type="number"
            min="0"
            step="1"
            placeholder="e.g., 10"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
            value={values.stock ?? ''}
            onChange={onStockChange}
          />
        </div>
      </div>

      {/* Rating & Discount */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="rating" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Rating (0-5)</label>
          <input
            id="rating"
            name="rating"
            type="number"
            min="0"
            max="5"
            step="0.1"
            placeholder="e.g., 4.5"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
            value={values.rating ?? ''}
            onChange={onRatingChange}
          />
        </div>
        <div>
          <label htmlFor="discount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Discount (%)</label>
          <input
            id="discount"
            name="discount"
            type="number"
            min="0"
            max="100"
            step="1"
            placeholder="e.g., 15"
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
            value={values.discount ?? ''}
            onChange={onDiscountChange}
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Short description of the device"
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
          value={values.description ?? ''}
          onChange={onDescriptionChange}
        />
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

      {/* Devices list */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">All Devices</h2>
        {/* Filters */}
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Search by name or model"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
          >
            <option value="">All types</option>
            <option value="Camera">Camera</option>
            <option value="Sensor">Sensor</option>
            <option value="Lock">Lock</option>
            <option value="Thermostat">Thermostat</option>
            <option value="Light">Light</option>
          </select>
          <button
            type="button"
            onClick={() => { setSearch(''); setTypeFilter(''); }}
            className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Clear
          </button>
        </div>
        {loadingDevices ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">Loading devices…</p>
        ) : filteredDevices.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">No devices found.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDevices.map((d) => (
              <div key={d.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 flex gap-3">
                {d.imageUrl ? (
                  <img src={d.imageUrl} alt={d.name} className="w-20 h-20 object-cover rounded" />
                ) : (
                  <div className="w-20 h-20 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs text-gray-500">No Image</div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{d.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded ${d.status === 'Active' ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'}`}>{d.status}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-600 dark:text-gray-300 truncate">Type: {d.type || '-'}</div>
                  {(typeof d.price !== 'undefined') && (
                    <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300 truncate">Price: {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(d.price))}</div>
                  )}
                  {(typeof d.stock !== 'undefined') && (
                    <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300 truncate">Stock: {d.stock}</div>
                  )}
                  {d.serial && (
                    <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300 truncate">Model No: {d.serial}</div>
                  )}
                  {typeof d.warranty !== 'undefined' && d.warranty !== null && d.warranty !== '' && (
                    <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300 truncate">Warranty: {String(d.warranty)}</div>
                  )}
                  {d.description && (
                    <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300 line-clamp-2">{d.description}</div>
                  )}
                  {d.assignedToEmail && (
                    <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300 truncate">Assigned: {d.assignedToEmail}</div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(d)}
                      className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => removeDevice(d.id)}
                      className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Preview Modal */}
      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditing(null)} />
          <div className="relative z-10 w-[95vw] max-w-md bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Edit Device</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
                <input
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
                  value={editValues.name ?? ''}
                  onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
                <select
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
                  value={editValues.type ?? ''}
                  onChange={(e) => setEditValues((v) => ({ ...v, type: e.target.value }))}
                >
                  <option value="">Select a type</option>
                  <option value="Camera">Camera</option>
                  <option value="Sensor">Sensor</option>
                  <option value="Lock">Lock</option>
                  <option value="Thermostat">Thermostat</option>
                  <option value="Light">Light</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                <select
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
                  value={(editValues.status as 'Active' | 'Inactive') ?? 'Active'}
                  onChange={(e) => setEditValues((v) => ({ ...v, status: e.target.value as 'Active' | 'Inactive' }))}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Price</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
                    value={typeof editValues.price === 'number' ? editValues.price : ''}
                    onChange={(e) => setEditValues((v) => ({ ...v, price: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Stock</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
                    value={typeof editValues.stock === 'number' ? editValues.stock : ''}
                    onChange={(e) => setEditValues((v) => ({ ...v, stock: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Model No</label>
                <input
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
                  value={editValues.serial ?? ''}
                  onChange={(e) => setEditValues((v) => ({ ...v, serial: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                <textarea
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
                  value={editValues.description ?? ''}
                  onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Warranty</label>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="col-span-2 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
                    value={typeof (editValues as any).warrantyValue === 'number' ? (editValues as any).warrantyValue : ''}
                    onChange={(e) => setEditValues((v: any) => ({ ...v, warrantyValue: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  />
                  <select
                    className="block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
                    value={(editValues as any).warrantyUnit ?? 'months'}
                    onChange={(e) => setEditValues((v: any) => ({ ...v, warrantyUnit: e.target.value }))}
                  >
                    <option value="months">months</option>
                    <option value="years">years</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Assigned Email</label>
                <input
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500"
                  value={editValues.assignedToEmail ?? ''}
                  onChange={(e) => setEditValues((v) => ({ ...v, assignedToEmail: e.target.value }))}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="px-4 py-2 rounded-md bg-teal-600 text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
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
