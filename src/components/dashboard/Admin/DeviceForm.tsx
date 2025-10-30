import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { db, auth, storage } from '../../../lib/firebase';
import { addDoc, serverTimestamp, onSnapshot, query, orderBy, updateDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { devicesCollection, deviceDoc } from '../../../models/Collections';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

export type DeviceFormValues = {
  name: string;
  type: string;
  modelNumber?: string;
  location?: string;
  serial?: string;
  status: 'Active' | 'Inactive';
  assignedToEmail?: string;
  imageUrl?: string;
  stock?: number;
  price?: number;
  description?: string;
  brand?: string;
  warrantyValue?: number;
  warrantyUnit?: 'months' | 'years';
  documentation?: string;
  customType: string;
  isCustomType: boolean;
};

const initialState: DeviceFormValues = {
  name: '',
  type: '',
  modelNumber: '',
  location: '',
  serial: '',
  status: 'Active',
  assignedToEmail: '',
  imageUrl: '',
  stock: undefined,
  price: undefined,
  description: '',
  brand: '',
  warrantyValue: undefined,
  warrantyUnit: 'months',
  documentation: '',
  customType: '',
  isCustomType: false,
};

export default function DeviceForm() {
  const [values, setValues] = useState<DeviceFormValues>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
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
    documentation?: string;
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

  // Build dynamic type options from devices collection
  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const d of devices) {
      const t = (d.type ?? '').toString().trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [devices]);

  // Edit modal state
  const [editing, setEditing] = useState<null | DeviceDoc>(null);
  type EditValues = Partial<DeviceDoc> & { warrantyValue?: number; warrantyUnit?: 'months' | 'years' };
  const [editValues, setEditValues] = useState<EditValues & { customType: string; isCustomType: boolean }>({
    name: '',
    type: '',
    status: 'Active',
    serial: '',
    assignedToEmail: '',
    stock: undefined,
    description: '',
    brand: '',
    warrantyValue: undefined,
    warrantyUnit: 'months',
    documentation: '',
    price: undefined,
    customType: '',
    isCustomType: false,
  });
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
    const hasValidType = values.isCustomType 
      ? values.customType.trim() !== '' 
      : values.type.trim() !== '';
    return values.name.trim() !== '' && hasValidType && !submitting;
  }, [values.name, values.type, values.customType, values.isCustomType, submitting]);

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
          // Normalize price from Firestore: accept numbers or strings like "₹2,345.00"
          price: typeof data.price === 'number'
            ? data.price
            : (typeof data.price === 'string'
              ? (() => {
                  const cleaned = data.price.replace(/[^0-9.]/g, '');
                  const parsed = cleaned ? parseFloat(cleaned) : NaN;
                  return isNaN(parsed) ? undefined : parsed;
                })()
              : undefined),
          stock: typeof data.stock === 'number' ? data.stock : (typeof data.stock === 'string' ? parseInt(data.stock) : undefined),
          description: data.description ?? '',
          brand: data.brand ?? '',
          rating: typeof data.rating === 'number' ? data.rating : (typeof data.rating === 'string' ? parseFloat(data.rating) : undefined),
          discount: typeof data.discount === 'number' ? data.discount : (typeof data.discount === 'string' ? parseFloat(data.discount) : undefined),
          warranty: data.warranty,
          documentation: data.documentation ?? '',
        };
      });
      setDevices(list);
      setLoadingDevices(false);
    });
    return () => unsub();
  }, []);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const isCheckbox = type === 'checkbox';
    const checked = isCheckbox ? (e.target as HTMLInputElement).checked : undefined;
    
    setValues((v) => ({ 
      ...v, 
      [name]: isCheckbox ? checked : value,
      // Reset custom type when selecting a predefined type
      ...(name === 'type' && value !== 'other' ? { customType: '', isCustomType: false } : {})
    }));
  }, []);

  // Numeric and long-text handlers
  const onStockChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value === '' ? undefined : Number(e.target.value);
    setValues(v => ({ ...v, stock: value }));
  }, []);

  const onDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, description: e.target.value }));
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
    // Removed backend preview fetch. Falling back to embedded iframe only.
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
        
        // Use custom type if provided
        const deviceType = values.isCustomType && values.customType.trim() 
          ? values.customType.trim() 
          : values.type;
        // Optional image upload to Firebase Storage (like TicketCenter)
        let uploadedImageUrl: string | undefined;
        if (imageFile) {
          // Store under devices/images/{uid}/... so rules can authorize owner-or-admin
          const path = `devices/images/${uid}/${Date.now()}_${imageFile.name}`;
          const ref = storageRef(storage, path);
          await uploadBytes(ref, imageFile);
          uploadedImageUrl = await getDownloadURL(ref);
        }

        // Build payload and omit empty optional fields; dual-write new keys
        const payload: Record<string, any> = {
          deviceName: values.name.trim(),
          type: deviceType,
          modelNumber: values.modelNumber?.trim() || '',
          imageUrl: uploadedImageUrl || values.imageUrl?.trim() || '',
          assignedToEmail: values.assignedToEmail?.trim() || '',
          location: values.location?.trim() || '',
          stock: typeof values.stock === 'number' ? values.stock : (values.stock ? Number(values.stock) : null),
          price: typeof values.price === 'number' ? values.price : (values.price ? Number(values.price) : null),
          description: values.description?.trim() || '',
          brand: values.brand?.trim() || '',
          warranty: formatWarranty(values.warrantyValue, values.warrantyUnit),
          documentation: values.documentation?.trim() || '',
          status: values.status || 'Active', // Default to 'Active' if not set
          createdAt: serverTimestamp(),
          createdByUid: auth?.currentUser?.uid ?? null,
          createdByEmail: auth?.currentUser?.email ?? null,
        };
        // Omit empty or default fields
        if (!payload.assignedToEmail) delete payload.assignedToEmail;
        if (!payload.location) delete payload.location;
        if (!payload.status) delete payload.status;
        if (!payload.modelNumber) delete payload.modelNumber;
        if (!payload.brand) delete payload.brand;
        if (!payload.warranty) delete payload.warranty;
        if (!payload.documentation) delete payload.documentation;
        if (typeof payload.price === 'undefined' || payload.price === null) delete payload.price;
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
    // A type is considered custom if it's not in the current dynamic options list
    const isCustomType = !typeOptions.includes(d.type);
    setEditImageFile(null);
    setEditImagePreview(null);
    
    setEditValues({
      name: d.name,
      type: isCustomType ? '' : d.type,
      status: d.status,
      serial: d.serial ?? '',
      assignedToEmail: d.assignedToEmail ?? '',
      stock: typeof d.stock === 'number' ? d.stock : undefined,
      description: d.description ?? '',
      brand: d.brand ?? '',
      price: typeof d.price === 'number' ? d.price : (typeof d.price === 'string' ? parseFloat(d.price) : undefined),
      documentation: d.documentation ?? '',
      warrantyValue: parsed.value as any,
      warrantyUnit: parsed.unit as any,
      customType: isCustomType ? d.type : '',
      isCustomType,
    });
  }, [parseWarranty, typeOptions]);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    const ref = deviceDoc(db, editing.id);
    const nm = (editValues.name ?? '').toString().trim();
    const md = (editValues.serial ?? '').toString().trim();
    const email = (editValues.assignedToEmail ?? '').toString().trim();
    const brand = (editValues.brand ?? '').toString().trim();
    const warranty = formatWarranty(editValues.warrantyValue, editValues.warrantyUnit ?? 'months');
    // Respect custom type when 'Other' is chosen
    const editDeviceType = (editValues as any).isCustomType
      ? ((editValues as any).customType ?? '').toString().trim()
      : ((editValues.type ?? '') as string).toString().trim();
    if ((editValues as any).isCustomType && !editDeviceType) {
      alert('Please enter a device type.');
      return;
    }
    // Optional image upload if user selected a new image in edit modal
    let uploadedImageUrl: string | undefined;
    const oldImageUrl = editing.imageUrl;
    if (editImageFile) {
      try {
        const path = `devices/images/${auth?.currentUser?.uid ?? 'unknown'}/${Date.now()}_${editImageFile.name}`;
        const imgRef = storageRef(storage, path);
        await uploadBytes(imgRef, editImageFile);
        uploadedImageUrl = await getDownloadURL(imgRef);
      } catch (e) {
        console.error('Failed to upload image:', e);
        alert('Failed to upload image. Please try again or choose a different file.');
        return;
      }
    }
    const update: Record<string, any> = {
      deviceName: nm,
      type: editDeviceType,
      status: (editValues.status as 'Active' | 'Inactive') ?? 'Active',
      modelNumber: md,
      stock: typeof editValues.stock === 'number' ? editValues.stock : null,
      description: (editValues.description ?? '').toString().trim(),
      warranty: warranty,
    };
    // Remove legacy 'name' field if it exists
    update.name = deleteField();
    if (uploadedImageUrl) update.imageUrl = uploadedImageUrl;
    if (email) update.assignedToEmail = email; else update.assignedToEmail = deleteField();
    if (brand) update.brand = brand; else update.brand = deleteField();
    // Always remove legacy 'serial' field so only 'modelNumber' exists
    (update as any).serial = deleteField();
    // Handle price field
    if (typeof editValues.price === 'number') (update as any).price = editValues.price; else (update as any).price = deleteField();
    if (!warranty) update.warranty = deleteField();
    const docu = (editValues.documentation ?? '').toString().trim();
    if (docu) update.documentation = docu; else update.documentation = deleteField();
    await updateDoc(ref, update);
    // After successful update, cleanup previous image in storage if replaced
    if (uploadedImageUrl && oldImageUrl) {
      try {
        const oldRef = storageRef(storage, oldImageUrl);
        await deleteObject(oldRef);
      } catch (e) {
        console.warn('Could not delete old image from storage:', e);
      }
    }
    setEditing(null);
    setEditImageFile(null);
    setEditImagePreview(null);
  }, [editing, editValues, formatWarranty, editImageFile]);

  const removeDevice = useCallback(async (id: string) => {
    if (!confirm('Delete this device? This action cannot be undone.')) return;
    await deleteDoc(deviceDoc(db, id));
  }, []);

  // Lock background scroll when edit modal is open, but allow scrolling inside the modal
  useEffect(() => {
    if (!editing) return;
    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY;
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';

    return () => {
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.width = '';
      body.style.overflow = '';
      html.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [editing]);

  // Use native scrolling of the modal content, but also add a non-blocking wheel handler
  // that does NOT call preventDefault to avoid passive listener warnings. This ensures
  // the scroll delta is applied even when the page is locked from background scrolling.
  const onModalWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // Do not call preventDefault here to avoid passive listener warnings
    el.scrollTop += e.deltaY;
  }, []);

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white inline-flex items-center gap-2">
          Devices
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-cpu h-5 w-5" aria-hidden="true"><path d="M12 20v2"></path><path d="M12 2v2"></path><path d="M17 20v2"></path><path d="M17 2v2"></path><path d="M2 12h2"></path><path d="M2 17h2"></path><path d="M2 7h2"></path><path d="M20 12h2"></path><path d="M20 17h2"></path><path d="M20 7h2"></path><path d="M7 20v2"></path><path d="M7 2v2"></path><rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="8" y="8" width="8" height="8" rx="1"></rect></svg>
        </h1>
        <div className="flex items-center gap-2">
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center px-4 py-2 rounded-md bg-teal-600 text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
            >
              Add New Device
            </button>
          )}
          {showForm && (
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="inline-flex items-center px-4 py-2 rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Hide Form
            </button>
          )}
        </div>
      </div>

      {showForm && (
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
            className="mt-1 block w-full rounded-md border-2 border-gray-600 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white shadow focus:border-gray-800 focus:ring-teal-600 px-3 py-2"
            value={values.name}
            onChange={onChange}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Device Type</label>
          <select
            id="type"
            name="type"
            required
            className="mt-1 block w-full rounded-md border-2 border-gray-600 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white shadow focus:border-gray-800 focus:ring-teal-600 px-3 py-2"
            value={values.isCustomType ? 'other' : values.type}
            onChange={(e) => {
              const isCustom = e.target.value === 'other';
              setValues(v => ({
                ...v,
                type: isCustom ? '' : e.target.value,
                isCustomType: isCustom
              }));
            }}
          >
            <option value="">Select a type</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
            <option value="other">Other (specify below)</option>
          </select>
          {values.isCustomType && (
            <div className="mt-2">
              <input
                type="text"
                name="customType"
                placeholder="Enter device type"
                className="mt-1 block w-full rounded-md border-2 border-gray-600 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white shadow focus:border-gray-800 focus:ring-teal-600 px-3 py-2"
                value={values.customType}
                onChange={onChange}
                required
              />
            </div>
          )}
        </div>

        <div>
          <label htmlFor="modelNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Model Number</label>
          <input
            id="modelNumber"
            name="modelNumber"
            type="text"
            placeholder="e.g., XJ-1000"
            className="mt-1 block w-full rounded-md border-2 border-gray-600 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white shadow focus:border-gray-800 focus:ring-teal-600 px-3 py-2"
            value={values.modelNumber ?? ''}
            onChange={onChange}
          />
        </div>
        </div>

        {/* Brand and Image */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label htmlFor="brand" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Brand</label>
          <input
            id="brand"
            name="brand"
            type="text"
            placeholder="e.g., Samsung"
            className="mt-1 block w-full rounded-md border-2 border-gray-600 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white shadow focus:border-gray-800 focus:ring-teal-600 px-3 py-2"
            value={values.brand ?? ''}
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
            className="mt-1 block w-full text-sm text-gray-900 dark:text-gray-200 file:mr-4 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
            onChange={(e) => setImageFile(e.target.files?.[0] || null)}
          />
        </div>
      </div>

      {/* Warranty */}
      <div className="grid grid-cols-1">
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
              className="block w-full rounded-md border-2 border-gray-600 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white shadow focus:border-gray-800 focus:ring-teal-600 px-3 py-2"
              value={typeof values.warrantyValue === 'number' ? values.warrantyValue : ''}
              onChange={(e) => setValues((v) => ({ ...v, warrantyValue: e.target.value === '' ? undefined : Number(e.target.value) }))}
            />
            <select
              id="warrantyUnit"
              name="warrantyUnit"
              className="block w-full rounded-md border-2 border-gray-600 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white shadow focus:border-gray-800 focus:ring-teal-600 px-3 py-2 col-span-2"
              value={values.warrantyUnit ?? 'months'}
              onChange={(e) => setValues((v) => ({ ...v, warrantyUnit: (e.target.value as 'months' | 'years') }))}
            >
              <option value="months">months</option>
              <option value="years">years</option>
            </select>
          </div>
        </div>
      </div>

      {/* Price and Stock */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="price" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Price (₹)</label>
          <input
            id="price"
            name="price"
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g., 99.99"
            className="mt-1 block w-full rounded-md border-2 border-gray-600 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white shadow focus:border-gray-800 focus:ring-teal-600 px-3 py-2"
            value={values.price ?? ''}
            onChange={(e) => setValues(v => ({ ...v, price: e.target.value === '' ? undefined : Number(e.target.value) }))}
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
            className="mt-1 block w-full rounded-md border-2 border-gray-600 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white shadow focus:border-gray-800 focus:ring-teal-600 px-3 py-2"
            value={values.stock ?? ''}
            onChange={onStockChange}
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
          className="mt-1 block w-full rounded-md border-2 border-gray-600 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white shadow focus:border-gray-800 focus:ring-teal-600 px-3 py-2"
          value={values.description ?? ''}
          onChange={onDescriptionChange}
        />
      </div>

{/* Device Documentation */}
      <div>
        <label htmlFor="documentation" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Device Documentation</label>
        <input
          id="documentation"
          name="documentation"
          type="text"
          placeholder="Link or notes for device documentation"
          className="mt-1 block w-full rounded-md border-2 border-gray-600 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white shadow focus:border-gray-800 focus:ring-teal-600 px-3 py-2"
          value={values.documentation ?? ''}
          onChange={onChange}
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button type="submit" className="inline-flex items-center px-4 py-2 rounded-md bg-teal-600 text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500" disabled={!canSubmit}>
          {submitting ? 'Saving…' : 'Save Device'}
        </button>
      </div>
    </form>

        </>
      )}

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
            className="block w-full rounded-md border-2 border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500 px-3 py-2"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="block w-full rounded-md border-2 border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500 px-3 py-2"
          >
            <option value="">All types</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
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
              <div key={d.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-4 flex gap-3 transition-shadow hover:shadow-md dark:hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-600">
                {d.imageUrl ? (
                  <img src={d.imageUrl} alt={d.name} className="w-20 h-20 object-cover rounded" />
                ) : (
                  <div className="w-20 h-20 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs text-gray-500">No Image</div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{d.name}</h3>
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
          <div
            className="relative z-10 w-[95vw] max-w-md max-h-[90vh] bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 overflow-y-auto modal-scroll-content touch-pan-y overscroll-contain"
            style={{ WebkitOverflowScrolling: 'touch' as any }}
            onWheel={onModalWheel}
            onWheelCapture={onModalWheel}
            tabIndex={0}
          >
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Edit Device</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
                <input
                  className="mt-1 block w-full rounded-md border-2 border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500 px-3 py-2"
                  value={editValues.name ?? ''}
                  onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Image</label>
                <div className="mt-1 flex items-center gap-3">
                  {editImagePreview ? (
                    <img src={editImagePreview} alt={editValues.name ?? 'Device'} className="w-16 h-16 object-cover rounded" />
                  ) : (
                    editing?.imageUrl ? (
                      <img src={editing.imageUrl} alt={editValues.name ?? 'Device'} className="w-16 h-16 object-cover rounded" />
                    ) : (
                      <div className="w-16 h-16 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs text-gray-500">No Image</div>
                    )
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="block w-full text-sm text-gray-900 dark:text-gray-200 file:mr-4 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setEditImageFile(file);
                      if (file) {
                        const url = URL.createObjectURL(file);
                        setEditImagePreview(url);
                      } else {
                        setEditImagePreview(null);
                      }
                    }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
                <select
                  className="mt-1 block w-full rounded-md border-2 border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500 px-3 py-2"
                  value={(editValues as any).isCustomType ? 'other' : (editValues.type ?? '')}
                  onChange={(e) => {
                    const isCustom = e.target.value === 'other';
                    setEditValues((v: any) => ({
                      ...v,
                      type: isCustom ? '' : e.target.value,
                      isCustomType: isCustom,
                      // clear customType when switching back to predefined types
                      ...(isCustom ? {} : { customType: '' }),
                    }));
                  }}
                >
                  <option value="">Select a type</option>
                  {typeOptions.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  <option value="other">Other (specify below)</option>
                </select>
                {(editValues as any).isCustomType && (
                  <div className="mt-2">
                    <input
                      type="text"
                      placeholder="Enter device type"
                      className="mt-1 block w-full rounded-md border-2 border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500 px-3 py-2"
                      value={(editValues as any).customType ?? ''}
                      onChange={(e) => setEditValues((v: any) => ({ ...v, customType: e.target.value }))}
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Price</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1 block w-full rounded-md border-2 border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500 px-3 py-2"
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
                    className="mt-1 block w-full rounded-md border-2 border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500 px-3 py-2"
                    value={typeof editValues.stock === 'number' ? editValues.stock : ''}
                    onChange={(e) => setEditValues((v) => ({ ...v, stock: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Model No</label>
                <input
                  className="mt-1 block w-full rounded-md border-2 border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500 px-3 py-2"
                  value={editValues.serial ?? ''}
                  onChange={(e) => setEditValues((v) => ({ ...v, serial: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                <textarea
                  rows={3}
                  className="mt-1 block w-full rounded-md border-2 border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500 px-3 py-2"
                  value={editValues.description ?? ''}
                  onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Device Documentation</label>
                <input
                  type="text"
                  placeholder="Link or notes for device documentation"
                  className="mt-1 block w-full rounded-md border-2 border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500 px-3 py-2"
                  value={(editValues as any).documentation ?? ''}
                  onChange={(e) => setEditValues((v: any) => ({ ...v, documentation: e.target.value }))}
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
                    className="block w-full rounded-md border-2 border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-teal-500 focus:ring-teal-500 px-3 py-2"
                    value={(editValues as any).warrantyUnit ?? 'months'}
                    onChange={(e) => setEditValues((v: any) => ({ ...v, warrantyUnit: e.target.value }))}
                  >
                    <option value="months">months</option>
                    <option value="years">years</option>
                  </select>
                </div>
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
