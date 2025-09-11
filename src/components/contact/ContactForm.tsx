import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';

type ContactFormState = {
  name: string;
  email: string;
  phone: string;
  service: string;
  message: string;
};

const initialState: ContactFormState = {
  name: '',
  email: '',
  phone: '',
  service: '',
  message: '',
};

export default function ContactForm() {
  const [mounted, setMounted] = useState(false);
  const [values, setValues] = useState<ContactFormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    setMounted(true);
  }, []);

  const canSubmit = useMemo(() => {
    return (
      values.name.trim().length > 0 &&
      values.email.trim().length > 0 &&
      values.message.trim().length > 0
    );
  }, [values]);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setValues((v) => ({ ...v, [name]: value }));
    },
    []
  );

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit || submitting) return;
      setSubmitting(true);
      setSuccessMsg('');
      setErrorMsg('');
      try {
        // Write to contactRequests with required fields
        await addDoc(collection(db, 'contactRequests'), {
          fullName: values.name.trim(),
          email: values.email.trim().toLowerCase(),
          phone: values.phone.trim(),
          message: values.message.trim(),
          createdAt: serverTimestamp(),
          status: 'pending',
          service: values.service || null,
        });
        setSuccessMsg('your data submitted successfully');
        setValues(initialState);
      } catch (err) {
        console.error('Contact form save failed:', err);
        setErrorMsg('Sorry, there was an error sending your message. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [values, canSubmit, submitting]
  );

  return (
    <form 
      className={`space-y-6 ${mounted ? 'reveal-on-scroll' : 'opacity-0'}`} 
      style={mounted ? {} : { transform: 'translateY(20px)' }}
      onSubmit={onSubmit}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Full Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal focus:border-transparent dark:bg-gray-800 dark:text-white"
            placeholder="John Doe"
            value={values.name}
            onChange={onChange}
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Email Address *
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal focus:border-transparent dark:bg-gray-800 dark:text-white"
            placeholder="john@example.com"
            value={values.email}
            onChange={onChange}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Phone Number
        </label>
        {mounted && (
          <PhoneInput
            country="in"
            value={values.phone}
            onChange={(phone: string) => setValues(v => ({ ...v, phone }))}
            disableCountryGuess={true}
            disableCountryCode={false}
            disableDropdown={false}
            inputProps={{
              name: 'phone',
              required: true,
              className: 'w-full !pl-14 !py-3 !border !border-gray-300 dark:!border-gray-600 !rounded-lg focus:!ring-2 focus:!ring-teal focus:!border-transparent dark:!bg-gray-800 dark:!text-white',
            }}
            containerClass="w-full"
            buttonClass="!bg-gray-100 dark:!bg-gray-700 !border-r !border-gray-300 dark:!border-gray-600 !rounded-l-lg !p-0 !w-12 !h-full !flex !items-center !justify-center hover:!bg-gray-200 dark:hover:!bg-gray-600 focus:!ring-2 focus:!ring-teal focus:!outline-none transition-colors duration-200 ease-in-out hover:shadow-inner"
            dropdownClass="!border !border-gray-200 dark:!border-gray-700 !rounded-lg !shadow-lg !bg-white dark:!bg-gray-800 !left-1/2 !-translate-x-1/2 !fixed !z-50 !w-80 [&_.highlight]:!bg-teal/20 [&_.highlight]:dark:!bg-teal/30 [&_.highlight]:!text-gray-900 dark:[&_.highlight]:!text-white [&_.country.highlight]:!bg-teal/10 dark:[&_.country.highlight]:!bg-teal/20 [&_.country:hover]:!bg-gray-100 dark:[&_.country:hover]:!bg-gray-700 [&_.country:hover_.country-name]:!text-gray-900 dark:[&_.country:hover_.country-name]:!text-white"
            containerStyle={{ width: '100%' }}
            inputStyle={{
              width: '100%',
              height: 'auto',
              paddingLeft: '3.5rem',
              backgroundColor: 'transparent',
            }}
            buttonStyle={{
              backgroundColor: 'transparent',
              border: 'none',
            }}
            dropdownStyle={{
              borderRadius: '0.5rem',
              marginTop: '0.25rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              maxHeight: '300px',
              overflowY: 'auto',
            }}
            searchPlaceholder="Search country..."
            searchClass="!w-[calc(100%-1rem)] !mx-2 !my-1 !px-3 !py-2 !text-sm !rounded-lg !border !border-gray-300 dark:!border-gray-600 focus:!ring-2 focus:!ring-teal focus:!border-transparent dark:!bg-gray-800 dark:!text-white"
            searchNotFound="No country found"
            enableSearch
            countryCodeEditable={false}
            disableSearchIcon
            preferredCountries={['us', 'gb', 'ca', 'au', 'in']}
          />
        )}
      </div>

      <div>
        <label htmlFor="service" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Service Needed
        </label>
        <select
          id="service"
          name="service"
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal focus:border-transparent dark:bg-gray-800 dark:text-white"
          value={values.service}
          onChange={onChange}
        >
          <option value="">Select a service...</option>
          <option value="security">Security Systems</option>
          <option value="lighting">Smart Lighting</option>
          <option value="climate">Climate Control</option>
          <option value="entertainment">Entertainment Systems</option>
          <option value="networking">Home Networking</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Message *
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          required
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal focus:border-transparent dark:bg-gray-800 dark:text-white"
          placeholder="Tell us about your project..."
          value={values.message}
          onChange={onChange}
        />
      </div>

      <button type="submit" className="btn-primary w-full btn-magnetic disabled:opacity-60 disabled:cursor-not-allowed" disabled={!canSubmit || submitting}>
        {submitting ? 'Sending…' : 'Send Message'}
      </button>

      {successMsg && (
        <p className="text-green-600 dark:text-green-400 text-sm" role="status">{successMsg}</p>
      )}
      {errorMsg && (
        <p className="text-red-600 dark:text-red-400 text-sm" role="alert">{errorMsg}</p>
      )}
    </form>
  );
}
