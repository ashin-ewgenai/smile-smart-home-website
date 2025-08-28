import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
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

export default function DeviceDetailsModal({ isOpen, onClose, deviceId, userId }: DeviceDetailsModalProps) {
  const [device, setDevice] = useState<DeviceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editedValue, setEditedValue] = useState('');
  const [numberOfDevices, setNumberOfDevices] = useState(1);
  const [editingSerials, setEditingSerials] = useState<SerialData[]>([]);

  useEffect(() => {
    const fetchDeviceDetails = async () => {
      if (!deviceId || !userId) return;
      
      setIsLoading(true);
      try {
        // Get the device from the main Devices collection
        const deviceRef = doc(db, 'Devices', deviceId);
        const deviceDoc = await getDoc(deviceRef);
        
        if (deviceDoc.exists()) {
          const deviceData = deviceDoc.data();
          
          // Get user-specific device data (including serial number)
          const userDeviceRef = doc(db, 'userdevices', userId, 'devices', deviceId);
          const userDeviceDoc = await getDoc(userDeviceRef);
          const userDeviceData = userDeviceDoc.exists() ? userDeviceDoc.data() : {};
          
          // Format the device data for display
          // Set number of devices from user's device data or default to 1
          const numDevices = userDeviceData.numberOfDevices || 1;
          setNumberOfDevices(numDevices);
            
          // Initialize serials array with existing data or default values
          const deviceSerials: SerialData[] = userDeviceData.serials?.map((s: any) => ({
            serialNumber: s.serialNumber || '',
            warrantyExpiry: s.warrantyExpiry || ''
          })) || Array(numDevices).fill(null).map(() => ({
            serialNumber: '',
            warrantyExpiry: ''
          }));
            
          // Use serial from user's device data if available, otherwise fallback to main device data
          setDevice({
            id: deviceDoc.id,
            deviceName: deviceData.deviceName || 'Unnamed Device',
            type: deviceData.type || 'Unknown',
            modelNumber: deviceData.modelNumber || '-',
            serial: userDeviceData.serial || deviceData.serial || '-',
            serials: deviceSerials,
            brand: deviceData.brand || '-',
            description: deviceData.description || '-',
            warranty: deviceData.warranty || 'No warranty',
            status: deviceData.status || 'Active',
            lastActiveAt: userDeviceData.lastActiveAt?.toDate?.() || null,
            imageUrl: deviceData.imageUrl,
            createdAt: deviceData.createdAt?.toDate?.().toISOString(),
            createdByEmail: deviceData.createdByEmail,
            stock: deviceData.stock,
            isOnline: userDeviceData.isOnline || false,
            addedAt: userDeviceData.addedAt
          });
            
          // Initialize editingSerials with current serials or empty strings
          setEditingSerials([...deviceSerials]);
        }
      } catch (error) {
        console.error('Error fetching device details:', error);
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
      const userDeviceRef = doc(db, 'userdevices', userId, 'devices', deviceId);
      
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
        updateData.serials = value;
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

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-5 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            Device Details
          </h3>
          <button 
            onClick={onClose}
            className="text-gray-300 hover:text-white text-xl"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-500"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Device Image */}
            {device?.imageUrl && (
              <div className="flex justify-center mb-4">
                <div className="w-32 h-32 md:w-48 md:h-48 rounded-lg overflow-hidden border border-gray-700">
                  <img 
                    src={device.imageUrl} 
                    alt={device.deviceName || 'Device Image'}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Fallback to a placeholder if image fails to load
                      const target = e.target as HTMLImageElement;
                      target.src = 'https://via.placeholder.com/200?text=No+Image';
                      target.onerror = null; // Prevent infinite loop if placeholder also fails
                    }}
                  />
                </div>
              </div>
            )}
            
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-gray-400">Device ID</div>
                <div className="col-span-2 text-gray-100 break-all">{device?.id || '-'}</div>
              
                <div className="text-gray-400">Device Name</div>
                <div className="col-span-2 text-gray-100">{device?.deviceName || '-'}</div>

                <div className="text-gray-400">Type</div>
                <div className="col-span-2 text-gray-100">{device?.type || 'Unknown'}</div>

                <div className="text-gray-400">Status</div>
                <div className="col-span-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    device?.status === 'online' 
                      ? 'bg-green-900/30 text-green-400 border border-green-700' 
                      : device?.status === 'error'
                      ? 'bg-red-900/30 text-red-400 border border-red-700'
                      : device?.status === 'maintenance'
                      ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-700'
                      : 'bg-gray-700 text-gray-100 border border-gray-600'
                  }`}>
                    {device?.status || 'offline'}
                  </span>
                </div>

                <div className="text-gray-400">Model Number</div>
                <div className="col-span-2 text-gray-100">{device?.modelNumber || '-'}</div>

                <div className="text-gray-400">Serial Numbers</div>
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
                                newSerials[index] = {
                                  ...newSerials[index],
                                  serialNumber: e.target.value
                                };
                                setEditingSerials(newSerials);
                              }}
                              className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                              placeholder={`Enter serial #${index + 1}`}
                              autoFocus={index === 0}
                            />
                          </div>
                          <div className="flex gap-2 items-center pl-8">
                            <span className="text-xs text-gray-400 w-20">Warranty:</span>
                            <input
                              type="date"
                              value={editingSerials[index]?.warrantyExpiry || ''}
                              onChange={(e) => {
                                const newSerials = [...editingSerials];
                                newSerials[index] = {
                                  ...newSerials[index],
                                  warrantyExpiry: e.target.value
                                };
                                setEditingSerials(newSerials);
                              }}
                              className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs"
                              min={new Date().toISOString().split('T')[0]}
                            />
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => handleSaveField('serials', editingSerials)}
                          className="px-3 py-1 bg-teal-600 hover:bg-teal-700 rounded text-xs"
                        >
                          Save All
                        </button>
                        <button
                          onClick={() => setEditingField(null)}
                          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {device?.serials?.map((serial, index) => (
                        <div key={index} className="space-y-1">
                          <div className="flex items-center">
                            <span className="text-gray-400 w-6">{index + 1}.</span>
                            <span className="text-gray-100">{serial?.serialNumber || 'Not set'}</span>
                          </div>
                          {serial?.warrantyExpiry && (
                            <div className="flex items-center text-xs text-gray-400 pl-6">
                              <span className="mr-1">Warranty:</span>
                              <span className="text-gray-300">
                                {new Date(serial.warrantyExpiry).toLocaleDateString()}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          setEditingField('serials');
                          setEditingSerials(device?.serials?.map(s => ({
                          serialNumber: s.serialNumber || '',
                          warrantyExpiry: s.warrantyExpiry || ''
                        })) || []);
                        }}
                        className="mt-2 text-xs text-teal-400 hover:text-teal-300"
                        title="Edit serial numbers"
                      >
                        Edit Serial Numbers
                      </button>
                    </div>
                  )}
                </div>

                <div className="text-gray-400">Brand</div>
                <div className="col-span-2 text-gray-100">{device?.brand || '-'}</div>

                <div className="text-gray-400">Number of Devices</div>
                <div className="col-span-2 flex items-center">
                  {editingField === 'numberOfDevices' ? (
                    <div className="flex gap-2 w-full">
                      <input
                        type="number"
                        min="1"
                        value={editedValue}
                        onChange={(e) => setEditedValue(e.target.value)}
                        className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveField('numberOfDevices', editedValue)}
                        className="px-2 py-1 bg-teal-600 hover:bg-teal-700 rounded text-xs"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingField(null)}
                        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-gray-100">{numberOfDevices}</span>
                      <button
                        onClick={() => {
                          setEditingField('numberOfDevices');
                          setEditedValue(numberOfDevices.toString());
                        }}
                        className="ml-2 text-xs text-teal-400 hover:text-teal-300"
                        title="Edit number of devices"
                      >
                        Edit
                      </button>
                    </>
                  )}
                </div>

                <div className="text-gray-400">Warranty</div>
                <div className="col-span-2 text-gray-100">{device?.warranty || 'No warranty'}</div>

                {device?.createdAt && (
                  <>
                    <div className="text-gray-400">Added On</div>
                    <div className="col-span-2 text-gray-300">
                      {device?.addedAt 
                        ? new Date(device.addedAt).toLocaleDateString() 
                        : 'N/A'}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
