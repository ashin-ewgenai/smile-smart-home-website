import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { userDevicesCollection, userDevicePayloadFromDevice } from '../../../models/Collections';

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
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [userDeviceBySourceId, setUserDeviceBySourceId] = useState<Record<string, { id: string; status?: string; updatedAtMs: number }>>({});

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

  // Track auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  // Subscribe to user's devices when signed in
  useEffect(() => {
    if (!uid) return;
    const col = userDevicesCollection(db, uid);
    const unsub = onSnapshot(col, (snap) => {
      const map: Record<string, { id: string; status?: string; updatedAtMs: number }> = {};
      snap.forEach((doc) => {
        const d = doc.data() as any;
        const srcId = d.sourceDeviceId as string | undefined;
        if (!srcId) return;
        const ts = d.UpdatedAt?.toMillis ? d.UpdatedAt.toMillis() : (typeof d.UpdatedAt === 'number' ? d.UpdatedAt : 0);
        map[srcId] = { id: doc.id, status: d.status, updatedAtMs: ts || 0 };
      });
      setUserDeviceBySourceId(map);
    });
    return () => unsub();
  }, [uid]);

  const sorted = useMemo(() => {
    const withFlag = devices.map((d) => ({
      ...d,
      __added: !!userDeviceBySourceId[d.id],
      __addedAt: userDeviceBySourceId[d.id]?.updatedAtMs ?? 0,
    }));
    // Sort: added first by UpdatedAt desc, then others by name
    return withFlag.sort((a, b) => {
      if (a.__added && b.__added) return (b.__addedAt - a.__addedAt);
      if (a.__added) return -1;
      if (b.__added) return 1;
      const an = (a.deviceName || a.name || '').toLowerCase();
      const bn = (b.deviceName || b.name || '').toLowerCase();
      return an.localeCompare(bn);
    });
  }, [devices, userDeviceBySourceId]);

  const handleAdd = async (d: DeviceDoc) => {
    try {
      if (!uid) {
        alert('Please sign in to add devices.');
        return;
      }
      if (userDeviceBySourceId[d.id]) return; // already added
      // Build payload using helper to ensure status 'pending', UpdatedAt, DeviceCount
      const payload = userDevicePayloadFromDevice({ ...d, id: d.id } as any);
      await addDoc(userDevicesCollection(db, uid), payload);
    } catch (e) {
      console.error(e);
      alert('Failed to add device.');
    }
  };

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold text-white">My Devices</h1>
      {sorted.length === 0 ? (
        <p className="mt-4 text-gray-300 text-sm">No devices found.</p>
      ) : (
        <>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((d) => (
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
                  <span className="text-xs px-2 py-0.5 rounded-full border border-gray-700 text-gray-300">
                    {userDeviceBySourceId[d.id]?.status || d.status || '-'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div><span className="text-gray-400">Serial:</span> {d.serial || '-'}</div>
                  <div><span className="text-gray-400">Price:</span> {d.price ?? '-'}</div>
                  <div><span className="text-gray-400">Stock:</span> {d.stock ?? '-'}</div>
                  <div><span className="text-gray-400">Rating:</span> {d.rating ?? '-'}</div>
                  <div><span className="text-gray-400">Discount:</span> {d.discount ?? '-'}</div>
                  <div><span className="text-gray-400">Warranty:</span> {d.warranty ?? '-'}</div>
                </div>
                <div className="mt-4 flex justify-end">
                  {userDeviceBySourceId[d.id] ? (
                    <button
                      className="text-xs px-3 py-1 rounded bg-gray-800 text-gray-300 border border-gray-700 cursor-default"
                      disabled
                    >
                      Added
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAdd(d)}
                      className="text-xs px-3 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white"
                    >
                      Add
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Bottom CTA: Add new devices */}
        <div className="mt-8">
          <a
            href="/dashboard/user/about-device"
            title="About Device"
            className="inline-flex items-center gap-2 text-2xl font-semibold text-white"
          >
            <span className="truncate">Add New Devices</span>
          </a>
        </div>
        </>
      )}
    </section>
  );
}

export default AboutDevices;
