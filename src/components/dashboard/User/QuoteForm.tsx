import React, { useState, useEffect, useMemo } from 'react';
import { auth, db } from '../../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { addDoc, collection, serverTimestamp, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';

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
  
  // Common
  details?: string;
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
  { value: 'Maintenance', label: 'Maintenance' },
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

export default function QuoteForm({ userEmail: emailProp, className = '', onSubmitted }: QuoteFormProps) {
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
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const inputBase = 'w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-600 dark:placeholder-gray-400 caret-teal-500 focus:outline-none focus:ring-2 focus:ring-teal';

  // Old quotes state
  const [quotes, setQuotes] = useState<QuoteDoc[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [showOldQuotes, setShowOldQuotes] = useState(false);
  const [currentUid, setCurrentUid] = useState<string | null>(auth.currentUser?.uid ?? null);

  // Load saved progress on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(FORM_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          setFormData(prev => ({ ...prev, ...parsed }));
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
    const q = query(
      collection(db, 'quotes'),
      where('userUid', '==', currentUid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows: QuoteDoc[] = [];
      snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as DocumentData) } as QuoteDoc));
      setQuotes(rows);
      setQuotesLoading(false);
    }, () => setQuotesLoading(false));
    return () => unsub();
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
        const hasAny = (formData.roomsAlreadySmart?.length || 0) > 0 || (formData.newRoomsToAutomate?.length || 0) > 0;
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
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const handleNext = () => {
    if (!validateStep(currentStep)) return;
    setCurrentStep(prev => Math.min(prev + 1, 4));
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
        if (checked) {
          return { ...prev, devicesRequired: [...devices, value] };
        } else {
          return { ...prev, devicesRequired: devices.filter(device => device !== value) };
        }
      });
    }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    if (currentStep !== 4) {
      handleNext();
      return;
    }
    // Validate all final requirements before submit
    if (!validateStep(2) || !validateStep(3) || !validateStep(1)) {
      return;
    }

    // Require authentication to submit
    if (!auth.currentUser) {
      setSubmitError('Please sign in to submit your quote.');
      try {
        // Open login modal if available
        // @ts-ignore
        if (typeof window !== 'undefined' && window.__authOpen) window.__authOpen('login');
      } catch {}
      return;
    }

    setSubmitting(true);
    try {
      const quoteData = {
        customerId: userEmail, // Using email as customer ID for now
        customerEmail: userEmail ?? null,
        userUid: auth.currentUser?.uid ?? null,
        status: 'Pending',
        createdAt: serverTimestamp(),
        quoteType: formData.quoteType,
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
        ...(formData.details && formData.details.trim().length > 0 ? { details: formData.details.trim() } : {}),
      };

      const docRef = await addDoc(collection(db, 'quotes'), quoteData);
      setSubmitSuccess('Quote submitted successfully.');
      // Clear saved progress on success
      try {
        localStorage.removeItem(FORM_STORAGE_KEY);
        localStorage.removeItem(STEP_STORAGE_KEY);
      } catch {}
      if (onSubmitted) {
        onSubmitted(docRef.id);
      } else {
        // Stay on portal and reveal old quotes so the new one is visible
        setShowOldQuotes(true);
      }
    } catch (error: any) {
      console.error('Error submitting quote:', error);
      const code = error?.code || '';
      if (code === 'permission-denied') {
        setSubmitError('Permission denied. Please sign in and try again.');
      } else {
        setSubmitError(error?.message || 'Failed to submit. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
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
          <div className="space-y-4">
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
                  <div className="space-y-2">
                    {DEVICE_OPTIONS.map(device => (
                      <label key={device.value} className="flex items-center space-x-2">
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
                  </div>
                  {errors.devicesRequired && <p className="text-sm text-red-600 mt-1">{errors.devicesRequired}</p>}
                </div>
              </>
            )}
            {formData.quoteType === 'Upgrade Existing Setup' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Rooms Already Smart</label>
                  <select
                    name="roomsAlreadySmart"
                    multiple
                    value={formData.roomsAlreadySmart || []}
                    onChange={handleMultiSelectChange}
                    className={`${inputBase} ${errors.roomsAlreadySmart ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                  >
                    {ROOM_OPTIONS.map(room => (
                      <option key={room.value} value={room.value}>{room.label}</option>
                    ))}
                  </select>
                  {errors.roomsAlreadySmart && <p className="text-sm text-red-600 mt-1">{errors.roomsAlreadySmart}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">New Rooms to Automate</label>
                  <select
                    name="newRoomsToAutomate"
                    multiple
                    value={formData.newRoomsToAutomate || []}
                    onChange={handleMultiSelectChange}
                    className={`${inputBase} border-gray-300 dark:border-gray-600`}
                  >
                    {ROOM_OPTIONS.map(room => (
                      <option key={room.value} value={room.value}>{room.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Brand Preference</label>
                  <input
                    type="text"
                    name="brandPreference"
                    value={formData.brandPreference || ''}
                    onChange={handleChange}
                    className={`${inputBase} border-gray-300 dark:border-gray-600`}
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
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-charcoal dark:text-white">Additional Information</h3>
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
          <div className="space-y-4">
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
                  <p>Rooms Already Smart: {formData.roomsAlreadySmart?.join(', ')}</p>
                  <p>New Rooms to Automate: {formData.newRoomsToAutomate?.join(', ')}</p>
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
              <p>Additional Details: {formData.details}</p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`${className} max-w-4xl mx-auto`}>
      <div className="mb-6">
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

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
        {renderStep()}

        {submitError && <p className="mt-6 text-sm text-red-600">{submitError}</p>}
        {submitSuccess && <p className="mt-6 text-sm text-green-600">{submitSuccess}</p>}

        <div className="mt-8 flex justify-between">
          {currentStep > 1 && (
            <button
              type="button"
              onClick={handlePrev}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Previous
            </button>
          )}
          <div className="flex-grow" />
          {currentStep < 4 ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2 rounded-lg bg-teal text-white hover:bg-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/60"
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Quote'}
            </button>
          )}
        </div>
      </form>
      {/* Old Quotes Module */}
      <div className="mt-6">
        <button
          type="button"
          onClick={() => setShowOldQuotes(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <span className="font-medium">Old Quotes</span>
          <span className="text-sm text-gray-500">{showOldQuotes ? 'Hide' : 'Show'}</span>
        </button>
        {showOldQuotes && (
          <div className="mt-3 space-y-3">
            {!currentUid && (
              <div className="text-sm text-gray-500">Sign in to view your previous quotes.</div>
            )}
            {currentUid && quotesLoading && (
              <div className="text-sm text-gray-500">Loading your quotes…</div>
            )}
            {currentUid && !quotesLoading && quotes.length === 0 && (
              <div className="text-sm text-gray-500">No previous quotes found.</div>
            )}
            {currentUid && quotes.map((q) => {
              const created = (q.createdAt && (q.createdAt as any).seconds)
                ? new Date((q.createdAt as any).seconds * 1000)
                : null;
              const bill = q.bill as any;
              return (
                <div key={q.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 p-4">
                  <div className="flex flex-wrap items-center gap-3 justify-between">
                    <div className="space-y-0.5">
                      <div className="font-semibold">{q.quoteType || 'Quote'}</div>
                      <div className="text-sm text-gray-500">
                        {created ? created.toLocaleString() : '—'} · Status: {q.status || 'Pending'}
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      Budget: {q.budgetCurrency || 'INR'} {q.budget || ''}
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
    </div>
  );
}
