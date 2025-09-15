import React, { useState, useEffect } from 'react';
import { Save, User, Bell, Shield, Globe, Moon, Sun, Home, Lock } from 'lucide-react';
import ChangePassword from './ChangePassword';

const UserSettings: React.FC = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [deviceAlerts, setDeviceAlerts] = useState(true);
  const [language, setLanguage] = useState('en');
  const [saveStatus, setSaveStatus] = useState('');
  const [userName, setUserName] = useState('User');
  const [userEmail, setUserEmail] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  
  // Get user info and preferences from localStorage
  useEffect(() => {
    // Get dark mode preference
    const isDarkMode = localStorage.getItem('darkMode') === 'true' || 
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDarkMode(isDarkMode);
    
    // Get user email
    const email = localStorage.getItem('userEmail');
    if (email) {
      setUserEmail(email);
      
      // Extract name from email (simple approach)
      const name = email.split('@')[0];
      // Capitalize first letter
      setUserName(name.charAt(0).toUpperCase() + name.slice(1));
    }
    
    // Get notification preferences
    setEmailNotifications(localStorage.getItem('emailNotifications') !== 'false');
    setPushNotifications(localStorage.getItem('pushNotifications') !== 'false');
    setDeviceAlerts(localStorage.getItem('deviceAlerts') !== 'false');
    
    // Get language preference
    const savedLanguage = localStorage.getItem('language');
    if (savedLanguage) {
      setLanguage(savedLanguage);
    }
  }, []);
  
  // Toggle dark mode
  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    localStorage.setItem('darkMode', String(newDarkMode));
    
    // Apply dark mode to document
    if (newDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };
  
  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Save settings to localStorage
    localStorage.setItem('emailNotifications', String(emailNotifications));
    localStorage.setItem('pushNotifications', String(pushNotifications));
    localStorage.setItem('deviceAlerts', String(deviceAlerts));
    localStorage.setItem('language', language);
    
    // Show success message
    setSaveStatus('Settings saved successfully!');
    
    // Clear success message after 3 seconds
    setTimeout(() => {
      setSaveStatus('');
    }, 3000);
  };
  
  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">User Settings</h1>
        <p className="text-gray-400 mt-1">Manage your account settings and preferences</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Account Settings */}
        <div className="glass-surface rounded-2xl p-6 shadow-soft-lg">
          <h2 className="text-xl font-semibold text-white flex items-center mb-4">
            <User className="mr-2 h-5 w-5 text-emerald-400" />
            Account Settings
          </h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm text-gray-400 mb-1">Email Address</label>
              <input
                type="email"
                id="email"
                name="email"
                value={userEmail}
                disabled
                className="w-full pill-input px-4 py-2"
              />
            </div>
            <div>
              <label htmlFor="name" className="block text-sm text-gray-400 mb-1">Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full pill-input px-4 py-2"
              />
            </div>
          </div>
          <div className="border-t border-gray-700 my-4" />
          {/* Home Settings */}
          <h2 className="text-xl font-semibold text-white flex items-center mb-4">
            <Home className="mr-2 h-5 w-5 text-emerald-400" />
            Home Settings
          </h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="homeName" className="block text-sm text-gray-400 mb-1">Home Name</label>
              <input
                type="text"
                id="homeName"
                name="homeName"
                defaultValue="My Smart Home"
                className="w-full pill-input px-4 py-2"
              />
            </div>
            <div>
              <label htmlFor="homeAddress" className="block text-sm text-gray-400 mb-1">Home Address</label>
              <input
                type="text"
                id="homeAddress"
                name="homeAddress"
                defaultValue="123 Smart Street, Tech City"
                className="w-full pill-input px-4 py-2"
              />
            </div>
          </div>
        </div>

        {/* Security Settings */}
        <div className="glass-surface rounded-2xl p-6 shadow-soft-lg">
          <h2 className="text-xl font-semibold text-white flex items-center mb-4">
            <Shield className="mr-2 h-5 w-5 text-emerald-400" />
            Security
          </h2>
          {/* Clickable field to reveal Change Password */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowChangePassword((v) => !v)}
              className="w-full flex items-center justify-between rounded-full border border-white/20 bg-white/5 px-4 py-3 text-left hover:border-emerald-500/40 hover:bg-white/10 transition"
              aria-expanded={showChangePassword}
            >
              <div className="flex items-center gap-3">
                <Lock className="h-4 w-4 text-emerald-400" />
                <div>
                  <p className="text-sm font-medium text-white">Change Password</p>
                  <p className="text-xs text-gray-400">Update your account password</p>
                </div>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-5 w-5 text-gray-400 transition-transform ${showChangePassword ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {showChangePassword && (
              <div className="max-w-2xl">
                <ChangePassword />
              </div>
            )}
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-gray-900/60 backdrop-blur rounded-2xl shadow-lg p-6 border border-gray-800">
          <h2 className="text-xl font-semibold text-white flex items-center mb-4">
            <Bell className="mr-2 h-5 w-5 text-emerald-400" />
            Notification Settings
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-white">Email Notifications</h3>
                <p className="text-xs text-gray-400">Receive email notifications for important updates</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={emailNotifications} onChange={() => setEmailNotifications(!emailNotifications)} />
                <div className="w-12 h-7 rounded-full bg-gray-700 border border-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-400 transition peer-checked:bg-emerald-500 shadow-inner after:content-[''] after:absolute after:h-6 after:w-6 after:translate-x-0 after:rounded-full after:bg-white after:shadow after:transition-all after:top-0.5 after:left-0.5 peer-checked:after:translate-x-5"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-white">Push Notifications</h3>
                <p className="text-xs text-gray-400">Receive push notifications for important updates</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={pushNotifications} onChange={() => setPushNotifications(!pushNotifications)} />
                <div className="w-12 h-7 rounded-full bg-gray-700 border border-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-400 transition peer-checked:bg-emerald-500 shadow-inner after:content-[''] after:absolute after:h-6 after:w-6 after:translate-x-0 after:rounded-full after:bg-white after:shadow after:transition-all after:top-0.5 after:left-0.5 peer-checked:after:translate-x-5"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-white">Device Alerts</h3>
                <p className="text-xs text-gray-400">Receive notifications for device-related events</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={deviceAlerts} onChange={() => setDeviceAlerts(!deviceAlerts)} />
                <div className="w-12 h-7 rounded-full bg-gray-700 border border-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-400 transition peer-checked:bg-emerald-500 shadow-inner after:content-[''] after:absolute after:h-6 after:w-6 after:translate-x-0 after:rounded-full after:bg-white after:shadow after:transition-all after:top-0.5 after:left-0.5 peer-checked:after:translate-x-5"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Appearance Settings moved to navbar dark mode toggle */}

        {/* Language Settings */}
        <div className="bg-gray-900/60 backdrop-blur rounded-2xl shadow-lg p-6 border border-gray-800">
          <h2 className="text-xl font-semibold text-white flex items-center mb-4">
            <Globe className="mr-2 h-5 w-5 text-emerald-400" />
            Language
          </h2>
          <div>
            <label htmlFor="language" className="block text-sm text-gray-400 mb-1">Select Language</label>
            <select
              id="language"
              name="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full pill-input px-4 py-2"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="hi">Hindi</option>
            </select>
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-2">
          {saveStatus && (
            <div className="mb-4 p-3 bg-emerald-900/40 text-emerald-200 border border-emerald-700 rounded-lg">
              {saveStatus}
            </div>
          )}
          <button
            type="submit"
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-full px-6 py-2 shadow-soft transition"
          >
            <Save className="h-4 w-4" />
            Save Settings
          </button>
        </div>
      </form>
    </div>
  );
};

export default UserSettings;
