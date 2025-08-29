import React, { useCallback, useMemo, useState } from 'react';
import { db } from '../../lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

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
  const [values, setValues] = useState<ContactFormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

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
    <form className="space-y-6 reveal-on-scroll" onSubmit={onSubmit}>
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
        <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Phone Number
        </label>
        <input
          type="tel"
          id="phone"
          name="phone"
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal focus:border-transparent dark:bg-gray-800 dark:text-white"
          placeholder="+1 (555) 123-4567"
          value={values.phone}
          onChange={onChange}
        />
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
