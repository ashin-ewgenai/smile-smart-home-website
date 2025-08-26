import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

// Minimal view-model for Devices collection (aligns with `src/models/Collections.ts` Device)
type DeviceDoc = {
  id: string;
  deviceName?: string;
  name?: string;
  type?: string;
  status?: string;
  serial?: string;
  modelNumber?: string;
  imageUrl?: string;
  price?: number | null;
  stock?: number | null;
  rating?: number | null;
  discount?: number | null;
  warranty?: string | number | null;
};

// --- Component ---

const AboutDevices: React.FC = () => {
  const [devices, setDevices] = useState<DeviceDoc[]>([]);

  useEffect(() => {
    const col = collection(db, 'Devices');
    const unsub = onSnapshot(col, (snap) => {
      const list: DeviceDoc[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          deviceName: data.deviceName,
          name: data.name,
          type: data.type,
          status: data.status,
          serial: data.serial,
          modelNumber: data.modelNumber,
          imageUrl: data.imageUrl,
          price: typeof data.price === 'number' ? data.price : null,
          stock: typeof data.stock === 'number' ? data.stock : null,
          rating: typeof data.rating === 'number' ? data.rating : null,
          discount: typeof data.discount === 'number' ? data.discount : null,
          warranty: data.warranty ?? null,
        };
      });
      setDevices(list);
    });
    return () => unsub();
  }, []);

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold text-white">Devices</h1>
      {devices.length === 0 ? (
        <p className="mt-4 text-gray-300 text-sm">No devices found.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((d) => (
            <div key={d.id} className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
              {d.imageUrl ? (
                <img src={d.imageUrl} alt={d.deviceName || d.name || 'Device'} className="w-full h-40 object-cover" />
              ) : (
                <div className="w-full h-40 flex items-center justify-center text-gray-500 text-sm bg-gray-800">No image</div>
              )}
              <div className="p-4 text-gray-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{d.deviceName || d.name || 'Unnamed Device'}</h3>
                    <p className="text-xs text-gray-400">{d.type || '-'} • {d.modelNumber || '-'}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full border border-gray-700 text-gray-300">{d.status || '-'}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div><span className="text-gray-400">Serial:</span> {d.serial || '-'}</div>
                  <div><span className="text-gray-400">Price:</span> {d.price ?? '-'}</div>
                  <div><span className="text-gray-400">Stock:</span> {d.stock ?? '-'}</div>
                  <div><span className="text-gray-400">Rating:</span> {d.rating ?? '-'}</div>
                  <div><span className="text-gray-400">Discount:</span> {d.discount ?? '-'}</div>
                  <div><span className="text-gray-400">Warranty:</span> {d.warranty ?? '-'}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default AboutDevices;
