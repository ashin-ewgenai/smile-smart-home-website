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


export type DeviceHealth = {
  score: number;
  status: 'Online' | 'Offline';
  lastSeen: string;
  batteryLevel: number;
  signalStrength: number;
  alerts: string[];
};

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
  health?: DeviceHealth;
};

export const MOCK_DEVICES: DeviceDoc[] = [
  {
    id: 'mock-light-1',
    deviceName: 'Living Room Main Light',
    name: 'Smart Color Bulb',
    type: 'Color Bulb',
    status: 'Active',
    brand: 'Phillips Hue',
    modelNumber: 'HUE-V2-RGB',
    description: 'Full spectrum RGB smart bulb for the living room.',
    health: {
      score: 94,
      status: 'Online',
      lastSeen: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      batteryLevel: 100,
      signalStrength: -48,
      alerts: []
    }
  },
  {
    id: 'mock-lock-1',
    deviceName: 'Front Door Lock',
    name: 'Pro Smart Lock',
    type: 'Smart Lock',
    status: 'Active',
    brand: 'Yale Secure',
    modelNumber: 'Y-2024-L',
    description: 'Biometric and remote-controlled security lock.',
    health: {
      score: 62,
      status: 'Online',
      lastSeen: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      batteryLevel: 21,
      signalStrength: -72,
      alerts: ['⚠️ Battery critically low — replace soon']
    }
  },
  {
    id: 'mock-ac-1',
    deviceName: 'Master Bedroom AC',
    name: 'Learning Thermostat',
    type: 'Thermostat',
    status: 'Active',
    brand: 'Nest Pro',
    modelNumber: 'N-TERM-GEN3',
    description: 'AI-driven climate control for optimal comfort.',
    health: {
      score: 89,
      status: 'Online',
      lastSeen: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
      batteryLevel: 87,
      signalStrength: -55,
      alerts: []
    }
  },
  {
    id: 'mock-dimmer-1',
    deviceName: 'Patio Uplights',
    name: 'In-Wall Dimmer',
    type: 'Dimmer Switch',
    status: 'Active',
    brand: 'Lutron Caseta',
    modelNumber: 'L-DIM-01',
    description: 'Smart dimmer for exterior mood lighting.',
    health: {
      score: 78,
      status: 'Online',
      lastSeen: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      batteryLevel: 65,
      signalStrength: -68,
      alerts: []
    }
  },
  {
    id: 'mock-camera-1',
    deviceName: 'Garage Entry Cam',
    name: 'Floodlight Camera',
    type: 'Security Camera',
    status: 'Offline',
    brand: 'Ring Pro',
    modelNumber: 'R-CAM-FLD',
    description: 'Motion-activated floodlight and 4K security camera.',
    health: {
      score: 38,
      status: 'Offline',
      lastSeen: new Date(Date.now() - 95 * 60 * 1000).toISOString(),
      batteryLevel: 12,
      signalStrength: -91,
      alerts: ['🔴 Device offline — check power and Wi-Fi signal']
    }
  }
];

/** Fallback admin stats for demo / pre-deploy environments */
export const MOCK_ADMIN_HEALTH_STATS = {
  aggregatedScore: 72,
  onlineCount: 4,
  offlineCount: 1,
  totalDevices: 5,
  alertCount: 2,
  timestamp: new Date().toISOString()
};

