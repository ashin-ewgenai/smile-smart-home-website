import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../../lib/firebase';

interface DeviceDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId: string;
  userId: string;
}

interface SerialData {
  serialNumber: string;
  warrantyExpiry: string; // Make warrantyExpiry required and non-nullable
}

interface DeviceData {
  id: string;
  deviceName: string;
  type: string;
  modelNumber: string;
  serial: string;
  serials?: SerialData[]; // Array of objects containing serial numbers and their warranty info
  brand: string;
  description: string;
  warranty: string; // Default warranty period
  status: string;
  lastActiveAt: string | Date | null;
  imageUrl?: string;
  createdAt?: string;
  createdByEmail?: string;
  createdByUid?: string;
  stock?: number;
  isOnline?: boolean;
  addedAt?: string | Date;
  updatedAt?: string | Date;
}

const DeviceDetailsModal: React.FC<DeviceDetailsModalProps> = ({ isOpen, onClose, deviceId, userId }) => {
  const [device, setDevice] = useState<DeviceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editedValue, setEditedValue] = useState('');
  const [numberOfDevices, setNumberOfDevices] = useState(1);
  const [editingSerials, setEditingSerials] = useState<SerialData[]>([]);
  const [warrantyControls, setWarrantyControls] = useState<{count: number; unit: 'months' | 'years'}[]>([]);

  // Helpers for warranty quick-set controls
  const parseWarrantyToMonths = (w: unknown): number | null => {
    if (w == null) return null;
    if (typeof w === 'number' && isFinite(w)) return w;
    const s = String(w).toLowerCase().trim();
    const m = s.match(/(\d+\.?\d*)\s*(month|months|yr|yrs|year|years|m|y)/i);
    if (m) {
      const n = parseFloat(m[1]);
      const unit = m[2];
      if (!isFinite(n)) return null;
      if (unit.startsWith('y')) return Math.round(n * 12);
      return Math.round(n);
    }
    const onlyNum = s.match(/^(\d+)$/);
    if (onlyNum) return parseInt(onlyNum[1], 10);
    return null;
  };
  const toYMD = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  const addMonths = (date: Date, months: number) => {
    const d = new Date(date.getTime());
    const day = d.getDate();
    d.setMonth(d.getMonth() + months);
    // handle month overflow (e.g., Jan 31 +1 month -> Feb last day)
    if (d.getDate() < day) d.setDate(0);
    return d;
  };
  const setWarrantyMonths = (index: number, months: number) => {
    setEditingSerials((prev) => {
      const base = new Date();
      const expiry = addMonths(base, months);
      const dateStr = toYMD(expiry);
      const arr = [...prev];
      const current = arr[index] || { serialNumber: '', warrantyExpiry: '' };
      arr[index] = { ...current, warrantyExpiry: dateStr };
      return arr;
    });
  };
  const clearWarranty = (index: number) => {
    setEditingSerials((prev) => {
      const arr = [...prev];
      const current = arr[index] || { serialNumber: '', warrantyExpiry: '' };
      arr[index] = { ...current, warrantyExpiry: '' };
      return arr;
    });
  };

  useEffect(() => {
    const fetchDeviceDetails = async () => {
      if (!deviceId || !userId) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        // Get the device from the main Devices collection
        const deviceRef = doc(db, 'Devices', deviceId);
        const deviceDoc = await getDoc(deviceRef);
        
        if (!deviceDoc.exists()) {
          throw new Error('Device not found');
        }
        
        // Get user-specific device data from flat collection
        const userDevicesQuery = query(
          collection(db, 'User_Devices'),
          where('uid', '==', userId),
          where('sourceDeviceId', '==', deviceId)
        );
        const userDevicesSnapshot = await getDocs(userDevicesQuery);
        const userDeviceData = userDevicesSnapshot.empty ? {} : userDevicesSnapshot.docs[0].data();
        
        // Format the device data for display
        const baseDeviceData = {
          id: deviceDoc.id,
          ...deviceDoc.data()
        } as DeviceData;
        
        // Merge user-specific data with base device data
        const mergedDeviceData: DeviceData = {
          ...baseDeviceData,
          ...userDeviceData,
          // Ensure serials is always an array
          serials: userDeviceData.serials || []
        };
        
        // Set number of devices from user's device data or default to 1
        const numDevices = userDeviceData.numberOfDevices || 1;
        
        // Initialize serials array with existing data or default values
        const deviceSerials: SerialData[] = userDeviceData.serials?.length > 0 
          ? [...userDeviceData.serials]
          : Array(numDevices).fill(null).map(() => ({
              serialNumber: '',
              warrantyExpiry: ''
            }));
        
        // Update state with the fetched data
        setDevice(mergedDeviceData);
        setNumberOfDevices(numDevices);
        setEditingSerials(deviceSerials);
        
        // Initialize warranty controls: default to device's warranty months if available
        const defaultMonths = parseWarrantyToMonths(mergedDeviceData.warranty) ?? 12;
        const initialWarrantyControls = deviceSerials.map(() => ({
          count: defaultMonths,
          unit: 'months' as const
        }));
        setWarrantyControls(initialWarrantyControls);
        
      } catch (err) {
        console.error('Error fetching device details:', err);
        setError(err instanceof Error ? err.message : 'Failed to load device details');
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen) {
      fetchDeviceDetails();
    }
  }, [deviceId, isOpen, userId]);


  const handleEditField = (field: string, value: string) => {
    setEditingField(field);
    setEditedValue(value);
  };
  
  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^[1-9]\d*$/.test(value)) {
      setEditedValue(value);
      
      // Update the number of devices and adjust serials array if needed
      const newCount = value === '' ? 1 : parseInt(value);
      if (device) {
        const currentSerials = [...(device.serials || [])];
        
        // Add empty objects if increasing count, or remove if decreasing
        while (currentSerials.length < newCount) {
          currentSerials.push({ serialNumber: '', warrantyExpiry: '' });
        }
        while (currentSerials.length > newCount) {
          currentSerials.pop();
        }
        
        setDevice({ ...device, serials: currentSerials });
        setEditingSerials([...currentSerials]);
      }
    }
  };

  const handleSaveField = async (field: string, value: any) => {
    if (!deviceId || !userId) return;
    
    try {
      // Get reference to user device in flat collection
      const userDevicesQuery = query(
        collection(db, 'User_Devices'),
        where('uid', '==', userId),
        where('sourceDeviceId', '==', deviceId)
      );
      const userDevicesSnapshot = await getDocs(userDevicesQuery);
      
      if (userDevicesSnapshot.empty) {
        // Create new user device document if it doesn't exist
        const newUserDeviceRef = doc(collection(db, 'User_Devices'));
        const updateData: any = {
          uid: userId,
          sourceDeviceId: deviceId,
          addedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        if (field === 'serial') {
          updateData.serial = value;
        } else if (field === 'numberOfDevices') {
          const numValue = Math.max(1, parseInt(value) || 1);
          updateData.numberOfDevices = numValue;
          
          // Initialize serials array
          const newSerials = Array(numValue).fill(null).map(() => ({
            serialNumber: '',
            warrantyExpiry: ''
          }));
          updateData.serials = newSerials;
        } else if (field === 'serials') {
          const num = Array.isArray(value) ? value.length : 1;
          updateData.serials = value;
          updateData.numberOfDevices = num;
        }
        
        await setDoc(newUserDeviceRef, updateData);
        
        // Update local state
        if (field === 'serial') {
          setDevice(prev => ({ ...prev!, serial: value }));
        } else if (field === 'numberOfDevices') {
          setNumberOfDevices(updateData.numberOfDevices);
          setDevice(prev => prev ? { ...prev, serials: updateData.serials } : null);
          setEditingSerials([...updateData.serials]);
        } else if (field === 'serials') {
          setNumberOfDevices(updateData.numberOfDevices);
          setDevice(prev => prev ? { ...prev, serials: [...value] } : null);
        }
        
        setEditingField(null);
        return;
      }
      
      const userDeviceRef = userDevicesSnapshot.docs[0].ref;
      
      // Prepare update data based on field
      const updateData: any = {
        updatedAt: new Date().toISOString()
      };
      
      if (field === 'serial') {
        updateData.serial = value;
      } else if (field === 'numberOfDevices') {
        const numValue = Math.max(1, parseInt(value) || 1);
        updateData.numberOfDevices = numValue;
        
        // Update serials array when number of devices changes
        const currentSerials = device?.serials || [];
        const newSerials = [...currentSerials];
        
        // Add empty objects if increasing count, or remove if decreasing
        while (newSerials.length < numValue) {
          newSerials.push({ serialNumber: '', warrantyExpiry: '' });
        }
        while (newSerials.length > numValue) {
          newSerials.pop();
        }
        
        updateData.serials = newSerials;
        
        setNumberOfDevices(numValue);
        setDevice(prev => prev ? { ...prev, serials: newSerials } : null);
        setEditingSerials([...newSerials]);
      } else if (field === 'serials') {
        const num = Array.isArray(value) ? value.length : 1;
        updateData.serials = value;
        updateData.numberOfDevices = num;
        setNumberOfDevices(num);
        setDevice(prev => prev ? { ...prev, serials: [...value] } : null);
      }
      
      // Update the document
      await setDoc(userDeviceRef, updateData, { merge: true });
      
      // Update local state for serial field
      if (field === 'serial') {
        setDevice(prev => ({
          ...prev!,
          serial: value
        }));
      }
      
      setEditingField(null);
    } catch (error) {
      console.error(`Error updating ${field}:`, error);
    }
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditedValue('');
  };

  if (!isOpen) return null;

  // Add smooth scrolling behavior with proper TypeScript types
  useEffect(() => {
    const modalContent = document.querySelector('.modal-content') as HTMLElement | null;
    
    if (!modalContent) return;
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      modalContent.scrollTop += e.deltaY;
    };
    
    modalContent.addEventListener('wheel', handleWheel as EventListener, { passive: false });
    
    return () => {
      modalContent.removeEventListener('wheel', handleWheel as EventListener);
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl my-8 flex flex-col max-h-[90vh]">
        {/* Fixed Header */}
        <div className="flex-none bg-white dark:bg-gray-900 px-6 pt-6 pb-2 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Device Details
            </h3>
            <button 
              onClick={onClose}
              className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
              aria-label="Close"
            >
              Close
            </button>
          </div>
        </div>
        
        {/* Scrollable Content */}
        <div className="modal-content p-6 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column - Device Image */}
                <div className="flex justify-center items-start">
                  {device?.imageUrl ? (
                    <img 
                      src={device.imageUrl} 
                      alt={device.deviceName || 'Device'} 
                      className="h-56 w-56 object-cover rounded-full border-2 border-gray-200 dark:border-gray-700"
                    />
                  ) : (
                    <div className="h-56 w-56 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-full border-2 border-gray-200 dark:border-gray-700">
                      <span className="text-gray-500 dark:text-gray-400">No Image</span>
                    </div>
                  )}
                </div>
                
                {/* Right Column - Device Details */}
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-1 text-gray-600 dark:text-gray-400 whitespace-nowrap">Device Name</div>
                    <div className="sm:col-span-2">
                      <div className="text-gray-900 dark:text-gray-100 break-words">
                        {device?.deviceName || 'N/A'}
                      </div>
                    </div>

                    <div className="sm:col-span-1 text-gray-600 dark:text-gray-400">Type</div>
                    <div className="sm:col-span-2 text-gray-900 dark:text-gray-100">{device?.type || 'N/A'}</div>

                    <div className="sm:col-span-1 text-gray-600 dark:text-gray-400">Brand</div>
                    <div className="sm:col-span-2 text-gray-900 dark:text-gray-100">{device?.brand || 'N/A'}</div>

                    <div className="sm:col-span-1 text-gray-600 dark:text-gray-400">Model</div>
                    <div className="sm:col-span-2 text-gray-900 dark:text-gray-100">{device?.modelNumber || 'N/A'}</div>
                    
                    <div className="sm:col-span-1 text-gray-600 dark:text-gray-400">Warranty</div>
                    <div className="sm:col-span-2 text-gray-900 dark:text-gray-100">
                      {device?.warranty || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Editable Fields */}
              <div className="mt-6">
                <h4 className="text-gray-700 dark:text-gray-300 font-medium mb-4">Editable Fields</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-gray-600 dark:text-gray-400">Number of Devices</div>
                  <div className="col-span-2 flex items-center">
                    {editingField === 'numberOfDevices' ? (
                      <div className="space-y-3">
                        <input
                          type="number"
                          value={numberOfDevices}
                          onChange={(e) => setNumberOfDevices(Math.max(1, parseInt(e.target.value) || 1))}
                          min="1"
                          className="block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveField('numberOfDevices', numberOfDevices)}
                            className="px-3 py-1 bg-teal-600 hover:bg-teal-700 rounded text-xs text-white"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded text-xs dark:bg-gray-600 dark:hover:bg-gray-700 dark:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900 dark:text-gray-100">{numberOfDevices}</span>
                        <button
                          onClick={() => handleEditField('numberOfDevices', numberOfDevices.toString())}
                          className="text-gray-600 hover:text-teal-600 dark:text-gray-400 dark:hover:text-teal-400"
                          title="Edit"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="text-gray-600 dark:text-gray-400">Serial Numbers</div>
                  <div className="col-span-2 space-y-3">
                    {editingField === 'serials' ? (
                      <div className="space-y-3">
                        {Array.from({ length: numberOfDevices }).map((_, index) => (
                          <div key={index} className="space-y-1">
                            <div className="flex gap-2 items-center">
                              <span className="text-gray-400 w-6">{index + 1}.</span>
                              <input
                                type="text"
                                value={editingSerials[index]?.serialNumber || ''}
                                onChange={(e) => {
                                  const newSerials = [...editingSerials];
                                  if (!newSerials[index]) {
                                    newSerials[index] = { serialNumber: '', warrantyExpiry: '' };
                                  }
                                  newSerials[index].serialNumber = e.target.value;
                                  setEditingSerials(newSerials);
                                }}
                                placeholder="Enter serial number"
                                className="block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                              />
                            </div>
                            <div className="flex gap-2 items-center pl-8">
                              <span className="text-xs text-gray-400 w-20">Warranty:</span>
                              <input
                                type="date"
                                value={editingSerials[index]?.warrantyExpiry || ''}
                                onChange={(e) => {
                                  const newSerials = [...editingSerials];
                                  if (!newSerials[index]) {
                                    newSerials[index] = { serialNumber: '', warrantyExpiry: '' };
                                  }
                                  newSerials[index].warrantyExpiry = e.target.value;
                                  setEditingSerials(newSerials);
                                }}
                                className="block rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                              />
                              <div className="flex flex-col gap-2">
                                <div className="flex gap-1 items-center">
                                  <input
                                    type="number"
                                    value={warrantyControls[index]?.count || 12}
                                    onChange={(e) => {
                                      const newControls = [...warrantyControls];
                                      if (!newControls[index]) {
                                        newControls[index] = { count: 12, unit: 'months' };
                                      }
                                      newControls[index].count = parseInt(e.target.value) || 0;
                                      setWarrantyControls(newControls);
                                    }}
                                    min="1"
                                    className="w-16 rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                                  />
                                  <select
                                    value={warrantyControls[index]?.unit || 'months'}
                                    onChange={(e) => {
                                      const newControls = [...warrantyControls];
                                      if (!newControls[index]) {
                                        newControls[index] = { count: 12, unit: 'months' };
                                      }
                                      newControls[index].unit = e.target.value as 'months' | 'years';
                                      setWarrantyControls(newControls);
                                    }}
                                    className="rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                                  >
                                    <option value="months">Months</option>
                                    <option value="years">Years</option>
                                  </select>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setWarrantyMonths(index, (warrantyControls[index]?.count || 12) * (warrantyControls[index]?.unit === 'years' ? 12 : 1))}
                                    className="px-2 py-0.5 bg-teal-600 hover:bg-teal-700 rounded text-xs text-white"
                                  >
                                    Set
                                  </button>
                                  <button
                                    onClick={() => clearWarranty(index)}
                                    className="px-2 py-0.5 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded text-xs dark:bg-gray-600 dark:hover:bg-gray-700 dark:text-white"
                                  >
                                    Clear
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="mt-4 flex gap-3">
                          <button
                            onClick={() => handleSaveField('serials', editingSerials)}
                            className="p-1.5 rounded-full text-teal-300 hover:text-teal-100 bg-teal-500/10 hover:bg-teal-500/15 ring-1 ring-inset ring-teal-500/30 hover:ring-teal-400/50 shadow-sm hover:shadow-teal-500/20 transition flex items-center gap-1.5 px-3"
                            title="Save serial numbers"
                            aria-label="Save serial numbers"
                          >
                            <span className="text-sm">Save</span>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="w-3.5 h-3.5"
                            >
                              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                              <polyline points="17 21 17 13 7 13 7 21"></polyline>
                              <polyline points="7 3 7 8 15 8"></polyline>
                            </svg>
                          </button>
                          <button
                            onClick={() => setEditingField(null)}
                            className="p-1.5 rounded-full text-gray-700 hover:text-gray-900 bg-gray-500/10 hover:bg-gray-500/15 ring-1 ring-inset ring-gray-300 hover:ring-gray-400 shadow-sm transition flex items-center gap-1.5 px-3 dark:text-gray-300 dark:hover:text-gray-100 dark:ring-gray-500/30 dark:hover:ring-gray-400/50"
                            title="Cancel"
                            aria-label="Cancel editing"
                          >
                            <span className="text-sm">Cancel</span>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="w-3.5 h-3.5"
                            >
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {device?.serials?.map((serial, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <span className="text-gray-400">{index + 1}.</span>
                            <span className="text-gray-900 dark:text-gray-100">{serial.serialNumber}</span>
                            {serial.warrantyExpiry && (
                              <span className="text-xs text-gray-400">
                                (Warranty: {new Date(serial.warrantyExpiry).toLocaleDateString()})
                              </span>
                            )}
                          </div>
                        ))}
                        <button
                          onClick={() => setEditingField('serials')}
                          className="mt-2 text-sm text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 flex items-center gap-1"
                        >
                          <span>Edit Serial Numbers</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Added On Section */}
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="text-gray-600 dark:text-gray-400">Added On</div>
                  <div className="col-span-2 text-gray-900 dark:text-gray-300">
                    {(device?.addedAt || device?.createdAt)
                      ? new Date((device.addedAt || device.createdAt) as string).toLocaleDateString()
                      : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeviceDetailsModal;
