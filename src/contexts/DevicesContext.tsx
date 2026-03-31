import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, onSnapshot, query, where, Timestamp, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import type { ContactRequest, PlannerLead, SupportTicket, QuoteItem } from '../models/Collections';
import { quotesCollection } from '../models/Collections';
import type { DeviceRecommendation, RecommendationRequest } from '../models';

// Types aligned with AboutDevices.tsx to minimize refactor
interface SerialItem {
  serialNumber?: string;
  serial?: string;
  warrantyExpiry?: string | Date | any;
}


export type DeviceDoc = {
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
  warranty?: any | null;
  warrantySource?: 'user' | 'device';
  brand?: string;
  description?: string;
  documentationUrl?: string;
  serials?: SerialItem[];
};

interface DevicesContextValue {
  devices: DeviceDoc[];
  planLeads: PlannerLead[];
  contactSubmissions: ContactRequest[];
  reports: SupportTicket[];
  filteredPlanLeads: PlannerLead[];
  filteredContactSubmissions: ContactRequest[];
  filteredReports: SupportTicket[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterCriteria: { dateRange: string; itemType: string };
  setFilterCriteria: (criteria: { dateRange: string; itemType: string }) => void;
  loading: boolean;
  adminLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  uid: string | null;
  isFloorplanItem: (item: any) => boolean;
  recommendations: DeviceRecommendation[];
  recommendationLoading: boolean;
  fetchRecommendations: (params: RecommendationRequest) => Promise<void>;
  saveRecommendationToQuote: (recommendation: DeviceRecommendation) => Promise<void>;
  updateItemStatus: (collectionName: string, id: string, newStatus: string) => Promise<void>;
}

const DevicesContext = createContext<DevicesContextValue | undefined>(undefined);

function getUserWarranty(userData: any, serialHint?: string): any {
  try {
    if (Array.isArray(userData?.serials)) {
      const items = userData.serials as Array<any>;
      if (serialHint) {
        const found = items.find(it => (it?.serialNumber || it?.serial) === serialHint);
        if (found && (found.warrantyExpiry || found.warrantyexpiry)) {
          return found.warrantyExpiry ?? found.warrantyexpiry;
        }
      }
      let best: any = null;
      let bestTime = -Infinity;
      for (const it of items) {
        const val = it?.warrantyExpiry ?? it?.warrantyexpiry ?? null;
        if (!val) continue;
        let t = NaN;
        if (val && typeof val === 'object' && typeof val.toDate === 'function') {
          t = (val as Timestamp).toDate().getTime();
        } else if (typeof val === 'number') {
          const ms = val < 1e12 ? val * 1000 : val;
          t = new Date(ms).getTime();
        } else if (typeof val === 'string') {
          t = Date.parse(val);
        }
        if (!Number.isNaN(t) && t > bestTime) {
          bestTime = t;
          best = val;
        }
      }
      if (best !== null) return best;
    }
    return (
      userData?.warrantyExpiry ??
      userData?.warrantyexpiry ??
      userData?.warrantyDate ??
      userData?.warrantyEnd ??
      userData?.warranty_end ??
      userData?.warranty ??
      null
    );
  } catch {
    return null;
  }
}

export const DevicesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [devices, setDevices] = useState<DeviceDoc[]>([]);
  const [planLeads, setPlanLeads] = useState<PlannerLead[]>([]);
  const [contactSubmissions, setContactSubmissions] = useState<ContactRequest[]>([]);
  const [reports, setReports] = useState<SupportTicket[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCriteria, setFilterCriteria] = useState({ dateRange: 'all', itemType: 'all' });
  const [loading, setLoading] = useState<boolean>(true);
  const [adminLoading, setAdminLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<DeviceRecommendation[]>([]);
  const [recommendationLoading, setRecommendationLoading] = useState<boolean>(false);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  useEffect(() => {
    let unsubs: (() => void)[] = [];
    if (uid) {
      setAdminLoading(true);
      try {
        const u1 = onSnapshot(collection(db, 'Planner_Leads'), snap => {
          setPlanLeads(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as PlannerLead)));
          setAdminLoading(false);
        }, (err) => { 
          console.error('Planner_Leads snapshot failed:', err);
          setAdminLoading(false);
        }); 
        const u2 = onSnapshot(collection(db, 'contactRequests'), snap => {
          setContactSubmissions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as ContactRequest)));
          setAdminLoading(false);
        }, (err) => { 
          console.error('contactRequests snapshot failed:', err);
          setAdminLoading(false);
        });
        const u3 = onSnapshot(collection(db, 'Support_Tickets'), snap => {
          setReports(snap.docs.map(doc => {
            const data = doc.data();
            return { id: doc.id, ...data, userUid: data.uid } as unknown as SupportTicket;
          }));
          setAdminLoading(false);
        }, (err) => { 
          console.error('Support_Tickets snapshot failed:', err);
          setAdminLoading(false);
        });
        unsubs = [u1, u2, u3];
      } catch (e) {
        console.error('Failed to initialize admin listeners:', e);
        setAdminLoading(false);
      }
    } else {
      setPlanLeads([]);
      setContactSubmissions([]);
      setReports([]);
      setAdminLoading(false);
    }
    return () => unsubs.forEach(u => u());
  }, [uid]);

  const isFloorplanItem = useCallback((item: any): boolean => {
    if (!item) return false;
    return item.type === 'floorplan' || 
           item.source === 'interactive_floorplan' || 
           item.relatedToFloorplan === true ||
           (item.message || '').startsWith('[Floorplan Request');
  }, []);

  const passesDate = (timestamp: any, range: string) => {
    if (range === 'all') return true;
    if (!timestamp) return false;
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
    const now = new Date();
    if (range === 'today') return date.toDateString() === now.toDateString();
    if (range === 'week') return (now.getTime() - date.getTime()) < 7 * 24 * 60 * 60 * 1000;
    if (range === 'month') return (now.getTime() - date.getTime()) < 30 * 24 * 60 * 60 * 1000;
    return true;
  };

  const filteredPlanLeads = useMemo(() => {
    let list = planLeads;
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      list = list.filter(p => (
        (p.email || '').toLowerCase().includes(lower) || 
        ((p.formData?.email as string) || '').toLowerCase().includes(lower) ||
        (p.name || '').toLowerCase().includes(lower)
      ));
    }
    if (filterCriteria.dateRange !== 'all') {
      list = list.filter(p => passesDate(p.updatedAt || p.createdAt, filterCriteria.dateRange));
    }
    if (filterCriteria.itemType === 'floorplan') {
      list = list.filter(p => isFloorplanItem(p));
    } else if (filterCriteria.itemType === 'standard') {
      list = list.filter(p => !isFloorplanItem(p));
    }
    return list;
  }, [planLeads, searchQuery, filterCriteria, isFloorplanItem]);

  const filteredContactSubmissions = useMemo(() => {
    let list = contactSubmissions;
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      list = list.filter(c => (
        (c.email || '').toLowerCase().includes(lower) || 
        (c.fullName || '').toLowerCase().includes(lower) || 
        (c.message || '').toLowerCase().includes(lower)
      ));
    }
    if (filterCriteria.dateRange !== 'all') {
      list = list.filter(c => passesDate(c.createdAt, filterCriteria.dateRange));
    }
    if (filterCriteria.itemType === 'floorplan') {
      list = list.filter(c => isFloorplanItem(c));
    } else if (filterCriteria.itemType === 'standard') {
      list = list.filter(c => !isFloorplanItem(c));
    }
    return list;
  }, [contactSubmissions, searchQuery, filterCriteria, isFloorplanItem]);

  const filteredReports = useMemo(() => {
    let list = reports;
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      list = list.filter(r => (
        (r.subject || '').toLowerCase().includes(lower) || 
        (r.title || '').toLowerCase().includes(lower) || 
        (r.description || '').toLowerCase().includes(lower)
      ));
    }
    if (filterCriteria.dateRange !== 'all') {
      list = list.filter(r => passesDate(r.createdAt, filterCriteria.dateRange));
    }
    if (filterCriteria.itemType === 'floorplan') {
      list = list.filter(r => isFloorplanItem(r));
    } else if (filterCriteria.itemType === 'standard') {
      list = list.filter(r => !isFloorplanItem(r));
    }
    return list;
  }, [reports, searchQuery, filterCriteria, isFloorplanItem]);

  const fetchDevices = useCallback(async () => {
    if (!uid) {
      setDevices([]);
      setLoading(false);
      setError(null);
      return;
    }
    try {
      setLoading(true);
      const userDevicesRef = collection(db, 'User_Devices');
      const userDevicesQuery = query(userDevicesRef, where('uid', '==', uid));
      const userDevicesSnap = await getDocs(userDevicesQuery);

      if (userDevicesSnap.empty) {
        setDevices([]);
        setError(null);
        return;
      }

      const sourceDeviceIds = userDevicesSnap.docs.map(doc => (doc.data() as any).sourceDeviceId).filter(Boolean);

      // If we don't have sourceDeviceIds, try to build minimal devices from user docs
      if (sourceDeviceIds.length === 0) {
        const minimal = userDevicesSnap.docs.map((d) => {
          const data: any = d.data();
          const resolveSerial = () => {
            const possible = [data?.serial, data?.serialNumber].filter(Boolean);
            if (possible.length && typeof possible[0] === 'string') return possible[0] as string;
            if (Array.isArray(data?.serials) && data.serials.length > 0) {
              const first = data.serials[0];
              if (typeof first === 'string') return first;
              if (first && typeof first === 'object') {
                return (first.serialNumber || first.serial || first.code || first.id) ?? undefined;
              }
            }
            return undefined;
          };
          const resolveSerials = (): SerialItem[] => {
            if (Array.isArray(data?.serials)) {
              return data.serials.map((s: any) => ({
                serialNumber: s.serialNumber || s.serial || s.code || s.id || '—',
                warrantyExpiry: s.warrantyExpiry || s.expiryDate || s.warrantyEnd || null,
              }));
            }
            const serial = resolveSerial();
            return serial ? [{ serialNumber: serial, warrantyExpiry: data?.warrantyExpiry || data?.warrantyEnd || null }] : [];
          };
          const chosenWarranty = getUserWarranty(data);
          return {
            id: data?.deviceId || data?.sourceDeviceId || d.id,
            deviceName: data?.deviceName || data?.name || 'My Device',
            name: data?.name,
            type: data?.type,
            status: data?.status || 'Active',
            serial: resolveSerial() || 'N/A',
            serials: resolveSerials(),
            modelNumber: data?.modelNumber || data?.model || data?.modelNo || data?.model_number || data?.deviceModel || undefined,
            imageUrl: data?.imageUrl,
            price: typeof data?.price === 'number' ? data.price : null,
            stock: typeof data?.stock === 'number' ? data.stock : null,
            rating: null,
            discount: null,
            warranty: chosenWarranty,
            warrantySource: chosenWarranty != null ? 'user' : undefined,
            brand: data?.brand,
            description: data?.description,
            documentationUrl: data?.documentationUrl,
          } as DeviceDoc;
        });
        setDevices(minimal);
        setError(null);
        return;
      }

      // Try joining with Devices collection; on permission error, fallback to minimal entries
      let results: DeviceDoc[] | null = null;
      try {
        // Firestore's 'in' operator supports up to 10 elements; for simplicity assume <=10. For >10, we'd batch.
        const devicesRef = collection(db, 'Devices');
        const batches: string[][] = [];
        for (let i = 0; i < sourceDeviceIds.length; i += 10) {
          batches.push(sourceDeviceIds.slice(i, i + 10));
        }
        const deviceDocs: any[] = [];
        for (const ids of batches) {
          const qy = query(devicesRef, where('__name__', 'in', ids));
          const snap = await getDocs(qy);
          deviceDocs.push(...snap.docs);
        }

        const userDevicesMap = new Map(
          userDevicesSnap.docs.map(d => [ (d.data() as any).sourceDeviceId, d.data() ])
        );

        results = deviceDocs.map((d) => {
          const deviceData = d.data() as any;
          const userDeviceData: any = userDevicesMap.get(d.id) || {};

          const serialHint = (userDeviceData?.serialNumber) || (userDeviceData?.serial) || (Array.isArray(userDeviceData?.serials) ? userDeviceData.serials[0] : undefined) || deviceData?.serial;
          const userWarranty = getUserWarranty(userDeviceData, serialHint);
          const deviceWarranty = deviceData.warranty ?? null;
          const chosenWarranty = userWarranty ?? deviceWarranty ?? null;
          const chosenSource: 'user' | 'device' | undefined = (userWarranty != null) ? 'user' : ((deviceWarranty != null) ? 'device' : undefined);

          const resolveSerial = () => {
            const possible = [
              userDeviceData?.serial,
              userDeviceData?.serialNumber,
              userDeviceData?.Serial,
              userDeviceData?.SerialNumber,
              userDeviceData?.serial_no,
              userDeviceData?.serialNo,
              userDeviceData?.SerialNo,
            ].filter(Boolean);
            if (possible.length && typeof possible[0] === 'string') return possible[0] as string;
            if (Array.isArray(userDeviceData?.serials) && userDeviceData.serials.length > 0) {
              const first = userDeviceData.serials[0];
              if (typeof first === 'string') return first;
              if (first && typeof first === 'object') {
                return (first.serialNumber || first.serial || first.code || first.id) ?? undefined;
              }
            }
            return deviceData?.serial ?? undefined;
          };

          const resolveSerials = (): SerialItem[] => {
            if (Array.isArray(userDeviceData?.serials)) {
              return userDeviceData.serials.map((s: any) => ({
                serialNumber: s.serialNumber || s.serial || s.code || s.id || '—',
                warrantyExpiry: s.warrantyExpiry || s.expiryDate || s.warrantyEnd || null
              }));
            }
            if (Array.isArray(deviceData?.serials)) {
              return deviceData.serials.map((s: any) => ({
                serialNumber: s.serialNumber || s.serial || s.code || s.id || '—',
                warrantyExpiry: s.warrantyExpiry || s.expiryDate || s.warrantyEnd || null
              }));
            }
            const serial = resolveSerial();
            if (serial) {
              return [{
                serialNumber: serial,
                warrantyExpiry: userDeviceData?.warrantyExpiry || userDeviceData?.warrantyEnd || deviceData?.warrantyExpiry || null
              }];
            }
            return [];
          };

          return {
            id: d.id,
            deviceName: deviceData.deviceName || deviceData.name || 'Unnamed Device',
            name: deviceData.name,
            type: deviceData.type,
            status: userDeviceData.status || deviceData.status || 'Active',
            serial: resolveSerial() || 'N/A',
            serials: resolveSerials(),
            modelNumber: deviceData.modelNumber,
            imageUrl: deviceData.imageUrl,
            price: typeof deviceData.price === 'number' ? deviceData.price : null,
            stock: typeof deviceData.stock === 'number' ? deviceData.stock : null,
            rating: typeof deviceData.rating === 'number' ? deviceData.rating : null,
            discount: typeof deviceData.discount === 'number' ? deviceData.discount : null,
            warranty: chosenWarranty,
            warrantySource: chosenSource,
            brand: deviceData.brand || deviceData.manufacturer || deviceData.company || undefined,
            description: deviceData.description || deviceData.details || deviceData.summary || undefined,
            documentationUrl: deviceData.documentationUrl || deviceData.documentation || deviceData.docs || deviceData.manualUrl || deviceData.datasheetUrl || undefined,
          } as DeviceDoc;
        });
      } catch (joinErr) {
        console.warn('DevicesContext: join with Devices collection failed, using minimal entries', joinErr);
        const minimal = userDevicesSnap.docs.map((d) => {
          const data: any = d.data();
          const chosenWarranty = getUserWarranty(data);
          const resolveSerial = () => {
            const possible = [data?.serial, data?.serialNumber].filter(Boolean);
            if (possible.length && typeof possible[0] === 'string') return possible[0] as string;
            if (Array.isArray(data?.serials) && data.serials.length > 0) {
              const first = data.serials[0];
              if (typeof first === 'string') return first;
              if (first && typeof first === 'object') {
                return (first.serialNumber || first.serial || first.code || first.id) ?? undefined;
              }
            }
            return undefined;
          };
          const resolveSerials = (): SerialItem[] => {
            if (Array.isArray(data?.serials)) {
              return data.serials.map((s: any) => ({
                serialNumber: s.serialNumber || s.serial || s.code || s.id || '—',
                warrantyExpiry: s.warrantyExpiry || s.expiryDate || s.warrantyEnd || null,
              }));
            }
            const serial = resolveSerial();
            return serial ? [{ serialNumber: serial, warrantyExpiry: data?.warrantyExpiry || data?.warrantyEnd || null }] : [];
          };
          return {
            id: data?.deviceId || data?.sourceDeviceId || d.id,
            deviceName: data?.deviceName || data?.name || 'My Device',
            name: data?.name,
            type: data?.type,
            status: data?.status || 'Active',
            serial: resolveSerial() || 'N/A',
            serials: resolveSerials(),
            modelNumber: data?.modelNumber || data?.model || data?.modelNo || data?.model_number || data?.deviceModel || undefined,
            imageUrl: data?.imageUrl,
            price: typeof data?.price === 'number' ? data.price : null,
            stock: typeof data?.stock === 'number' ? data.stock : null,
            rating: null,
            discount: null,
            warranty: chosenWarranty,
            warrantySource: chosenWarranty != null ? 'user' : undefined,
            brand: data?.brand,
            description: data?.description,
            documentationUrl: data?.documentationUrl,
          } as DeviceDoc;
        });
        results = minimal;
      }

      setDevices(results || []);
      setError(null);
    } catch (e: any) {
      console.error('DevicesContext fetch error', e);
      setError(e?.message || 'Failed to load devices');
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  // Subscribe to user devices updates once, refresh on change
  useEffect(() => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    if (!uid) {
      setDevices([]);
      setLoading(false);
      setError(null);
      return;
    }

    // Initial load
    fetchDevices();

    // Live updates on user's device docs
    const userDevicesRef = collection(db, 'User_Devices');
    const qy = query(userDevicesRef, where('uid', '==', uid));
    const unsub = onSnapshot(qy, () => {
      // re-fetch join
      fetchDevices();
    }, (err) => {
      console.warn('DevicesContext snapshot error', err);
    });
    unsubRef.current = unsub;

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [uid, fetchDevices]);

  const fetchRecommendations = useCallback(async (params: RecommendationRequest) => {
    setRecommendationLoading(true);
    try {
      const getRecommendations = httpsCallable<any, { recommendations: DeviceRecommendation[] }>(
        functions,
        'chatWithOpenAI'
      );
      
      const response = await getRecommendations({ 
        recommendations: {
          houseSize: params.houseSize,
          priority: params.securityNeeds,
          budget: params.budget
        }
      });
      
      setRecommendations(response.data.recommendations);
    } catch (err: any) {
      console.error('Failed to fetch recommendations:', err);
      setError(err.message || 'Failed to get recommendations');
    } finally {
      setRecommendationLoading(false);
    }
  }, []);

  const saveRecommendationToQuote = useCallback(async (recommendation: DeviceRecommendation) => {
    if (!uid) throw new Error('You must be logged in to save a plan.');
    
    try {
      const qCol = collection(db, 'quotes');
      const payload = {
        userUid: uid,
        customerId: auth.currentUser?.email || null,
        customerEmail: auth.currentUser?.email || null,
        status: 'Pending',
        createdAt: serverTimestamp(),
        quoteType: 'AI Recommendation',
        location: {
          country: 'India',
          state: '',
          district: ''
        },
        details: `AI Recommended: ${recommendation.name}\nCategory: ${recommendation.category}\nPrice: $${recommendation.estimatedPrice}\nReason: ${recommendation.reason}`,
        deviceName: recommendation.name,
        category: recommendation.category,
        estimatedPrice: recommendation.estimatedPrice
      };
      
      await addDoc(qCol, payload);
    } catch (err: any) {
      console.error('Failed to save recommendation:', err);
      throw err;
    }
  }, [uid]);

  const updateItemStatus = useCallback(async (collectionName: string, id: string, newStatus: string) => {
    // 1. Identify local state and capture current for rollback
    let rollbackState: any[] = [];
    let setStateFn: React.Dispatch<React.SetStateAction<any[]>> | null = null;

    if (collectionName === 'Planner_Leads') {
      rollbackState = [...planLeads];
      setStateFn = setPlanLeads;
    } else if (collectionName === 'contactRequests') {
      rollbackState = [...contactSubmissions];
      setStateFn = setContactSubmissions;
    } else if (collectionName === 'Support_Tickets') {
      rollbackState = [...reports];
      setStateFn = setReports;
    }

    // 2. Optimistic Update
    if (setStateFn) {
      setStateFn(prev => prev.map(item => 
        item.id === id ? { ...item, status: newStatus } : item
      ));
    }

    try {
      const updateFn = httpsCallable<any, { status: string }>(functions, 'adminUpdateStatuses');
      await updateFn({
        updates: [{ collection: collectionName, id, status: newStatus }]
      });
    } catch (err: any) {
      console.error(`Failed to update status for ${id} in ${collectionName}:`, err);
      // 3. Rollback on failure
      if (setStateFn) setStateFn(rollbackState);
      throw err;
    }
  }, [planLeads, contactSubmissions, reports]);

  const value = useMemo<DevicesContextValue>(() => ({ 
    devices, loading, adminLoading, error, refresh: fetchDevices, uid,
    planLeads, contactSubmissions, reports, isFloorplanItem,
    filteredPlanLeads, filteredContactSubmissions, filteredReports,
    searchQuery, setSearchQuery, filterCriteria, setFilterCriteria,
    recommendations, recommendationLoading, fetchRecommendations,
    saveRecommendationToQuote, updateItemStatus
  }), [devices, loading, adminLoading, error, fetchDevices, uid, planLeads, contactSubmissions, reports, isFloorplanItem, filteredPlanLeads, filteredContactSubmissions, filteredReports, searchQuery, filterCriteria, recommendations, recommendationLoading, fetchRecommendations, saveRecommendationToQuote, updateItemStatus]);

  return (
    <DevicesContext.Provider value={value}>
      {children}
    </DevicesContext.Provider>
  );
};

export function useDevices() {
  const ctx = useContext(DevicesContext);
  if (!ctx) throw new Error('useDevices must be used within a DevicesProvider');
  return ctx;
}
