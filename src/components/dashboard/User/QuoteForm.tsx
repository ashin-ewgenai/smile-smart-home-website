import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import EstimatePDF from '../Admin/EstimatePDF';
import LocationSelector from '../../common/LocationSelector';
import { auth, db } from '../../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { addDoc, collection, serverTimestamp, onSnapshot, query, where, orderBy, getDocs, getDoc, limit, deleteDoc, doc, updateDoc, setDoc, Timestamp } from 'firebase/firestore';

import type { DocumentData } from 'firebase/firestore';
import { estimationQuoteDoc, estimationQuotesCollection, type EstimationQuote, adminNotificationsCollection } from '@/models/Collections';
import { useQuoteRequest } from '@/hooks/useQuoteRequest';
import { MessageCircle, CheckCircle2, Loader2, Zap, Package } from 'lucide-react';
import { quoteTemplates } from '../../../data/quoteTemplates';
import { motion, AnimatePresence as FramerAnimatePresence } from 'framer-motion';

// ... (existing imports)

type QuoteType = 'New Installation' | 'Upgrade Existing Setup' | 'Maintenance' | 'Custom Requirement';

interface FormData {
  quoteType: QuoteType | '';
  // Step 1
  
  // Step 2: dynamic fields
  propertyType?: string; // for New Installation
  numberOfRooms?: number;
  devicesRequired?: string[];
  
  roomsAlreadySmart?: string[]; // for Upgrade
  newRoomsToAutomate?: string[];
  brandPreference?: string;
  
  maintenanceRooms?: string[]; // for Maintenance
  issueType?: string;
  
  customDetails?: string; // for Custom
  
  // Step 3
  timeline: string;
  budget: string;
  // Location (India only)
  locationState?: string;
  locationDistrict?: string;
  
  // Common
  details?: string;
  whatsappNumber?: string;
  templateId?: string;
}

type QuoteFormProps = {
  userEmail?: string | null;
  className?: string;
  onSubmitted?: (docId: string | undefined) => void;
};

const OPTIONS = [
  { value: '', label: 'Select a location', disabled: true },
  { value: 'hall', label: 'Hall' },
  { value: 'room', label: 'Room' },
  { value: 'house', label: 'House' },
  { value: 'office', label: 'Office' },
  { value: 'garden', label: 'Garden' },
  { value: 'other', label: 'Other' },
];

const QUOTE_TYPES: { value: QuoteType; label: string }[] = [
  { value: 'New Installation', label: 'New Installation' },
  { value: 'Upgrade Existing Setup', label: 'Upgrade Existing Setup' },
  // Maintenance option removed
  { value: 'Custom Requirement', label: 'Custom Requirement' },
];

const DEVICE_OPTIONS = [
  { value: 'Smart Lights', label: 'Smart Lights' },
  { value: 'Smart Switches', label: 'Smart Switches' },
  { value: 'CCTV', label: 'CCTV' },
  { value: 'Thermostat', label: 'Thermostat' },
  { value: 'Curtains', label: 'Curtains' },
];

const ROOM_OPTIONS = [
  { value: 'living', label: 'Living Room' },
  { value: 'bedroom1', label: 'Bedroom 1' },
  { value: 'bedroom2', label: 'Bedroom 2' },
  { value: 'bedroom3', label: 'Bedroom 3' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'bathroom1', label: 'Bathroom 1' },
  { value: 'bathroom2', label: 'Bathroom 2' },
  { value: 'garage', label: 'Garage' },
  { value: 'garden', label: 'Garden' },
];

const ISSUE_OPTIONS = [
  { value: 'Connectivity', label: 'Connectivity' },
  { value: 'Device not working', label: 'Device not working' },
  { value: 'App issue', label: 'App issue' },
  { value: 'Other', label: 'Other' },
];

const TIMELINE_OPTIONS = [
  { value: 'ASAP', label: 'ASAP' },
  { value: '1–2 weeks', label: '1–2 weeks' },
  { value: 'Flexible', label: 'Flexible' },
];

type QuoteDoc = {
  id: string;
  createdAt?: { seconds: number; nanoseconds: number };
  status?: string;
  quoteType?: string;
  budget?: string;
  budgetCurrency?: string;
  details?: string;
  // Possible admin bill/reply shape
  bill?: {
    total?: number | string;
    currency?: string;
    items?: Array<{ name?: string; qty?: number; price?: number | string }>;
    notes?: string;
  } | null;
  adminReply?: string;
} & DocumentData;

const MAX_QUOTES = 4;

const formatEstimationDate = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === 'object' && 'toDate' in (value as any) && typeof (value as any).toDate === 'function') {
    try {
      return (value as any).toDate().toLocaleDateString();
    } catch {
      return '';
    }
  }
  return String(value);
};

const logEstimationFetchError = (err: unknown, context: string) => {
  const code = typeof err === 'object' && err !== null && 'code' in err ? (err as any).code : undefined;
  if (code === 'permission-denied' || code === 'missing-permissions') {
    console.debug(`[QuoteForm] Estimation fetch skipped (${context}) due to permissions`, err);
  } else {
    console.warn(`[QuoteForm] Error ${context}`, err);
  }
};

