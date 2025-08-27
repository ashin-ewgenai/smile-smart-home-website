import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../../lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

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

export default function QuoteForm({ userEmail: emailProp, className = '', onSubmitted }: QuoteFormProps) {
  const userEmail = useMemo(() => emailProp ?? (typeof window !== 'undefined' ? localStorage.getItem('userEmail') : null), [emailProp]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    quoteType: '',
    timeline: '',
    budget: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleNext = () => {
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep !== 4) {
      handleNext();
      return;
    }

    setSubmitting(true);
    try {
      const quoteData = {
        customerId: userEmail, // Using email as customer ID for now
        status: 'Pending',
        createdAt: serverTimestamp(),
        quoteType: formData.quoteType,
        ...(formData.quoteType === 'New Installation' && {
          propertyType: formData.propertyType,
          numberOfRooms: formData.numberOfRooms,
          devicesRequired: formData.devicesRequired,
        }),
        ...(formData.quoteType === 'Upgrade Existing Setup' && {
          roomsAlreadySmart: formData.roomsAlreadySmart,
          newRoomsToAutomate: formData.newRoomsToAutomate,
          brandPreference: formData.brandPreference,
        }),
        ...(formData.quoteType === 'Maintenance' && {
          maintenanceIssue: {
            rooms: formData.maintenanceRooms,
            issueType: formData.issueType,
          },
        }),
        ...(formData.quoteType === 'Custom Requirement' && {
          customDetails: formData.customDetails,
        }),
        timeline: formData.timeline,
        budget: formData.budget,
        details: formData.details,
      };

      const docRef = await addDoc(collection(db, 'quotes'), quoteData);
      if (onSubmitted) {
        onSubmitted(docRef.id);
      } else {
        window.location.href = '/dashboard/user/my-quotes';
      }
    } catch (error) {
      console.error('Error submitting quote:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Select Quote Type</h3>
            <div className="space-y-2">
              {QUOTE_TYPES.map((type) => (
                <label key={type.value} className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="quoteType"
                    value={type.value}
                    checked={formData.quoteType === type.value}
                    onChange={handleChange}
                    className="form-radio"
                  />
                  <span>{type.label}</span>
                </label>
              ))}
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
                    className="w-full p-2 border rounded"
                  >
                    <option value="">Select property type</option>
                    <option value="Apartment">Apartment</option>
                    <option value="Villa">Villa</option>
                    <option value="Office">Office</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Number of Rooms</label>
                  <input
                    type="number"
                    name="numberOfRooms"
                    value={formData.numberOfRooms || ''}
                    onChange={handleChange}
                    className="w-full p-2 border rounded"
                    min="1"
                  />
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
                          className="form-checkbox"
                        />
                        <span>{device.label}</span>
                      </label>
                    ))}
                  </div>
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
                    className="w-full p-2 border rounded"
                  >
                    {ROOM_OPTIONS.map(room => (
                      <option key={room.value} value={room.value}>{room.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">New Rooms to Automate</label>
                  <select
                    name="newRoomsToAutomate"
                    multiple
                    value={formData.newRoomsToAutomate || []}
                    onChange={handleMultiSelectChange}
                    className="w-full p-2 border rounded"
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
                    className="w-full p-2 border rounded"
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
                    className="w-full p-2 border rounded"
                  >
                    {ROOM_OPTIONS.map(room => (
                      <option key={room.value} value={room.value}>{room.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Issue Type</label>
                  <select
                    name="issueType"
                    value={formData.issueType || ''}
                    onChange={handleChange}
                    className="w-full p-2 border rounded"
                  >
                    <option value="">Select issue type</option>
                    {ISSUE_OPTIONS.map(issue => (
                      <option key={issue.value} value={issue.value}>{issue.label}</option>
                    ))}
                  </select>
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
                  className="w-full p-2 border rounded"
                  rows={4}
                />
              </div>
            )}
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Additional Information</h3>
            <div>
              <label className="block text-sm font-medium mb-1">Timeline</label>
              <select
                name="timeline"
                value={formData.timeline}
                onChange={handleChange}
                className="w-full p-2 border rounded"
              >
                <option value="">Select timeline</option>
                {TIMELINE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Budget (USD)</label>
              <input
                type="text"
                name="budget"
                value={formData.budget}
                onChange={handleChange}
                className="w-full p-2 border rounded"
                placeholder="e.g., 1000 or 500-1000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Additional Details</label>
              <textarea
                name="details"
                value={formData.details || ''}
                onChange={handleChange}
                className="w-full p-2 border rounded"
                rows={4}
              />
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Review and Submit</h3>
            <div className="bg-gray-50 p-4 rounded">
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
        <div className="flex justify-between mb-2">
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className={`flex-1 text-center py-2 ${step <= currentStep ? 'bg-blue-500 text-white' : 'bg-gray-200'} rounded mx-1`}
            >
              {step}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs px-2">
          <span>Quote Type</span>
          <span>Scope</span>
          <span>Details</span>
          <span>Submit</span>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {renderStep()}

        <div className="mt-8 flex justify-between">
          {currentStep > 1 && (
            <button
              type="button"
              onClick={handlePrev}
              className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
            >
              Previous
            </button>
          )}
          <div className="flex-grow"></div>
          {currentStep < 4 ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              disabled={!formData.quoteType} // Example validation: must have selected a quote type to proceed
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Quote'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
