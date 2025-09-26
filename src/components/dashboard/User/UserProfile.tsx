import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Save, User, Mail, Phone, MapPin, Calendar, Home, Camera } from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, setDoc, where, Timestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { auth, db, storage, firebaseApp } from '../../../lib/firebase';
import { COLLECTION_USER_DEVICES } from '../../../models/Collections';
import { useNavigate } from 'react-router-dom';

// Helper function to safely convert Firestore Timestamp to Date
const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value && typeof value === 'object') {
    if ('toDate' in value) {
      return (value as { toDate: () => Date }).toDate();
    }
    // Handle Firestore Timestamp with seconds and nanoseconds
    if ('seconds' in value && typeof (value as any).seconds === 'number') {
      return new Date((value as any).seconds * 1000);
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return new Date(value);
  }
  return null;
};

interface UserData {
  Email: string;
  FullName: string;
  LastLoginAt: Date | Timestamp | null;
  CreatedAt: Date | Timestamp | null;
  address: string;
  phoneNumber: string;
  profilePic?: string;
  [key: string]: unknown;
}

const UserProfile: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  const [userData, setUserData] = useState<UserData>({
    Email: '',
    FullName: '',
    LastLoginAt: null,
    CreatedAt: null,
    address: '',
    phoneNumber: ''
  });
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [deviceCount, setDeviceCount] = useState<number>(0);
  const [profilePicUrl, setProfilePicUrl] = useState<string>('');
  const [picStatus, setPicStatus] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  // Fetch user's device count
  const fetchDeviceCount = useCallback(async () => {
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
  }, []);

  // Fetch user data from Firestore
  const fetchUserData = useCallback(async () => {
    try {
      setLoading(true);
      const userEmail = localStorage.getItem('userEmail');
      const userId = auth.currentUser?.uid || localStorage.getItem('userId');
      
      if (!userId || !userEmail) {
        console.error('User authentication data missing');
        setSaveStatus('Please sign in to view your profile');
        setLoading(false);
        // Don't navigate here, just show the error message
        return;
      }

      // Get user document from Firestore using UID
      const userDocRef = doc(db, 'Accounts', userId);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data() as UserData;
        console.log('User data from Firestore:', data);
        
        // Convert Firestore Timestamps to Date objects if needed
        const userDataUpdate: UserData = {
          Email: data.Email || userEmail,
          FullName: data.FullName || userEmail.split('@')[0],
          LastLoginAt: data.LastLoginAt ? toDate(data.LastLoginAt) : new Date(),
          CreatedAt: data.CreatedAt ? toDate(data.CreatedAt) : new Date(),
          address: data.address || '',
          phoneNumber: data.phoneNumber || ''
        };
        
        setUserData(userDataUpdate);
        setProfilePicUrl(typeof data.profilePic === 'string' ? data.profilePic : '');
        
        // Update local storage with the latest values
        if (data.phoneNumber) localStorage.setItem('userPhone', data.phoneNumber as string);
        if (data.address) localStorage.setItem('userAddress', data.address as string);
      } else {
        console.log('No user document found, creating new one');
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
      console.error('Error in fetchUserData:', error);
      setSaveStatus('Error loading profile data');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  // Fetch data on component mount
  useEffect(() => {
    fetchUserData();
    fetchDeviceCount();
  }, [fetchUserData, fetchDeviceCount]);
  
  // Handle profile picture selection & upload (moved to component scope)
  const onPickFile = () => {
    fileInputRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      setPicStatus('Uploading photo...');

      // Immediate local preview so the user sees the selected image instantly
      try {
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const localUrl = URL.createObjectURL(file);
        previewUrlRef.current = localUrl;
        setProfilePicUrl(localUrl);
      } catch {}

      // Basic validation
      const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
      if (!allowed.includes(file.type)) {
        setPicStatus('Please select a JPG or PNG image.');
        e.target.value = '';
        return;
      }

      const uid = auth.currentUser?.uid || localStorage.getItem('userId');
      if (!uid) {
        setPicStatus('You must be signed in to upload a photo.');
        return;
      }

      const ext = file.type === 'image/png' ? 'png' : 'jpg';
      const path = `profile/${uid}.${ext}`;
      const ref = storageRef(storage, path);
      console.debug('[UserProfile] Starting upload', { uid, path, bucket: firebaseApp.options?.storageBucket });
      const task = uploadBytesResumable(ref, file, { contentType: file.type });

      // Watchdog: if no progress > 0 within 15s, cancel and hint likely causes
      let stalled = true;
      const stallTimer = setTimeout(() => {
        if (stalled) {
          try { task.cancel(); } catch {}
          setPicStatus('Error: Upload stalled. Ensure you are signed in, Storage rules allow profile/{uid}.jpg|png, and storageBucket is set.');
        }
      }, 15000);

      task.on('state_changed', (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        // Lightweight status feedback
        setPicStatus(`Uploading... ${pct}%`);
        if (pct > 0 && stalled) {
          stalled = false;
          clearTimeout(stallTimer);
        }
      });
      await task;
      clearTimeout(stallTimer);
      const url = await getDownloadURL(ref);

      // Save URL to Firestore (Accounts/{uid} profilePic)
      const userDocRef = doc(db, 'Accounts', uid);
      await setDoc(userDocRef, { profilePic: url, updatedAt: new Date() }, { merge: true });

      // Replace local preview with the permanent download URL
      setProfilePicUrl(url);
      try { if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null; } } catch {}
      setPicStatus('Profile photo updated successfully.');
      setTimeout(() => setPicStatus(''), 2500);
    } catch (error: any) {
      console.error('Failed to upload profile photo:', error);
      const msg = error?.message || 'Failed to upload profile photo.';
      setPicStatus(`Error: ${msg}`);
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaveStatus('Saving changes...');
    
    try {
      const userId = localStorage.getItem('userId');
      const userEmail = localStorage.getItem('userEmail') || '';
      
      if (!userId) {
        throw new Error('User not authenticated');
      }
      
      console.log('Updating profile for user:', userId);
      
      // Create update data object with only changed fields
      const updateData: Record<string, any> = {
        Email: userEmail,
        FullName: userData.FullName || '',
        phoneNumber: userData.phoneNumber || '',
        address: userData.address || '',
        LastLoginAt: new Date(),
        updatedAt: new Date()
      };

      // Only set CreatedAt if it doesn't exist
      if (!userData.CreatedAt) {
        updateData.CreatedAt = new Date();
      }
      
      console.log('Update data:', updateData);
      
      // Update Firestore document using UID with merge option
      const userDocRef = doc(db, 'Accounts', userId);
      console.log('Updating document at path:', userDocRef.path);
      
      await setDoc(userDocRef, updateData, { merge: true });
      
      console.log('Document updated successfully');
      
      // Update local storage for quick access
      localStorage.setItem('userPhone', updateData.phoneNumber);
      localStorage.setItem('userAddress', updateData.address);
      localStorage.setItem('userName', updateData.FullName);
      
      // Update local state to ensure UI is in sync
      setUserData(prev => ({
        ...prev,
        ...updateData
      }));
      
      // Show success message
      setSaveStatus('Profile updated successfully!');
      
      // Clear success message after 3 seconds
      const timer = setTimeout(() => {
        setSaveStatus('');
      }, 3000);
      
      return () => clearTimeout(timer);
    } catch (error: any) {
      console.error('Error updating profile:', error);
      const errorMessage = error?.message || 'Failed to update profile. Please try again.';
      console.error('Error details:', {
        code: error?.code,
        message: errorMessage,
        stack: error?.stack
      });
      setSaveStatus(`Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500 mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400">Loading your profile...</p>
      </div>
    );
  }
  
  if (saveStatus && (saveStatus.startsWith('Error') || saveStatus === 'User not authenticated' || saveStatus === 'Please sign in to view your profile')) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="bg-red-100 dark:bg-red-900/30 p-4 rounded-lg mb-4">
          <p className="text-red-700 dark:text-red-300">{saveStatus}</p>
        </div>
        <button 
          onClick={() => window.location.href = '/login'}
          className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors"
        >
          Go to Login
        </button>
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
          <div className="relative h-24 w-24 rounded-full overflow-hidden bg-blue-500 flex items-center justify-center mb-4">
            {profilePicUrl ? (
              <img src={profilePicUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <User className="h-12 w-12 text-white" />
            )}
            <button
              type="button"
              onClick={onPickFile}
              className="absolute bottom-0 right-0 mb-1 mr-1 inline-flex items-center justify-center h-8 w-8 rounded-full bg-black/70 text-white hover:bg-black/80 focus:outline-none border border-white/20"
              title="Change photo"
            >
              <Camera className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              className="hidden"
              onChange={onFileChange}
            />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{userData.FullName || 'User'}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Smart Home User</p>
          {picStatus && (
            <div className={`text-xs mb-2 ${picStatus.startsWith('Error') ? 'text-red-600 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
              {picStatus}
            </div>
          )}
          
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
                Last Login: {userData.LastLoginAt ? (userData.LastLoginAt instanceof Date ? userData.LastLoginAt.toLocaleString() : 'N/A') : 'N/A'}
              </span>
            </div>
            {userData.CreatedAt && (
              <div className="flex items-center text-sm">
                <Calendar className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" />
                <span className="text-gray-600 dark:text-gray-300">
                  Member Since: {userData.CreatedAt instanceof Date ? userData.CreatedAt.toLocaleDateString() : 'N/A'}
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
                  value={userData.LastLoginAt ? toDate(userData.LastLoginAt)?.toLocaleString() || 'N/A' : 'N/A'}
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
                  value={userData.CreatedAt ? toDate(userData.CreatedAt)?.toLocaleDateString() || 'N/A' : 'N/A'}
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
