import React, { useState, useEffect } from 'react';
import { Save, User, Mail, Phone, MapPin, Calendar, Home } from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { COLLECTION_USER_DEVICES } from '../../../models/Collections';

interface UserData {
  Email: string;
  FullName: string;
  LastLoginAt: any; // Firestore timestamp
  CreatedAt: any;   // Firestore timestamp
  address: string;
  phoneNumber: string;
  [key: string]: any; // Add index signature to allow string indexing
}

const UserProfile: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<UserData>({
    Email: '',
    FullName: '',
    LastLoginAt: null,
    CreatedAt: null,
    address: '',
    phoneNumber: ''
  });
  const [saveStatus, setSaveStatus] = useState('');
  const [deviceCount, setDeviceCount] = useState(0);
  
  // Fetch user's device count
  useEffect(() => {
    const fetchDeviceCount = async () => {
      try {
        const userId = localStorage.getItem('userId');
        if (!userId) return;
        
        const q = query(
          collection(db, COLLECTION_USER_DEVICES),
          where('uid', '==', userId)
        );
        
        const querySnapshot = await getDocs(q);
        setDeviceCount(querySnapshot.size);
      } catch (error) {
        console.error('Error fetching device count:', error);
      }
    };
    
    fetchDeviceCount();
  }, []);
  
  // Fetch user data from Firestore
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        const userEmail = localStorage.getItem('userEmail') || '';
        const userId = localStorage.getItem('userId') || '';
        
        if (!userId) {
          setSaveStatus('User not authenticated');
          setLoading(false);
          return;
        }

        // Get user document from Firestore using UID
        const userDocRef = doc(db, 'Accounts', userId);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const data = userDoc.data() as UserData;
          setUserData({
            Email: data.Email || userEmail,
            FullName: data.FullName || userEmail.split('@')[0],
            LastLoginAt: data.LastLoginAt || new Date(),
            CreatedAt: data.CreatedAt || new Date(),
            address: data.address || '',
            phoneNumber: data.phoneNumber || ''
          });
          
          // Update local storage with the latest values
          if (data.phoneNumber) localStorage.setItem('userPhone', data.phoneNumber);
          if (data.address) localStorage.setItem('userAddress', data.address);
        } else {
          // If user document doesn't exist, create it with default values
          const defaultData: UserData = {
            Email: userEmail,
            FullName: userEmail.split('@')[0],
            LastLoginAt: new Date(),
            CreatedAt: new Date(),
            address: '',
            phoneNumber: ''
          };
          // Create a new document with the user's UID as the document ID
          await setDoc(userDocRef, defaultData);
          setUserData(defaultData);
          
          // Also update local storage with default values
          localStorage.setItem('userPhone', defaultData.phoneNumber);
          localStorage.setItem('userAddress', defaultData.address);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        setSaveStatus('Error loading profile data');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const userId = localStorage.getItem('userId');
      const userEmail = localStorage.getItem('userEmail') || '';
      
      if (!userId) {
        setSaveStatus('User not authenticated');
        return;
      }
      
      // Create update data object
      const now = new Date();
      const updateData = {
        Email: userEmail,
        FullName: userData.FullName || '',
        phoneNumber: userData.phoneNumber || '',
        address: userData.address || '',
        LastLoginAt: now,  // Update last login time
        // Don't update CreatedAt as it should remain the original creation date
        ...(userData.CreatedAt ? {} : { CreatedAt: now }) // Only set if it doesn't exist
      };
      
      // Update Firestore document using UID
      const userDocRef = doc(db, 'Accounts', userId);
      await setDoc(userDocRef, updateData, { merge: true });
      
      // Update local storage for quick access
      localStorage.setItem('userPhone', updateData.phoneNumber);
      localStorage.setItem('userAddress', updateData.address);
      
      // Update local state to ensure UI is in sync
      setUserData(prev => ({
        ...prev,
        ...updateData
      }));
      
      // Show success message
      setSaveStatus('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      setSaveStatus('Error updating profile');
    }
    
    // Clear success message after 3 seconds
    setTimeout(() => {
      setSaveStatus('');
    }, 3000);
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500"></div>
      </div>
    );
  }

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
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{userData.FullName || 'User'}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Smart Home User</p>
          
          <div className="w-full space-y-3">
            <div className="flex items-center text-sm">
              <Mail className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" />
              <span className="text-gray-600 dark:text-gray-300">{userData.Email}</span>
            </div>
            {userData.phoneNumber && (
              <div className="flex items-center text-sm">
                <Phone className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" />
                <span className="text-gray-600 dark:text-gray-300">{userData.phoneNumber}</span>
              </div>
            )}
            {userData.address && (
              <div className="flex items-center text-sm">
                <MapPin className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" />
                <span className="text-gray-600 dark:text-gray-300">{userData.address}</span>
              </div>
            )}
            <div className="flex items-center text-sm">
              <Calendar className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" />
              <span className="text-gray-600 dark:text-gray-300">
                Last Login: {userData.LastLoginAt ? (typeof userData.LastLoginAt === 'object' ? new Date(userData.LastLoginAt.seconds * 1000).toLocaleString() : new Date(userData.LastLoginAt).toLocaleString()) : 'N/A'}
              </span>
            </div>
            {userData.CreatedAt && (
              <div className="flex items-center text-sm">
                <Calendar className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" />
                <span className="text-gray-600 dark:text-gray-300">
                  Member Since: {typeof userData.CreatedAt === 'object' ? new Date(userData.CreatedAt.seconds * 1000).toLocaleDateString() : new Date(userData.CreatedAt).toLocaleDateString()}
                </span>
              </div>
            )}
            <div className="flex items-center text-sm">
              <Home className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" />
              <span className="text-gray-600 dark:text-gray-300">
                Devices: {deviceCount}
              </span>
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
                  value={userData.FullName}
                  onChange={(e) => setUserData({...userData, FullName: e.target.value})}
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
                  value={userData.Email}
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
                  value={userData.phoneNumber || ''}
                  onChange={(e) => setUserData({...userData, phoneNumber: e.target.value})}
                  placeholder="e.g., +1 (555) 123-4567"
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
                value={userData.address}
                onChange={(e) => setUserData({...userData, address: e.target.value})}
                rows={3}
                placeholder="Enter your address"
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              ></textarea>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="lastLogin" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Last Login
                </label>
                <input
                  type="text"
                  id="lastLogin"
                  name="lastLogin"
                  value={userData.LastLoginAt ? (typeof userData.LastLoginAt === 'object' ? new Date(userData.LastLoginAt.seconds * 1000).toLocaleString() : new Date(userData.LastLoginAt).toLocaleString()) : 'N/A'}
                  disabled
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label htmlFor="memberSince" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Member Since
                </label>
                <input
                  type="text"
                  id="memberSince"
                  name="memberSince"
                  value={userData.CreatedAt ? (typeof userData.CreatedAt === 'object' ? new Date(userData.CreatedAt.seconds * 1000).toLocaleDateString() : new Date(userData.CreatedAt).toLocaleDateString()) : 'N/A'}
                  disabled
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
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