export const MOCK_SCENES: any[] = [
  {
    id: 'mock-scene-1',
    name: 'Movie Night',
    icon: 'Film',
    actions: [
      { deviceId: 'mock-light-1', deviceName: 'Living Room Main Light', action: 'dim', value: 20 },
      { deviceId: 'mock-lock-1', deviceName: 'Front Door Lock', action: 'lock' }
    ]
  },
  {
    id: 'mock-scene-2',
    name: 'Eco Away',
    icon: 'Wind',
    actions: [
      { deviceId: 'mock-ac-1', deviceName: 'Master Bedroom AC', action: 'off' },
      { deviceId: 'mock-light-1', deviceName: 'Living Room Main Light', action: 'off' }
    ]
  }
];

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
  // Scene-related
  scenes: any[];
  sceneLoading: boolean;
  fetchScenes: () => Promise<void>;
  saveScene: (scene: any) => Promise<void>;
  deleteScene: (sceneId: string) => Promise<void>;
  // Health-related
  adminHealthStats: any | null;
  fetchAdminHealthOverview: () => Promise<void>;
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
  const [scenes, setScenes] = useState<any[]>([]);
  const [sceneLoading, setSceneLoading] = useState<boolean>(false);
  const [adminHealthStats, setAdminHealthStats] = useState<any | null>(null);
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
        setDevices(MOCK_DEVICES);
        setError(null);
        return;
      }

      const sourceDeviceIds = userDevicesSnap.docs.map(doc => (doc.data() as any).sourceDeviceId).filter(Boolean);

      if (sourceDeviceIds.length === 0) {
        setDevices(MOCK_DEVICES);
        setError(null);
        return;
      }

      const devicesRef = collection(db, 'Devices');
      const batches: string[][] = [];
      for (let i = 0; i < sourceDeviceIds.length; i += 10) batches.push(sourceDeviceIds.slice(i, i + 10));
      const deviceDocs: any[] = [];
      for (const ids of batches) {
        const qy = query(devicesRef, where('__name__', 'in', ids));
        const snap = await getDocs(qy);
        deviceDocs.push(...snap.docs);
      }

      const userDevicesMap = new Map(userDevicesSnap.docs.map(d => [ (d.data() as any).sourceDeviceId, d.data() ]));
      const results = deviceDocs.map((d) => {
        const deviceData = d.data() as any;
        const userDeviceData: any = userDevicesMap.get(d.id) || {};
        return {
          id: d.id,
          deviceName: deviceData.deviceName || deviceData.name || 'Unnamed Device',
          name: deviceData.name,
          type: deviceData.type,
          status: userDeviceData.status || deviceData.status || 'Active',
          serial: userDeviceData.serial || deviceData.serial || 'N/A',
          modelNumber: deviceData.modelNumber,
          imageUrl: deviceData.imageUrl,
          price: typeof deviceData.price === 'number' ? deviceData.price : null,
          stock: typeof deviceData.stock === 'number' ? deviceData.stock : null,
          warranty: getUserWarranty(userDeviceData) || deviceData.warranty || null,
          brand: deviceData.brand,
          description: deviceData.description,
          health: userDeviceData.health || {
            score: 100,
            status: 'Online',
            lastSeen: new Date().toISOString(),
            batteryLevel: userDeviceData.batteryLevel ?? 100,
            signalStrength: userDeviceData.signalStrength ?? -50,
            alerts: []
          }
        };
      });

      setDevices(results as any);
      setError(null);
    } catch (e: any) {
      console.error('DevicesContext fetch error', e);
      setError(e?.message || 'Failed to load devices');
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  const fetchScenes = useCallback(async () => {
    if (!uid) {
      setScenes([]);
      return;
    }
    setSceneLoading(true);
    try {
      const getScenesFn = httpsCallable<any, { scenes: any[] }>(functions, 'getUserScenes');
      const res = await getScenesFn();
      const userScenes = res.data.scenes || [];
      
      // Fallback to mock scenes if none found
      setScenes(userScenes.length > 0 ? userScenes : MOCK_SCENES);
    } catch (err) {
      console.error('Failed to fetch scenes:', err);
      // Fallback to mock scenes on error for demo purposes
      setScenes(MOCK_SCENES);
    } finally {
      setSceneLoading(false);
    }
  }, [uid]);

  const saveScene = useCallback(async (scene: any) => {
    if (!uid) throw new Error('Must be logged in to save scenes.');
    setSceneLoading(true);
    try {
      const saveSceneFn = httpsCallable<any, { status: string; id: string }>(functions, 'saveUserScene');
      await saveSceneFn({ scene });
      await fetchScenes();
    } catch (err) {
      console.error('Failed to save scene:', err);
      throw err;
    } finally {
      setSceneLoading(false);
    }
  }, [uid, fetchScenes]);

  const deleteScene = useCallback(async (sceneId: string) => {
    if (!uid) throw new Error('Must be logged in to delete scenes.');
    setSceneLoading(true);
    try {
      const deleteFn = httpsCallable<any, { status: string }>(functions, 'deleteUserScene');
      await deleteFn({ sceneId });
      await fetchScenes();
    } catch (err) {
      console.error('Failed to delete scene:', err);
      throw err;
    } finally {
      setSceneLoading(false);
    }
  }, [uid, fetchScenes]);

  const fetchRecommendations = useCallback(async (params: RecommendationRequest) => {
    setRecommendationLoading(true);
    try {
      const getRecommendations = httpsCallable<any, { recommendations: DeviceRecommendation[] }>(functions, 'chatWithOpenAI');
      const response = await getRecommendations({ 
        recommendations: { houseSize: params.houseSize, priority: params.securityNeeds, budget: params.budget }
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
      await addDoc(qCol, {
        userUid: uid,
        customerEmail: auth.currentUser?.email || null,
        status: 'Pending',
        createdAt: serverTimestamp(),
        quoteType: 'AI Recommendation',
        details: `AI Recommended: ${recommendation.name}\nPrice: $${recommendation.estimatedPrice}`,
        deviceName: recommendation.name,
        category: recommendation.category,
        estimatedPrice: recommendation.estimatedPrice
      });
    } catch (err: any) {
      console.error('Failed to save recommendation:', err);
      throw err;
    }
  }, [uid]);

  const fetchAdminHealthOverview = useCallback(async () => {
    try {
      const getOverviewFn = httpsCallable<any, any>(functions, 'getAdminHealthOverview');
      const res = await getOverviewFn();
      setAdminHealthStats(res.data);
    } catch (err) {
      console.warn('Admin health function unavailable, using demo stats:', err);
      // Fallback for demo mode / pre-deploy environments
      setAdminHealthStats(MOCK_ADMIN_HEALTH_STATS);
    }
  }, []);

  const updateItemStatus = useCallback(async (collectionName: string, id: string, newStatus: string) => {
    let rollbackState: any[] = [];
    let setStateFn: any = null;

    if (collectionName === 'Planner_Leads') { rollbackState = [...planLeads]; setStateFn = setPlanLeads; }
    else if (collectionName === 'contactRequests') { rollbackState = [...contactSubmissions]; setStateFn = setContactSubmissions; }
    else if (collectionName === 'Support_Tickets') { rollbackState = [...reports]; setStateFn = setReports; }

    if (setStateFn) {
      setStateFn((prev: any[]) => prev.map(item => item.id === id ? { ...item, status: newStatus } : item));
    }

    try {
      const updateFn = httpsCallable<any, { status: string }>(functions, 'adminUpdateStatuses');
      await updateFn({ updates: [{ collection: collectionName, id, status: newStatus }] });
    } catch (err: any) {
      console.error(`Status update failed:`, err);
      if (setStateFn) setStateFn(rollbackState);
      throw err;
    }
  }, [planLeads, contactSubmissions, reports]);

  useEffect(() => {
    if (uid) {
      fetchDevices();
      fetchScenes();
    }
  }, [uid, fetchDevices, fetchScenes]);

  useEffect(() => {
    if (!uid) return;
    const qy = query(collection(db, 'User_Devices'), where('uid', '==', uid));
    const unsub = onSnapshot(qy, () => {
      fetchDevices();
    });
    return () => unsub();
  }, [uid, fetchDevices]);

  const value = useMemo<DevicesContextValue>(() => ({ 
    devices, loading, adminLoading, error, refresh: fetchDevices, uid,
    planLeads, contactSubmissions, reports, isFloorplanItem,
    filteredPlanLeads, filteredContactSubmissions, filteredReports,
    searchQuery, setSearchQuery, filterCriteria, setFilterCriteria,
    recommendations, recommendationLoading, fetchRecommendations,
    saveRecommendationToQuote, updateItemStatus,
    scenes, sceneLoading, fetchScenes, saveScene, deleteScene,
    adminHealthStats, fetchAdminHealthOverview
  }), [devices, loading, adminLoading, error, fetchDevices, uid, planLeads, contactSubmissions, reports, isFloorplanItem, filteredPlanLeads, filteredContactSubmissions, filteredReports, searchQuery, filterCriteria, recommendations, recommendationLoading, fetchRecommendations, saveRecommendationToQuote, updateItemStatus, scenes, sceneLoading, fetchScenes, saveScene, deleteScene, adminHealthStats, fetchAdminHealthOverview]);

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
