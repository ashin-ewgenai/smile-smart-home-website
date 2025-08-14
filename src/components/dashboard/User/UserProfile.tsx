import React, { useState, useEffect } from 'react';
import { Save, User, Mail, Phone, MapPin, Calendar, Home } from 'lucide-react';

const UserProfile: React.FC = () => {
  const [email, setEmail] = useState('user@smilesmarthome.in');
  const [name, setName] = useState('User');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [joinDate, setJoinDate] = useState('August 14, 2025');
  const [saveStatus, setSaveStatus] = useState('');
  
  // Get user info from localStorage
  useEffect(() => {
    const storedEmail = localStorage.getItem('userEmail');
    if (storedEmail) {
      setEmail(storedEmail);
      
      // Extract name from email (simple approach)
      const extractedName = storedEmail.split('@')[0];
      // Capitalize first letter
      setName(extractedName.charAt(0).toUpperCase() + extractedName.slice(1));
    }
    
    // Get other profile data if available
    const storedPhone = localStorage.getItem('userPhone');
    if (storedPhone) setPhone(storedPhone);
    
    const storedAddress = localStorage.getItem('userAddress');
    if (storedAddress) setAddress(storedAddress);
  }, []);
  
  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Save profile data to localStorage
    localStorage.setItem('userPhone', phone);
    localStorage.setItem('userAddress', address);
    
    // Show success message
    setSaveStatus('Profile updated successfully!');
    
    // Clear success message after 3 seconds
    setTimeout(() => {
      setSaveStatus('');
    }, 3000);
  };
  
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Profile</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage your personal information</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700 flex flex-col items-center">
          <div className="h-24 w-24 rounded-full bg-blue-500 flex items-center justify-center mb-4">
            <User className="h-12 w-12 text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{name}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Smart Home User</p>
          
          <div className="w-full space-y-3">
            <div className="flex items-center text-sm">
              <Mail className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" />
              <span className="text-gray-600 dark:text-gray-300">{email}</span>
            </div>
            {phone && (
              <div className="flex items-center text-sm">
                <Phone className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" />
                <span className="text-gray-600 dark:text-gray-300">{phone}</span>
              </div>
            )}
            {address && (
              <div className="flex items-center text-sm">
                <MapPin className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" />
                <span className="text-gray-600 dark:text-gray-300">{address}</span>
              </div>
            )}
            <div className="flex items-center text-sm">
              <Calendar className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" />
              <span className="text-gray-600 dark:text-gray-300">Joined: {joinDate}</span>
            </div>
            <div className="flex items-center text-sm">
              <Home className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" />
              <span className="text-gray-600 dark:text-gray-300">Devices: 8</span>
            </div>
          </div>
        </div>
        
        {/* Edit Profile Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Edit Profile</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  disabled
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g., +1 (555) 123-4567"
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label htmlFor="homeName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Home Name
                </label>
                <input
                  type="text"
                  id="homeName"
                  name="homeName"
                  defaultValue="My Smart Home"
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
            
            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Address
              </label>
              <textarea
                id="address"
                name="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                placeholder="Enter your address"
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              ></textarea>
            </div>
            
            <div>
              <label htmlFor="joinDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Join Date
              </label>
              <input
                type="text"
                id="joinDate"
                name="joinDate"
                value={joinDate}
                disabled
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            
            {/* Save Button */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              {saveStatus && (
                <div className="mb-4 p-3 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-lg">
                  {saveStatus}
                </div>
              )}
              <button
                type="submit"
                className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg flex items-center justify-center"
              >
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