export default function QuoteForm({ userEmail: emailProp, className = '', onSubmitted }: QuoteFormProps) {
  // Handle wheel events for scrollable content
  const onContentWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // Do NOT call preventDefault to avoid passive listener issues
    el.scrollTop += e.deltaY;
  }, []);

  const userEmail = useMemo(() => emailProp ?? (typeof window !== 'undefined' ? localStorage.getItem('userEmail') : null), [emailProp]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  // Persist form progress across refresh
  const FORM_STORAGE_KEY = 'quoteFormData';
  const STEP_STORAGE_KEY = 'quoteFormStep';

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    quoteType: '',
    timeline: '',
    budget: '',
    locationState: '',
    locationDistrict: '',
    whatsappNumber: '',
    templateId: '',
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const { notifyQuoteAction, whatsappStatus } = useQuoteRequest();
  const [waManualLink, setWaManualLink] = useState<string | null>(null);
  // Device options fetched from Firestore (fallback to static options if fetch fails)
  const [availableDevices, setAvailableDevices] = useState<{ value: string; label: string }[]>(DEVICE_OPTIONS);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const inputBase = 'w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-600 dark:placeholder-gray-400 caret-teal-500 focus:outline-none focus:ring-2 focus:ring-teal';

  // Old quotes state
  const [quotes, setQuotes] = useState<QuoteDoc[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [showOldQuotes, setShowOldQuotes] = useState(false);
  const [currentUid, setCurrentUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);


  // Active quotes (exclude inactive statuses) for submission limit
  const activeQuotesCount = useMemo(() => {
    const active = quotes.filter(q => {
      const status = String(q.status || 'Pending').toLowerCase();
      return !['cancelled', 'rejected', 'completed', 'confirmed'].includes(status);
    });
    return active.length;
  }, [quotes]);
  
  // Check if user has any pending quotes
  const hasPendingQuotes = useMemo(() => {
    return quotes.some((q) => String(q.status || 'Pending').toLowerCase() === 'pending');
  }, [quotes]);

  // Modal state for viewing a quote + estimation
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<QuoteDoc | null>(null);
  const [estimation, setEstimation] = useState<(EstimationQuote & { id?: string }) | null>(null);
  const [estLoading, setEstLoading] = useState(false);
  
  // Lock background scroll when modal is open
  useEffect(() => {
    if (!modalOpen) return;
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
  }, [modalOpen]);
  // User's installed devices (from /User_Devices by uid)
  const [userDevices, setUserDevices] = useState<string[]>([]);

  // Deletion state for pending quotes
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openQuoteModal = async (q: QuoteDoc) => {
    setSelectedQuote(q);
    setModalOpen(true);
    setEstimation(null);
    setEstLoading(true);
    const expectedRefId = (q as any).estimationQuoteId as string | undefined;
    const matchesSelectedQuote = (est: Partial<EstimationQuote> | undefined, docId?: string) => {
      if (!est) return false;
      if (expectedRefId && (docId === expectedRefId || est.quoteId === expectedRefId)) return true;
      if (docId === q.id) return true;
      if (est.quoteId === q.id) return true;
      if (est.originalQuoteId === q.id) return true;
      return false;
    };
    try {
      // 1) Direct reference via estimationQuoteId stored on quote
      const directId = expectedRefId;
      if (directId) {
        try {
          const directSnap = await getDocs(query(
            estimationQuotesCollection(db),
            where('quoteId', '==', directId),
            limit(1)
          ));
          if (!directSnap.empty) {
            const docSnap = directSnap.docs[0];
            const payload = docSnap.data() as EstimationQuote;
            if (matchesSelectedQuote(payload, docSnap.id)) {
              setEstimation({ id: docSnap.id, ...payload });
              return;
            }
          }
          const directDoc = await getDoc(estimationQuoteDoc(db, directId));
          if (directDoc.exists()) {
            const payload = directDoc.data() as EstimationQuote;
            if (matchesSelectedQuote(payload, directDoc.id)) {
              setEstimation({ id: directDoc.id, ...payload });
              return;
            }
          }
        } catch (err) {
          logEstimationFetchError(err, 'fetching estimation via estimationQuoteId');
        }
      }

      // 2) Try using quoteId itself as estimation document id
      try {
        const quoteDocSnap = await getDoc(estimationQuoteDoc(db, q.id));
        if (quoteDocSnap.exists()) {
          const payload = quoteDocSnap.data() as EstimationQuote;
          if (matchesSelectedQuote(payload, quoteDocSnap.id)) {
            setEstimation({ id: quoteDocSnap.id, ...payload });
            return;
          }
        }
      } catch (err) {
        logEstimationFetchError(err, 'fetching estimation via quoteId doc');
      }

      // 3) Query by quoteId field in Estimation_Quote collection
      try {
        const byQuoteId = await getDocs(query(
          estimationQuotesCollection(db),
          where('quoteId', '==', q.id),
          limit(5)
        ));
        for (const docSnap of byQuoteId.docs) {
          const payload = docSnap.data() as EstimationQuote;
          if (matchesSelectedQuote(payload, docSnap.id)) {
            setEstimation({ id: docSnap.id, ...payload });
            return;
          }
        }
      } catch (err) {
        logEstimationFetchError(err, 'querying estimation by quoteId');
      }

      // 4) Query by originalQuoteId field
      try {
        const byOriginal = await getDocs(query(
          estimationQuotesCollection(db),
          where('originalQuoteId', '==', q.id),
          limit(5)
        ));
        for (const docSnap of byOriginal.docs) {
          const payload = docSnap.data() as EstimationQuote;
          if (matchesSelectedQuote(payload, docSnap.id)) {
            setEstimation({ id: docSnap.id, ...payload });
            return;
          }
        }
      } catch (err) {
        logEstimationFetchError(err, 'querying estimation by originalQuoteId');
      }

      // 5) Query by user email if available
      const email = (q as any).userEmail || (q as any).customerEmail;
      if (email) {
        try {
          const byEmail = await getDocs(query(
            estimationQuotesCollection(db),
            where('customerEmail', '==', email),
            limit(5)
          ));
          for (const docSnap of byEmail.docs) {
            const payload = docSnap.data() as EstimationQuote;
            if (matchesSelectedQuote(payload, docSnap.id)) {
              setEstimation({ id: docSnap.id, ...payload });
              return;
            }
          }
        } catch (err) {
          logEstimationFetchError(err, 'querying estimation by customerEmail');
        }
      }

      // 6) Query by uid if present on quote
      const customerUid = (q as any).userUid || (q as any).uid;
      if (customerUid) {
        try {
          const byUid = await getDocs(query(
            estimationQuotesCollection(db),
            where('uid', '==', customerUid),
            limit(5)
          ));
          for (const docSnap of byUid.docs) {
            const payload = docSnap.data() as EstimationQuote;
            if (matchesSelectedQuote(payload, docSnap.id)) {
              setEstimation({ id: docSnap.id, ...payload });
              return;
            }
          }
        } catch (err) {
          logEstimationFetchError(err, 'querying estimation by uid');
        }
      }
    } catch (err) {
      console.warn('[QuoteForm] Unexpected error fetching estimation', err);
    }
    finally {
      setEstLoading(false);
    }
  };

  // Cancel a pending quote (soft delete)
  const handleCancelQuote = async (q: QuoteDoc) => {
    if (!q?.id) return;
    if (String(q.status || 'Pending').toLowerCase() !== 'pending') {
      showToast('Only pending quotes can be cancelled.');
      return;
    }
    if (!auth.currentUser) {
      setSubmitError('Please sign in to cancel your quote.');
      try {
        // @ts-ignore
        if (typeof window !== 'undefined' && (window as any).__authOpen) (window as any).__authOpen('login');
      } catch {}
      return;
    }
    // Proceed with cancellation immediately
    try {
      setUpdatingId(q.id);
      await updateDoc(doc(db, 'quotes', q.id), {
        status: 'Cancelled',
        cancelledAt: serverTimestamp(),
        cancelledByUid: auth.currentUser?.uid ?? null,
      } as any);
      showToast('Quote cancelled.');
    } catch (error: any) {
      console.error('Failed to cancel quote:', error);
      if (error?.code === 'permission-denied') {
        setSubmitError("You don't have permission to cancel this quote.");
      } else {
        setSubmitError(error?.message || 'Failed to cancel quote.');
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const closeModal = () => { setModalOpen(false); setSelectedQuote(null); setEstimation(null); };

  // Local toast notifications
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error'; entering: boolean }>>([]);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, type, entering: true }]);
    // Trigger enter transition on next frame
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, entering: false } : t)));
    }, 20);
    // Auto dismiss in 4s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Load saved progress on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(FORM_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          // Normalize legacy 'Maintenance' value since option was removed
          const normalized = {
            ...parsed,
            quoteType: parsed.quoteType === 'Maintenance' ? '' : parsed.quoteType,
          };
          setFormData(prev => ({ ...prev, ...normalized }));
        }
      }
      const stepRaw = localStorage.getItem(STEP_STORAGE_KEY);
      if (stepRaw) {
        const s = parseInt(stepRaw, 10);
        if (!Number.isNaN(s) && s >= 1 && s <= 4) setCurrentStep(s);
      }
    } catch {}
  }, []);

  // Save progress whenever it changes
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(formData));
      localStorage.setItem(STEP_STORAGE_KEY, String(currentStep));
    } catch {}
  }, [formData, currentStep, hydrated]);

  // Fetch device list from `/Devices` collection (use 'deviceName' field)
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'Devices'), orderBy('deviceName', 'asc')));
        const opts = snap.docs
          .map((d) => (d.data() as any)?.deviceName)
          .filter((name: any) => typeof name === 'string' && name.trim().length > 0)
          .map((name: string) => ({ value: name, label: name }));
        if (opts.length > 0) setAvailableDevices(opts);
      } catch {
        // Keep default static options on error
      }
    })();
  }, []);

  // Track auth state and subscribe to user's previous quotes by uid only
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const off = onAuthStateChanged(auth, (u) => {
      setCurrentUid(u?.uid ?? null);
    });
    return () => off();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!currentUid) {
      setQuotes([]);
      return;
    }
    setQuotesLoading(true);
    setQuotesError(null);
    // Query strictly by the authenticated user's UID. We sort client-side to avoid needing a composite index.
    const qRef = query(
      collection(db, 'quotes'),
      where('userUid', '==', currentUid)
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const rows: QuoteDoc[] = [];
        snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as DocumentData) } as QuoteDoc));
        // Client-side sort by createdAt desc
        rows.sort((a, b) => {
          const ta = (a.createdAt as any)?.seconds ?? 0;
          const tb = (b.createdAt as any)?.seconds ?? 0;
          return tb - ta;
        });
        setQuotes(rows);
        setQuotesLoading(false);
      },
      (err) => {
        console.error('Failed to load quotes:', err);
        setQuotesError(err?.message || 'Failed to load quotes');
        setQuotesLoading(false);
      }
    );
    return () => unsub();
  }, [currentUid]);

  // Fetch user's installed devices from '/User_Devices' by uid
  useEffect(() => {
    (async () => {
      try {
        if (!currentUid) { setUserDevices([]); return; }
        const snap = await getDocs(query(collection(db, 'User_Devices'), where('uid', '==', currentUid)));
        const names = snap.docs
          .map((d) => (d.data() as any)?.deviceName)
          .filter((x: any) => typeof x === 'string' && x.trim().length > 0);
        setUserDevices(names);
      } catch {
        setUserDevices([]);
      }
    })();
  }, [currentUid]);

  function validateStep(step: number): boolean {
    const e: Record<string, string> = {};
    const t = formData.quoteType;
    if (step === 1) {
      if (!t) e.quoteType = 'Please select a quote type.';
    }
    if (step === 2) {
      if (t === 'New Installation') {
        if (!formData.propertyType) e.propertyType = 'Property type is required.';
        if (!formData.numberOfRooms || Number(formData.numberOfRooms) < 1) e.numberOfRooms = 'Enter at least 1 room.';
        if (!formData.devicesRequired || formData.devicesRequired.length === 0) e.devicesRequired = 'Select at least one device.';
      } else if (t === 'Upgrade Existing Setup') {
        const hasAny = (userDevices.length || 0) > 0 || (formData.newRoomsToAutomate?.length || 0) > 0;
        if (!hasAny) e.roomsAlreadySmart = 'Select existing and/or new rooms to automate.';
      } else if (t === 'Maintenance') {
        if (!formData.maintenanceRooms || formData.maintenanceRooms.length === 0) e.maintenanceRooms = 'Select at least one room.';
        if (!formData.issueType) e.issueType = 'Select an issue type.';
      } else if (t === 'Custom Requirement') {
        if (!formData.customDetails || formData.customDetails.trim().length < 10) e.customDetails = 'Provide at least 10 characters.';
      }
    }
    if (step === 3) {
      if (!formData.timeline) e.timeline = 'Timeline is required.';
      if (!formData.budget || !/^\s*(₹|Rs\.?\s*)?[0-9,]+(?:\s*-\s*(₹|Rs\.?\s*)?[0-9,]+)?\s*$/.test(formData.budget)) {
        e.budget = 'Enter INR amount or range, e.g., ₹1,000 or 5,000-10,000.';
      }
      if (!formData.locationState) e.locationState = 'Please select a state/UT.';
      if (!formData.locationDistrict) e.locationDistrict = 'Please select a district.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const handleNext = () => {
    if (!validateStep(currentStep)) return;
    setCurrentStep(prev => Math.min(prev + 1, 4));
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = quoteTemplates.find(t => t.id === templateId);
    if (!template) return;

    setSelectedTemplateId(templateId);
    setFormData(prev => ({
      ...prev,
      quoteType: 'New Installation',
      propertyType: template.propertyType || '',
      numberOfRooms: template.numberOfRooms || 1,
      devicesRequired: template.devices,
      templateId: templateId,
      timeline: 'Flexible',
      budget: template.estimatedPrice || ''
    }));
    
    // Move to step 3 so the user can add Location manually 
    setCurrentStep(3);
    showToast(`${template.name} loaded with default timeline & budget! Please add your location.`);
  };

  const handlePrev = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
    // Clear field error on change
    setErrors(prev => {
      const n = { ...prev };
      delete n[name];
      return n;
    });
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked } = e.target;
    if (name === 'devicesRequired') {
      setFormData(prev => {
        const devices = prev.devicesRequired || [];
        return checked
          ? { ...prev, devicesRequired: [...devices, value] }
          : { ...prev, devicesRequired: devices.filter(device => device !== value) };
      });
    } else if (name === 'newRoomsToAutomate') {
      // Reusing newRoomsToAutomate to store selected new devices to automate
      setFormData(prev => {
        const arr = prev.newRoomsToAutomate || [];
        return checked
          ? { ...prev, newRoomsToAutomate: [...arr, value] }
          : { ...prev, newRoomsToAutomate: arr.filter(v => v !== value) };
      });
    }
    // Clear any error for the field
    setErrors(prev => { const n = { ...prev }; delete n[name]; return n; });
  };

  const handleMultiSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name } = e.target;
    const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
    setFormData(prev => ({
      ...prev,
      [name]: selectedOptions,
    }));
    setErrors(prev => {
      const n = { ...prev };
      delete n[name];
      return n;
    });
  };

  // Location change from LocationSelector
  const handleLocationChange = (loc: { country: 'India'; state: string; district: string }) => {
    setFormData(prev => ({
      ...prev,
      locationState: loc.state,
      locationDistrict: loc.district,
    }));
    setErrors(prev => {
      const n = { ...prev };
      delete n.locationState;
      delete n.locationDistrict;
      return n;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    setWaManualLink(null);

    if (!window.navigator.onLine) {
      showToast('No internet connection. Please check your network and try again.', 'error');
      return;
    }

    if (currentStep !== 4) {
      handleNext();
      return;
    }
    // Validate all final requirements before submit
    if (!validateStep(2) || !validateStep(3) || !validateStep(1)) {
      return;
    }

    // Require authentication to submit (use stable currentUid captured from onAuthStateChanged)
    const uid = currentUid || auth.currentUser?.uid || null;
    if (!uid) {
      setSubmitError('Please sign in to submit your quote.');
      try {
        // Open login modal if available
        // @ts-ignore
        if (typeof window !== 'undefined' && window.__authOpen) window.__authOpen('login');
      } catch {}
      return;
    }

    // Enforce max quotes per user (only count active quotes)
    if (activeQuotesCount >= MAX_QUOTES) {
      const msg = `You have reached the maximum of ${MAX_QUOTES} quotes. Please wait for a response or delete an existing quote before submitting a new one.`;
      setSubmitError(msg);
      showToast(msg);
      return;
    }

    setSubmitting(true);
    try {
      // Debug: surface key context during submit
      console.debug('[QuoteForm] Submitting quote', {
        uid,
        email: userEmail,
        activeQuotesCount,
        MAX_QUOTES,
      });
      const quoteData = {
        customerId: userEmail, // Using email as customer ID for now
        customerEmail: userEmail ?? null,
        userUid: uid,
        status: 'Pending',
        createdAt: serverTimestamp(),
        quoteType: formData.quoteType,
        location: {
          country: 'India',
          state: formData.locationState || '',
          district: formData.locationDistrict || '',
        },
        ...(formData.quoteType === 'New Installation' && {
          propertyType: formData.propertyType,
          numberOfRooms: formData.numberOfRooms,
          devicesRequired: formData.devicesRequired ?? [],
        }),
        ...(formData.quoteType === 'Upgrade Existing Setup' && {
          roomsAlreadySmart: formData.roomsAlreadySmart ?? [],
          newRoomsToAutomate: formData.newRoomsToAutomate ?? [],
          ...(formData.brandPreference ? { brandPreference: formData.brandPreference } : {}),
        }),
        ...(formData.quoteType === 'Maintenance' && {
          maintenanceIssue: {
            rooms: formData.maintenanceRooms ?? [],
            issueType: formData.issueType ?? '',
          },
        }),
        ...(formData.quoteType === 'Custom Requirement' && {
          customDetails: formData.customDetails,
        }),
        timeline: formData.timeline,
        budget: formData.budget,
        budgetCurrency: 'INR',
        whatsappNumber: formData.whatsappNumber || null,
        phone: formData.whatsappNumber || null, // Backend alias
        templateId: formData.templateId || null,
        ...(formData.details && formData.details.trim().length > 0 ? { details: formData.details.trim() } : {}),
      };

      const docRef = await addDoc(collection(db, 'quotes'), quoteData);

      // Create an admin notification for a new quote request (global for all admins)
      try {
        const adminNotifId = `admin_notification_${Date.now()}_${docRef.id}`;
        const notif = {
          title: 'New Quote Request Received',
          message: `A new ${formData.quoteType || 'quote'} request has been submitted by ${userEmail || 'a user'}. Please review and provide an estimation.`,
          type: 'quote_request' as const,
          status: 'unread' as const,
          createdAt: Timestamp.now(),
          adminUid: null as any,
          read: false,
          relatedEntityId: docRef.id,
          relatedEntityType: 'quote',
          customerEmail: userEmail ?? null,
          customerUid: uid,
          priority: 'medium' as const,
        };
        await setDoc(doc(adminNotificationsCollection(db), adminNotifId), notif as any);
      } catch (e) {
        // Non-blocking: do not fail the quote submit if notification creation fails
        console.warn('[QuoteForm] Failed to create admin notification for quote', e);
      }
      
      setSubmitSuccess(docRef.id);
      showToast('Quote submitted successfully.');
      
      // Trigger WhatsApp notification via callable if phone provided
      if (formData.whatsappNumber) {
        try {
          const waRes = await notifyQuoteAction({
            type: 'quote_submitted',
            quoteId: docRef.id,
            email: userEmail || '',
            phone: formData.whatsappNumber,
            name: 'Valued Customer',
            templateId: formData.templateId,
            details: { budget: formData.budget, type: formData.quoteType, templateId: formData.templateId }
          });
          if (waRes?.whatsappLink) setWaManualLink(waRes.whatsappLink);
        } catch (waErr) {
          console.warn('WhatsApp notification trigger failed', waErr);
        }
      }

      // Reset form progress in localStorage
      try {
        localStorage.removeItem(FORM_STORAGE_KEY);
        localStorage.removeItem(STEP_STORAGE_KEY);
      } catch {}

      if (onSubmitted) {
        onSubmitted(docRef.id);
      }
    } catch (error: any) {
      console.error('Error submitting quote:', error);
      const code = error?.code || '';
      if (code === 'permission-denied') {
        // Provide clearer hints for common causes
        setSubmitError('Permission denied. Make sure you are signed in and your account has access.');
        showToast('Permission denied when creating quote. Please sign in again.', 'error');
        console.warn('[QuoteForm] permission-denied creating quotes doc. Hints: ensure request.auth.uid is set and matches userUid in payload; verify rules on /quotes allow create. Payload userUid:', uid);
      } else if (code === 'unauthenticated') {
        setSubmitError('You are not signed in. Please sign in and try again.');
        showToast('Not signed in. Please log in.', 'error');
      } else {
        setSubmitError(error?.message || 'Failed to submit. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteQuote = async (q: QuoteDoc) => {
    if (!q?.id) return;
    if ((q.status || 'Pending') !== 'Pending') {
      showToast('Only pending quotes can be removed.');
      return;
    }
    if (!auth.currentUser) {
      setSubmitError('Please sign in to remove your quote.');
      try {
        // @ts-ignore
        if (typeof window !== 'undefined' && window.__authOpen) window.__authOpen('login');
      } catch {}
      return;
    }
    const confirmed = typeof window !== 'undefined' ? window.confirm('Remove this pending quote? This action cannot be undone.') : true;
    if (!confirmed) return;
    try {
      setDeletingId(q.id);
      await deleteDoc(doc(db, 'quotes', q.id));
      showToast('Quote removed.');
    } catch (error: any) {
      console.error('Failed to delete quote:', error);
      if (error?.code === 'permission-denied') {
        setSubmitError('You don\'t have permission to remove this quote.');
      } else {
        setSubmitError(error?.message || 'Failed to remove quote.');
      }
    } finally {
      setDeletingId(null);
    }
  };

  const renderStep = () => {
    if (submitSuccess) {
      return (
        <div className="py-8 text-center space-y-6">
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <CheckCircle2 size={48} />
            </div>
            <div>
              <h3 className="text-2xl font-bold dark:text-white">Quote Submitted!</h3>
              <p className="text-gray-500 dark:text-gray-400 mt-2">
                We've received your request and our team will get back to you soon.
              </p>
            </div>
          </div>

          <div className="max-w-xs mx-auto space-y-3">
            {waManualLink && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold justify-center bg-emerald-50 dark:bg-emerald-900/10 py-2 px-4 rounded-xl border border-emerald-500/10">
                  <CheckCircle2 size={16} />
                  Opening WhatsApp...
                </div>
                
                <a 
                  href={waManualLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-4 px-4 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white rounded-xl text-base font-bold transition-all shadow-xl shadow-teal-500/20 active:scale-[0.98]"
                >
                  <MessageCircle size={20} fill="currentColor" />
                  Click to Save on WhatsApp
                </a>
              </div>
            )}
            <button
              onClick={() => {
                setSubmitSuccess(null);
                setCurrentStep(1);
                setFormData({
                  quoteType: '',
                  timeline: '',
                  budget: '',
                  locationState: '',
                  locationDistrict: '',
                  whatsappNumber: '',
                });
              }}
              className="w-full py-3 px-4 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Submit Another Quote
            </button>
          </div>
        </div>
      );
    }

    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6 max-[500px]:w-[95%] max-[500px]:mx-auto">
            {/* Quick Bundles Header */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-teal/20 to-cyan-500/20 rounded-2xl blur opacity-25 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                <div className="flex items-center gap-3 text-teal mb-4">
                  <div className="p-2 bg-teal/10 rounded-xl">
                    <Package size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold dark:text-white">Quick Bundles</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Select a pre-configured setup to save time.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {quoteTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => handleTemplateSelect(template.id)}
                      className={`group/btn relative text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                        selectedTemplateId === template.id 
                          ? 'border-teal bg-teal/5 ring-4 ring-teal/10' 
                          : 'border-slate-100 dark:border-gray-800 hover:border-teal/30 bg-slate-50/50 dark:bg-gray-900/40'
                      }`}
                    >
                      <div className="font-bold text-sm text-slate-800 dark:text-white mb-1 group-hover/btn:text-teal transition-colors">
                        {template.name}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-2">
                        {template.description}
                      </p>
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <span className="text-[10px] font-bold text-teal">{template.estimatedPrice}</span>
                        <div className="opacity-0 group-hover/btn:opacity-100 transition-opacity">
                          <Package size={12} className="text-teal" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-gray-200 dark:border-gray-800"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-gray-900 px-4 text-gray-500 tracking-widest font-black">Or Customize From Scratch</span>
              </div>
            </div>

            <h3 className="text-lg font-semibold text-charcoal dark:text-white">Select Quote Type</h3>
            <div className="space-y-2">
              {QUOTE_TYPES.map((type) => (
                <label key={type.value} className={`flex items-center space-x-3 p-3 rounded-xl border ${formData.quoteType === type.value ? 'border-teal bg-teal/5' : 'border-gray-200 dark:border-gray-700 hover:border-teal/60'} cursor-pointer transition` }>
                  <input
                    type="radio"
                    name="quoteType"
                    value={type.value}
                    checked={formData.quoteType === type.value}
                    onChange={handleChange}
                    className="form-radio text-teal"
                  />
                  <span>{type.label}</span>
                </label>
              ))}
              {errors.quoteType && <p className="text-sm text-red-600 mt-1">{errors.quoteType}</p>}
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4 max-[500px]:w-[95%] max-[500px]:mx-auto">
            <h3 className="text-lg font-medium">Scope of Work</h3>
            {formData.quoteType === 'New Installation' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Property Type</label>
                  <select
                    name="propertyType"
                    value={formData.propertyType || ''}
                    onChange={handleChange}
                    className={`${inputBase} ${errors.propertyType ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                  >
                    <option value="">Select property type</option>
                    <option value="Apartment">Apartment</option>
                    <option value="Villa">Villa</option>
                    <option value="Office">Office</option>
                  </select>
                  {errors.propertyType && <p className="text-sm text-red-600 mt-1">{errors.propertyType}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Number of Rooms</label>
                  <input
                    type="number"
                    name="numberOfRooms"
                    value={formData.numberOfRooms || ''}
                    onChange={handleChange}
                    className={`${inputBase} ${errors.numberOfRooms ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                    min="1"
                  />
                  {errors.numberOfRooms && <p className="text-sm text-red-600 mt-1">{errors.numberOfRooms}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Devices Required</label>
                  <div
                    className="space-y-2 max-h-48 overflow-y-auto overscroll-contain touch-pan-y rounded-lg border border-gray-200 dark:border-gray-700 p-3 pb-8 pr-4 md:pr-5 bg-white dark:bg-gray-800 max-[375px]:w-[90%] max-[375px]:mx-auto max-[375px]:px-2 max-[375px]:pr-2"
                    onWheel={(e) => { e.stopPropagation(); }}
                    onTouchMove={(e) => { e.stopPropagation(); }}
                    tabIndex={0}
                  >
                    {availableDevices.map(device => (
                      <label key={device.value} className="flex items-center space-x-2 py-0.5">
                        <input
                          type="checkbox"
                          name="devicesRequired"
                          value={device.value}
                          checked={formData.devicesRequired?.includes(device.value) || false}
                          onChange={handleCheckboxChange}
                          className="form-checkbox text-teal"
                        />
                        <span>{device.label}</span>
                      </label>
                    ))}
                    {/* Bottom spacer so the last visible item isn't flush with the border */}
                    <div aria-hidden className="h-4" />
                  </div>
                  {errors.devicesRequired && <p className="text-sm text-red-600 mt-1">{errors.devicesRequired}</p>}
                </div>
              </>
            )}
            {formData.quoteType === 'Upgrade Existing Setup' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Devices Already Installed</label>
                  <div
                    className="space-y-2 max-h-48 overflow-y-auto overscroll-contain touch-pan-y rounded-lg border border-gray-200 dark:border-gray-700 p-3 pb-10 pr-4 md:pr-6 bg-white dark:bg-gray-800 max-[448px]:w-[92%] max-[448px]:mx-auto max-[448px]:px-3 max-[375px]:w-[90%] max-[375px]:mx-auto max-[375px]:px-2 max-[375px]:pr-2 max-[375px]:text-xs max-[360px]:w-[88%] max-[375px]:space-y-1"
                    onWheel={(e) => { e.stopPropagation(); }}
                    onTouchMove={(e) => { e.stopPropagation(); }}
                    tabIndex={0}
                  >
                    {userDevices.length > 0 ? (
                      userDevices.map((name, idx) => (
                        <label key={`${name}-${idx}`} className="flex items-center space-x-2 py-1 last:mb-2 opacity-80 max-[375px]:space-x-1 max-[375px]:py-0.5">
                          <input type="checkbox" checked readOnly disabled className="form-checkbox text-teal disabled:opacity-70" />
                          <span className="text-sm leading-6 pb-0.5 text-gray-900 dark:text-gray-100 max-[375px]:text-xs">{name}</span>
                        </label>
                      ))
                    ) : (
                      <div className="text-sm text-gray-500 dark:text-gray-400">No devices found for your account.</div>
                    )}
                    <div aria-hidden className="h-3" />
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">These are synced from your installed devices and cannot be changed here.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">New Devices to Automate</label>
                  <div
                    className="space-y-2 max-h-48 overflow-y-auto overscroll-contain touch-pan-y rounded-lg border border-gray-200 dark:border-gray-700 p-3 pb-10 pr-4 md:pr-6 bg-white dark:bg-gray-800 max-[375px]:w-[90%] max-[375px]:mx-auto max-[375px]:px-2 max-[375px]:pr-2 max-[375px]:text-xs max-[360px]:w-[88%] max-[375px]:space-y-1"
                    onWheel={(e) => { e.stopPropagation(); }}
                    onTouchMove={(e) => { e.stopPropagation(); }}
                    tabIndex={0}
                  >
                    {availableDevices.map(dev => (
                      <label key={dev.value} className="flex items-center space-x-2 py-1 last:mb-2 max-[375px]:space-x-1 max-[375px]:py-0.5">
                        <input
                          type="checkbox"
                          name="newRoomsToAutomate"
                          value={dev.value}
                          checked={formData.newRoomsToAutomate?.includes(dev.value) || false}
                          onChange={handleCheckboxChange}
                          className="form-checkbox text-teal"
                        />
                        <span className="leading-6 pb-0.5 max-[375px]:text-xs">{dev.label}</span>
                      </label>
                    ))}
                    <div aria-hidden className="h-4" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Brand Preference</label>
                  <input
                    type="text"
                    name="brandPreference"
                    value={formData.brandPreference || ''}
                    onChange={handleChange}
                    className={`${inputBase} border-gray-300 dark:border-gray-600 max-[375px]:w-[95%] max-[375px]:mx-auto`}
                  />
                </div>
              </>
            )}
            {formData.quoteType === 'Maintenance' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Rooms</label>
                  <select
                    name="maintenanceRooms"
                    multiple
                    value={formData.maintenanceRooms || []}
                    onChange={handleMultiSelectChange}
                    className={`${inputBase} ${errors.maintenanceRooms ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                  >
                    {ROOM_OPTIONS.map(room => (
                      <option key={room.value} value={room.value}>{room.label}</option>
                    ))}
                  </select>
                  {errors.maintenanceRooms && <p className="text-sm text-red-600 mt-1">{errors.maintenanceRooms}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Issue Type</label>
                  <select
                    name="issueType"
                    value={formData.issueType || ''}
                    onChange={handleChange}
                    className={`${inputBase} ${errors.issueType ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                  >
                    <option value="">Select issue type</option>
                    {ISSUE_OPTIONS.map(issue => (
                      <option key={issue.value} value={issue.value}>{issue.label}</option>
                    ))}
                  </select>
                  {errors.issueType && <p className="text-sm text-red-600 mt-1">{errors.issueType}</p>}
                </div>
              </>
            )}
            {formData.quoteType === 'Custom Requirement' && (
              <div>
                <label className="block text-sm font-medium mb-1">Custom Details</label>
                <textarea
                  name="customDetails"
                  value={formData.customDetails || ''}
                  onChange={handleChange}
                  className={`${inputBase} ${errors.customDetails ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                  rows={4}
                />
                {errors.customDetails && <p className="text-sm text-red-600 mt-1">{errors.customDetails}</p>}
              </div>
            )}
          </div>
        );
      case 3:
        return (
          <div className="space-y-4 max-[500px]:w-[95%] max-[500px]:mx-auto">
            <h3 className="text-lg font-semibold text-charcoal dark:text-white">Additional Information</h3>
            {/* Location (India) */}
            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <LocationSelector
                value={{ country: 'India', state: formData.locationState || '', district: formData.locationDistrict || '' }}
                onChange={handleLocationChange}
                required
              />
              {(errors.locationState || errors.locationDistrict) && (
                <p className="text-sm text-red-600 mt-1">{errors.locationState || errors.locationDistrict}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Timeline</label>
              <select
                name="timeline"
                value={formData.timeline}
                onChange={handleChange}
                className={`${inputBase} ${errors.timeline ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
              >
                <option value="">Select timeline</option>
                {TIMELINE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {errors.timeline && <p className="text-sm text-red-600 mt-1">{errors.timeline}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Budget (INR)</label>
              <input
                type="text"
                name="budget"
                value={formData.budget}
                onChange={handleChange}
                className={`${inputBase} ${errors.budget ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                placeholder="e.g., ₹1,000 or 5,000-10,000"
              />
              {errors.budget && <p className="text-sm text-red-600 mt-1">{errors.budget}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">WhatsApp Number (Optional)</label>
              <input
                type="tel"
                name="whatsappNumber"
                value={formData.whatsappNumber || ''}
                onChange={handleChange}
                className={inputBase}
                placeholder="e.g. +91 9876543210"
              />
              <p className="text-xs text-gray-500 mt-1">Receive updates via WhatsApp</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Additional Details</label>
              <textarea
                name="details"
                value={formData.details || ''}
                onChange={handleChange}
                className={`${inputBase} border-gray-300 dark:border-gray-600`}
                rows={4}
              />
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4 max-[500px]:w-[95%] max-[500px]:mx-auto">
            <h3 className="text-lg font-semibold text-charcoal dark:text-white">Review and Submit</h3>
            <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <h4 className="font-medium">Quote Type: {formData.quoteType}</h4>
              {formData.quoteType === 'New Installation' && (
                <>
                  <p>Property Type: {formData.propertyType}</p>
                  <p>Number of Rooms: {formData.numberOfRooms}</p>
                  <p>Devices: {formData.devicesRequired?.join(', ')}</p>
                </>
              )}
              {formData.quoteType === 'Upgrade Existing Setup' && (
                <>
                  <p>Devices Already Installed: {userDevices.join(', ') || 'None'}</p>
                  <p>New Devices to Automate: {formData.newRoomsToAutomate?.join(', ')}</p>
                  <p>Brand Preference: {formData.brandPreference}</p>
                </>
              )}
              {formData.quoteType === 'Maintenance' && (
                <>
                  <p>Rooms: {formData.maintenanceRooms?.join(', ')}</p>
                  <p>Issue Type: {formData.issueType}</p>
                </>
              )}
              {formData.quoteType === 'Custom Requirement' && (
                <p>Custom Details: {formData.customDetails}</p>
              )}
              <p>Timeline: {formData.timeline}</p>
              <p>Budget: {formData.budget}</p>
              <p>Location: India{formData.locationState ? `, ${formData.locationState}` : ''}{formData.locationDistrict ? `, ${formData.locationDistrict}` : ''}</p>
              <p>Additional Details: {formData.details}</p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`${className} max-w-4xl mx-auto px-3 sm:px-0 overflow-x-hidden max-[448px]:px-2`}>
      <div className="mb-6 max-[500px]:hidden">
        <div className="h-2 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal to-cyan-500 transition-all"
            style={{ width: `${(currentStep - 1) * (100 / 3)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs px-1 mt-2 text-gray-600 dark:text-gray-300">
          <span>Quote Type</span>
          <span>Scope</span>
          <span>Details</span>
          <span>Submit</span>
        </div>
      </div>

      <form 
        onSubmit={handleSubmit} 
        className={`w-full max-w-full max-[448px]:w-[95%] max-[448px]:mx-auto max-[448px]:text-[13px] max-[375px]:w-[95%] max-[375px]:mx-auto overflow-x-hidden break-words bg-white dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-2xl p-3 sm:p-5 shadow-sm relative`}
      >
        {renderStep()}

        {activeQuotesCount >= MAX_QUOTES && (
          <div className="mt-4 p-3 rounded-xl bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 border border-amber-200 dark:border-amber-700">
            You’ve reached the maximum of {MAX_QUOTES} active quotes. Cancel an existing quote or wait for a response to submit a new one.
          </div>
        )}

        {/* submitError is now handled by snackbar showToast(..., 'error') */}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {currentStep > 1 && (
            <button
              type="button"
              onClick={handlePrev}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 max-[375px]:w-[90%] max-[375px]:mx-auto sm:w-auto"
            >
              Previous
            </button>
          )}
          <div className="flex-1 hidden sm:block" />
          {currentStep < 4 ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2 rounded-lg bg-teal text-white hover:bg-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/60 max-[375px]:w-[90%] max-[375px]:mx-auto sm:w-auto sm:ml-auto"
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 max-[375px]:w-[90%] max-[375px]:mx-auto sm:w-auto sm:ml-auto"
              disabled={submitting || activeQuotesCount >= MAX_QUOTES}
              title={`submitting: ${submitting}, activeQuotesCount: ${activeQuotesCount}, MAX_QUOTES: ${MAX_QUOTES}`}
            >
              {submitting ? 'Submitting Quote...' : activeQuotesCount >= MAX_QUOTES ? 'Limit Reached' : 'Submit Quote & Send Details →'}
            </button>
          )}
        </div>
      </form>
      {/* Requested Quotes Module */}
      <div className="mt-6">
        <button
          type="button"
          onClick={() => setShowOldQuotes(v => !v)}
          className="w-full max-[448px]:w-[95%] max-[448px]:mx-auto max-[375px]:w-[95%] max-[375px]:mx-auto flex items-center justify-between px-4 sm:px-5 py-3.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-all duration-200 hover:border-teal-300 dark:hover:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
        >
          <span className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-teal-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            Requested Quotes
          </span>
          <span className="text-sm font-medium text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-3 py-1 rounded-full">
            {quotes.length} {quotes.length === 1 ? 'quote' : 'quotes'}
          </span>
        </button>
        {showOldQuotes && (
          <div className="mt-3 space-y-3">
            {!currentUid && (
              <div className="text-sm text-gray-500">Sign in to view your requested quotes.</div>
            )}
            {currentUid && quotesError && (
              <div className="text-sm text-red-600">{quotesError}</div>
            )}
            {currentUid && quotesLoading && (
              <div className="text-sm text-gray-500">Loading your quotes…</div>
            )}
            {currentUid && !quotesLoading && quotes.length === 0 && (
              <div className="text-sm text-gray-500">No requested quotes found.</div>
            )}
            {currentUid && quotes.map((q) => {
              const created = (q.createdAt && (q.createdAt as any).seconds)
                ? new Date((q.createdAt as any).seconds * 1000)
                : null;
              const bill = q.bill as any;
              return (
                <div
                  key={q.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openQuoteModal(q)}
                  onKeyDown={(e) => { if (e.key === 'Enter') openQuoteModal(q); }}
                  className="cursor-pointer rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  <div className="flex flex-wrap items-center gap-3 justify-between">
                    <div className="space-y-0.5 min-w-0">
                      <div className="font-semibold truncate" title={String(q.quoteType || 'Quote')}>{q.quoteType || 'Quote'}</div>
                      <div className="text-sm text-gray-500 truncate" title={`${created ? created.toLocaleString() : '—'} · Status: ${String(q.status || 'Pending')}`}>
                        {created ? created.toLocaleString() : '—'} · Status: {' '}
                        <span className={
                          String(q.status).toLowerCase() === 'cancelled' ? 'text-red-500' :
                          String(q.status).toLowerCase() === 'confirmed' ? 'text-green-600 dark:text-green-400' :
                          'text-amber-600 dark:text-amber-400' // Default color for Pending and other statuses
                        }>
                          {q.status || 'Pending'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-sm text-gray-600 dark:text-gray-300 truncate" title={`Budget: ${q.budgetCurrency || 'INR'} ${q.budget || ''}`}>
                        Budget: {q.budgetCurrency || 'INR'} {q.budget || ''}
                      </div>
                      {String(q.status || 'Pending').toLowerCase() === 'pending' && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleCancelQuote(q); }}
                          disabled={updatingId === q.id}
                          className="text-sm px-3 py-1 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/20 disabled:opacity-60"
                          aria-label="Cancel quote"
                          title="Cancel quote"
                        >
                          {updatingId === q.id ? 'Cancelling…' : 'Cancel'}
                        </button>
                      )}
                    </div>
                  </div>
                  {q.details && (
                    <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">{q.details}</p>
                  )}
                  {/* Admin bill/reply if present */}
                  {(bill || q.adminReply) && (
                    <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-900/20 p-3">
                      <div className="font-medium text-amber-800 dark:text-amber-200">Admin Response</div>
                      {q.adminReply && (
                        <p className="mt-1 text-sm text-amber-900 dark:text-amber-100">{q.adminReply}</p>
                      )}
                      {bill && (
                        <div className="mt-2 text-sm text-amber-900 dark:text-amber-100">
                          {Array.isArray(bill.items) && bill.items.length > 0 && (
                            <ul className="list-disc pl-5 space-y-1">
                              {bill.items.map((it: any, idx: number) => (
                                <li key={idx}>
                                  {it.name || 'Item'}{it.qty ? ` × ${it.qty}` : ''}
                                  {typeof it.price !== 'undefined' ? ` — ${bill.currency || q.budgetCurrency || 'INR'} ${it.price}` : ''}
                                </li>
                              ))}
                            </ul>
                          )}
                          {(bill.total || bill.notes) && (
                            <div className="mt-2">
                              {bill.total && (<div><span className="font-medium">Total:</span> {bill.currency || q.budgetCurrency || 'INR'} {bill.total}</div>)}
                              {bill.notes && (<div className="text-xs text-amber-800/90 dark:text-amber-200/90">{bill.notes}</div>)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quote Details Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative z-[61] w-full max-w-3xl rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold">Quote Details</h3>
              <button onClick={closeModal} className="rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close">×</button>
            </div>
            <div 
              className="p-5 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar"
              onWheel={onContentWheel}
              onWheelCapture={onContentWheel}
              tabIndex={0}
            >
              {selectedQuote ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div><div className="text-gray-500">Type</div><div className="font-medium">{selectedQuote.quoteType || 'Quote'}</div></div>
                    <div><div className="text-gray-500">Status</div><div className="font-medium">{selectedQuote.status || 'Pending'}</div></div>
                    <div><div className="text-gray-500">Budget</div><div className="font-medium">{selectedQuote.budgetCurrency || 'INR'} {selectedQuote.budget || ''}</div></div>
                    <div><div className="text-gray-500">Created</div><div className="font-medium">{(selectedQuote.createdAt as any)?.seconds ? new Date((selectedQuote.createdAt as any).seconds * 1000).toLocaleString() : '—'}</div></div>
                  </div>
                  {selectedQuote.details && (
                    <div className="text-sm"><div className="text-gray-500">Details</div><div className="mt-1 whitespace-pre-line">{selectedQuote.details}</div></div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No quote selected.</div>
              )}

              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <h4 className="font-semibold">Admin Estimation</h4>
                {estLoading && (<div className="mt-2 text-sm text-gray-500">Loading estimation…</div>)}
                {!estLoading && !estimation && (<div className="mt-2 text-sm text-gray-500">No estimation available yet.</div>)}
                {!estLoading && estimation && (
                  <div className="mt-3 space-y-3 text-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div><div className="text-gray-500">Estimation ID</div><div className="font-medium">{estimation.quoteId || estimation.id || ''}</div></div>
                      <div><div className="text-gray-500">Status</div><div className="font-medium">{estimation.status}</div></div>
                      <div><div className="text-gray-500">Issue Date</div><div className="font-medium">{formatEstimationDate(estimation.issueDate)}</div></div>
                      <div><div className="text-gray-500">Grand Total</div><div className="font-medium">₹ {Number(estimation.grandTotal || 0).toFixed(2)}</div></div>
                    </div>
                    {Array.isArray(estimation.items) && estimation.items.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs sm:text-sm">
                          <thead>
                            <tr className="text-left text-gray-500">
                              <th className="py-1 pr-3">Item</th>
                              <th className="py-1 pr-3 hidden md:table-cell">Description</th>
                              <th className="py-1 pr-3">Qty</th>
                              <th className="py-1 pr-3">Unit</th>
                              <th className="py-1 pr-3 hidden lg:table-cell">Discount</th>
                              <th className="py-1 pr-3 hidden lg:table-cell">Tax %</th>
                              <th className="py-1">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {estimation.items.map((it: any) => {
                              const qty = Number(it.quantity) || 0;
                              const unit = Number(it.unitPrice) || 0;
                              const base = Math.max(0, qty * unit);
                              const disc = Number(it.discount) || 0;
                              const discountAmount = disc > 0 ? (disc <= 100 ? (base * disc) / 100 : Math.min(disc, base)) : 0;
                              const line = Math.max(0, base - discountAmount);
                              const tax = (line * (Number(it.taxPercent) || 0)) / 100;
                              const total = line + tax;
                              return (
                                <tr key={it.id}>
                                  <td className="py-1 pr-3">{it.name}</td>
                                  <td className="py-1 pr-3 hidden md:table-cell">{it.description}</td>
                                  <td className="py-1 pr-3">{it.quantity}</td>
                                  <td className="py-1 pr-3">{it.unitPrice}</td>
                                  <td className="py-1 pr-3 hidden lg:table-cell">{(Number(it.discount) || 0) <= 100 ? `${Number(it.discount) || 0}%` : `${Number(it.discount) || 0}`}</td>
                                  <td className="py-1 pr-3 hidden lg:table-cell">{typeof it.taxPercent === 'number' ? `${it.taxPercent}%` : 'N/A'}</td>
                                  <td className="py-1">{total.toFixed(2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div><span className="text-gray-500">Subtotal</span> <div className="font-medium">₹ {Number(estimation.subtotal || 0).toFixed(2)}</div></div>
                      <div><span className="text-gray-500">Taxes</span> <div className="font-medium">₹ {Number(estimation.taxes || 0).toFixed(2)}</div></div>
                      <div><span className="text-gray-500">Shipping</span> <div className="font-medium">₹ {Number(estimation.shippingCharges || 0).toFixed(2)}</div></div>
                      <div><span className="text-gray-500">Installation</span> <div className="font-medium">₹ {Number(estimation.installationCharges || 0).toFixed(2)}</div></div>
                      <div><span className="text-gray-500">Overall Discount</span> <div className="font-medium">{Number(estimation.overallDiscount || 0)}%</div></div>
                    </div>
                    {(estimation.paymentTerms || estimation.warranty || estimation.deliveryTimeline || estimation.notes) && (
                      <div className="space-y-2">
                        {estimation.paymentTerms && (<div><span className="text-gray-500">Payment Terms</span><div className="font-medium">{estimation.paymentTerms}</div></div>)}
                        {estimation.warranty && (<div><span className="text-gray-500">Warranty</span><div className="font-medium">{estimation.warranty}</div></div>)}
                        {estimation.deliveryTimeline && (<div><span className="text-gray-500">Delivery</span><div className="font-medium">{estimation.deliveryTimeline}</div></div>)}
                        {estimation.notes && (<div><span className="text-gray-500">Notes</span><div className="font-medium whitespace-pre-line">{estimation.notes}</div></div>)}
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
                          <div className="text-gray-500">Attachments</div>
                          <ul className="mt-1 space-y-1">
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
                                <li key={idx} className="flex items-center justify-between gap-2 p-2 rounded bg-gray-50 dark:bg-gray-700/40">
                                  <span className="truncate" title={name}>{name}</span>
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2 py-0.5 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-500"
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
              <div className="flex justify-end pt-2">
                {/* Bottom-left Download PDF and right-aligned Close */}
                <div className="flex w-full items-center justify-between">
                  {estimation && (
                    <PDFDownloadLink
                      document={(
                        <EstimatePDF
                          createForm={{
                            quoteId: (estimation as any)?.quoteId || (estimation as any)?.id || '',
                            issueDate: formatEstimationDate((estimation as any)?.issueDate) || '',
                            expiryDate: (estimation as any)?.expiryDate ? formatEstimationDate((estimation as any)?.expiryDate) : undefined,
                            customerEmail: (selectedQuote as any)?.customerEmail || (selectedQuote as any)?.userEmail || '',
                            paymentTerms: (estimation as any)?.paymentTerms || '',
                            warranty: (estimation as any)?.warranty || '',
                            deliveryTimeline: (estimation as any)?.deliveryTimeline || '',
                            notes: (estimation as any)?.notes || '',
                            shippingCharges: Number((estimation as any)?.shippingCharges || 0),
                            installationCharges: Number((estimation as any)?.installationCharges || 0),
                            overallDiscountPercent: Number((estimation as any)?.overallDiscountPercent || 0),
                            taxType: (estimation as any)?.taxType || 'GST',
                            taxPercent: Number((estimation as any)?.taxPercent || 0),
                            taxes: Array.isArray((estimation as any)?.taxBreakdown)
                              ? ((estimation as any)?.taxBreakdown as any[]).map((t) => ({ name: String(t.name || 'Tax'), percent: Number(t.percent || 0) }))
                              : Array.isArray((estimation as any)?.taxes)
                                ? ((estimation as any)?.taxes as any[]).map((t) => ({ name: String(t.name || 'Tax'), percent: Number(t.percent || 0) }))
                                : [],
                          }}
                          items={Array.isArray((estimation as any)?.items)
                            ? ((estimation as any)?.items as any[]).map((it) => ({
                                id: String(it.id || ''),
                                name: String(it.name || ''),
                                description: String(it.description || ''),
                                quantity: Number(it.quantity || 0),
                                unitPrice: Number(it.unitPrice || 0),
                                discount: Number(it.discount || 0),
                                taxPercent: Number(it.taxPercent || 0),
                              }))
                            : []}
                          totals={{
                            subtotal: Number((estimation as any)?.subtotal || 0),
                            discountAmount: Number((estimation as any)?.overallDiscountAmount || 0),
                            taxes: Number((estimation as any)?.taxes || 0),
                            grand: Number((estimation as any)?.grandTotal || 0),
                          }}
                        />
                      )}
                      fileName={`${((estimation as any)?.quoteId || (estimation as any)?.id || 'estimate')}.pdf`}
                    >
                      {({ loading }) => (
                        <button
                          type="button"
                          className="px-4 py-2 rounded-lg bg-teal text-white hover:bg-teal/90 text-sm"
                          title="Download PDF"
                        >
                          {loading ? 'Preparing…' : 'Download PDF'}
                        </button>
                      )}
                    </PDFDownloadLink>
                  )}
                  <button onClick={closeModal} className="px-4 py-2 rounded-lg bg-teal text-white hover:bg-teal/90">Close</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="fixed top-4 right-4 z-50 space-y-2 max-w-full">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`w-[calc(100vw-2rem)] sm:max-w-sm break-words rounded-xl shadow-2xl border px-5 py-4 transition-all duration-300 transform ${
              t.type === 'error' 
                ? 'bg-rose-50 dark:bg-rose-950/90 border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-200' 
                : 'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-200'
            } ${
              t.entering ? 'opacity-0 translate-y-[-20px] scale-95' : 'opacity-100 translate-y-0 scale-100'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                t.type === 'error' ? 'bg-rose-100 dark:bg-rose-900/50' : 'bg-emerald-100 dark:bg-emerald-900/50'
              }`}>
                {t.type === 'error' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-rose-600 dark:text-rose-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div className="flex-1 text-sm font-bold leading-tight">{t.message}</div>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                aria-label="Close notification"
                className={`flex-shrink-0 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                  t.type === 'error' ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 011.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
