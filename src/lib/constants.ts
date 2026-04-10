// Centralized constants
// Change this to rotate your Super Admin URL namespace
export const SUPER_ADMIN_HASH_SEGMENT = 'super_admin-a1b2c3';

export const SUPER_ADMIN_BASE_PATH = `/${SUPER_ADMIN_HASH_SEGMENT}`;

// Device Recommendation Options
export const HOUSE_SIZES = [
  'Small Apartment',
  'Large Apartment',
  '3-Bedroom House',
  '4-Bedroom House',
  'Villa',
  'Office Space'
];

export const SECURITY_LEVELS = ['Low', 'Medium', 'High'];

export const BUDGET_RANGES = [
  { label: 'Economy (₹500 - ₹1,500)', value: 1500 },
  { label: 'Standard (₹1,500 - ₹5,000)', value: 5000 },
  { label: 'Premium (₹5,000+)', value: 15000 }
];
