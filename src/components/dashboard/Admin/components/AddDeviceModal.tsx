import { useEffect, useState } from 'react';
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../../lib/firebase';

interface AddDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onDeviceAdded: () => void;
}

interface Device {
  id: string;
  deviceName: string;
  type: string;
  modelNumber: string;
  brand: string;
  description?: string;
  warranty?: string;
  status?: string;
  stock?: number;
  imageUrl?: string;
  createdAt?: any;
  createdByEmail?: string;
  createdByUid?: string;
}

export default function AddDeviceModal({ isOpen, onClose, userId, onDeviceAdded }: AddDeviceModalProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'add' | 'remove'>('add');

  const fetchDevices = async () => {
    if (!isOpen) return;
    
    try {
      setIsLoading(true);
      setError(null);

      // Get all devices
      const devicesSnapshot = await getDocs(collection(db, 'Devices'));
      const allDevices = devicesSnapshot.docs.map(doc => ({
        id: doc.id,
        deviceName: doc.data().deviceName || 'Unnamed Device',
        type: doc.data().type || 'Unknown',
        modelNumber: doc.data().modelNumber || '',
        brand: doc.data().brand || '',
        description: doc.data().description || '',
        warranty: doc.data().warranty || '',
        status: doc.data().status || 'Active',
        stock: doc.data().stock || 0,
        imageUrl: doc.data().imageUrl,
        ...doc.data()
      } as Device));

      // Get user's current devices
      const userDevicesSnapshot = await getDocs(collection(db, 'userdevices', userId, 'devices'));
      const userDeviceIds = new Set(userDevicesSnapshot.docs.map(doc => doc.id));

      if (viewMode === 'add') {
        // In add mode, show only devices not assigned to the user
        const availableDevices = allDevices.filter(device => !userDeviceIds.has(device.id));
        setDevices(availableDevices);
      } else {
        // In remove mode, show only devices assigned to the user
        const userDevices = allDevices.filter(device => userDeviceIds.has(device.id));
        setDevices(userDevices);
      }
    } catch (err) {
      console.error('Error fetching devices:', err);
      setError('Failed to load devices. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch devices when modal opens or view mode changes
  useEffect(() => {
    fetchDevices();
  }, [isOpen, userId, viewMode]);

  const handleAddDevices = async () => {
    if (selectedDevices.length === 0) return;

    try {
      setError(null);
      const batch = [];
      const now = new Date().toISOString();

      for (const deviceId of selectedDevices) {
        const deviceRef = doc(db, 'userdevices', userId, 'devices', deviceId);
        batch.push(
          setDoc(deviceRef, {
            addedAt: now,
            isOnline: false,
            lastActiveAt: null,
            updatedAt: now
          }, { merge: true })
        );
      }

      await Promise.all(batch);
      onDeviceAdded();
      onClose();
    } catch (err) {
      console.error('Error adding devices:', err);
      setError('Failed to add devices. Please try again.');
    }
  };

  const handleRemoveDevices = async () => {
    if (selectedDevices.length === 0) return;

    try {
      setError(null);
      const batch = [];

      for (const deviceId of selectedDevices) {
        const deviceRef = doc(db, 'userdevices', userId, 'devices', deviceId);
        batch.push(deleteDoc(deviceRef));
      }

      await Promise.all(batch);
      onDeviceAdded();
      onClose();
    } catch (err) {
      console.error('Error removing devices:', err);
      setError('Failed to remove devices. Please try again.');
    }
  };

  if (!isOpen) return null;


  return (
    <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ${isOpen ? 'block' : 'hidden'}`}>
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-white">
            {viewMode === 'add' ? 'Add Devices' : 'Remove Devices'}
          </h3>
          <div className="flex items-center space-x-4">
            <div className="flex rounded-md shadow-sm" role="group">
              <button
                type="button"
                onClick={() => setViewMode('add')}
                className={`px-4 py-2 text-sm font-medium rounded-l-lg ${
                  viewMode === 'add'
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Add Devices
              </button>
              <button
                type="button"
                onClick={() => setViewMode('remove')}
                className={`px-4 py-2 text-sm font-medium rounded-r-lg ${
                  viewMode === 'remove'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Remove Devices
              </button>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 text-red-300 border border-red-700 rounded-md">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="py-2 pr-4">Select</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Model</th>
                  <th className="py-2">Manufacturer</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr 
                    key={device.id}
                    className={`border-b border-gray-700/50 hover:bg-gray-800/50 ${
                      selectedDevices.includes(device.id)
                        ? viewMode === 'add' 
                          ? 'bg-teal-900 bg-opacity-20' 
                          : 'bg-red-900 bg-opacity-20'
                        : ''
                    }`}
                  >
                    <td className="py-3 pr-4">
                      <input
                        type="checkbox"
                        checked={selectedDevices.includes(device.id)}
                        onChange={() => {
                          setSelectedDevices((prev) =>
                            prev.includes(device.id)
                              ? prev.filter((id) => id !== device.id)
                              : [...prev, device.id]
                          );
                        }}
                        className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-teal-500 focus:ring-teal-500"
                      />
                    </td>
                    <td className="py-3 pr-4 text-gray-100">{device.deviceName}</td>
                    <td className="py-3 pr-4 text-gray-300">{device.type}</td>
                    <td className="py-3 pr-4 text-gray-300">{device.modelNumber || '-'}</td>
                    <td className="py-3 text-gray-300">{device.brand || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-700">
            <div className="text-sm text-gray-400">
              {selectedDevices.length} {selectedDevices.length === 1 ? 'device' : 'devices'} selected
            </div>
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-md bg-gray-700 hover:bg-gray-600 text-white"
              >
                Cancel
              </button>
              {viewMode === 'add' ? (
                <button
                  onClick={handleAddDevices}
                  disabled={selectedDevices.length === 0}
                  className="px-4 py-2 text-sm rounded-md bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Selected Devices
                </button>
              ) : (
                <button
                  onClick={handleRemoveDevices}
                  disabled={selectedDevices.length === 0}
                  className="px-4 py-2 text-sm rounded-md bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Remove Selected Devices
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
