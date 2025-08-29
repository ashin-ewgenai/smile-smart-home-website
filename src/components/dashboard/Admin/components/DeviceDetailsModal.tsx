import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
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
  const [warrantyControls, setWarrantyControls] = useState<{count: number; unit: 'months' | 'years'}[]>([]);

  const handleSend = () => {
    // Placeholder for sending a command/alert to the device
    console.log('Send command clicked for device:', deviceId);
  };

  // Helpers for warranty quick-set controls
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

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            Device Details
          </h3>
          <button 
            onClick={onClose}
            className="text-gray-300 hover:text-white text-xl rounded-full hover:bg-white/5 px-2 py-1"
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
            {/* Device Image + Send */}
            {device?.imageUrl && (
              <div className="flex justify-center mb-4">
                <div className="flex items-start gap-4">
                  <div className="w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden border border-gray-700 ring-1 ring-gray-700 shadow-lg bg-gray-800">
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
                  <button
                    onClick={handleSend}
                    className="hidden"
                    title="Send command"
                  />
                </div>
              </div>
            )}
            
            <div className="text-sm">
              <div className="grid md:grid-cols-2 gap-6">
              {/* Section: Device Overview */}
              <div>
                <h4 className="text-gray-300 font-medium mb-3">Device Overview</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-gray-400">Device ID</div>
                  <div className="col-span-2 text-gray-100 break-all">{device?.id || '-'}</div>
            
                <div className="text-gray-400">Device Name</div>
                <div className="col-span-2 text-gray-100">{device?.deviceName || '-'}</div>

                <div className="text-gray-400">Type</div>
                <div className="col-span-2 text-gray-100">{device?.type || 'Unknown'}</div>

                <div className="text-gray-400">Status</div>
                <div className="col-span-2">
                  {(() => {
                    const raw = (device?.status || '').toLowerCase();
                    const active = raw === 'active' || raw === 'online';
                    const classes = active
                      ? 'bg-green-500/15 text-green-400 border border-green-700'
                      : 'bg-red-500/15 text-red-400 border border-red-700';
                    return (
                      <span className={`text-xs px-2.5 py-0.5 rounded-full ${classes}`}>
                        {active ? 'Active' : 'Inactive'}
                      </span>
                    );
                  })()}
                </div>

                <div className="text-gray-400">Model Number</div>
                <div className="col-span-2 text-gray-100">{device?.modelNumber || '-'}</div>

                <div className="text-gray-400">Brand</div>
                <div className="col-span-2 text-gray-100">{device?.brand || '-'}</div>
              </div>
            </div>


            {/* Section: Editable Fields */}
            <div>
              <h4 className="text-gray-300 font-medium mb-3">Editable Fields</h4>
              <div className="grid grid-cols-3 gap-4">
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
                            <div className="flex items-center gap-1">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={1}
                                  value={warrantyControls[index]?.count ?? 12}
                                  onChange={(e) => {
                                    const val = Math.max(1, parseInt(e.target.value || '1'));
                                    setWarrantyControls((prev) => {
                                      const arr = [...prev];
                                      arr[index] = { count: val, unit: arr[index]?.unit || 'months' };
                                      return arr;
                                    });
                                  }}
                                  className="w-16 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs"
                                  title="Amount"
                                />
                                <select
                                  value={warrantyControls[index]?.unit ?? 'months'}
                                  onChange={(e) => {
                                    const unit = (e.target.value as 'months' | 'years') || 'months';
                                    setWarrantyControls((prev) => {
                                      const arr = [...prev];
                                      arr[index] = { count: arr[index]?.count || 12, unit };
                                      return arr;
                                    });
                                  }}
                                  className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs"
                                  title="Unit"
                                >
                                  <option value="months">months</option>
                                  <option value="years">years</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const c = warrantyControls[index]?.count ?? 12;
                                    const u = warrantyControls[index]?.unit ?? 'months';
                                    const months = u === 'years' ? c * 12 : c;
                                    setWarrantyMonths(index, months);
                                  }}
                                  className="px-2 py-1 text-xs bg-teal-700 hover:bg-teal-600 rounded border border-teal-600 text-white"
                                  title="Apply custom warranty"
                                >
                                  Apply
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => clearWarranty(index)}
                                className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 text-gray-300"
                                title="Clear warranty date"
                              >
                                Clear
                              </button>
                            </div>
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
                              <svg className="w-3.5 h-3.5 mr-1 text-gray-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="1.5" />
                                <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
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
                          setWarrantyControls(Array.from({ length: numberOfDevices }, () => ({ count: 12, unit: 'months' })));
                        }}
                        className="mt-2 inline-flex items-center justify-center p-1.5 rounded-full text-teal-300 hover:text-teal-100 bg-teal-500/10 hover:bg-teal-500/15 ring-1 ring-inset ring-teal-500/30 hover:ring-teal-400/50 shadow-sm hover:shadow-teal-500/20 transition"
                        title="Edit serial numbers"
                        aria-label="Edit serial numbers"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                          <path d="M12 20h9"/>
                          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

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
                        className="ml-2 inline-flex items-center justify-center p-1.5 rounded-full text-teal-300 hover:text-teal-100 bg-teal-500/10 hover:bg-teal-500/15 ring-1 ring-inset ring-teal-500/30 hover:ring-teal-400/50 shadow-sm hover:shadow-teal-500/20 transition"
                        title="Edit number of devices"
                        aria-label="Edit number of devices"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                          <path d="M12 20h9"/>
                          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
              {/* Close the Editable Fields section */}
              </div>
              </div>{/* end grid two-column */}

              <div className="border-t border-gray-800" />

              {/* Section: Metadata */}
              <div>
                <h4 className="text-gray-300 font-medium mb-3">Metadata</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-gray-400">Warranty</div>
                  <div className="col-span-2 text-gray-100">{device?.warranty || 'No warranty'}</div>

                  <div className="text-gray-400">Added On</div>
                  <div className="col-span-2 text-gray-300">
                    {device?.addedAt
                      ? new Date(device.addedAt as any).toLocaleDateString()
                      : device?.createdAt
                      ? new Date(device.createdAt as any).toLocaleDateString()
                      : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
