/**
 * DevicesContext.tsx
 * File: src/contexts/DevicesContext.tsx
 *
 * README Usage Documentation Reference:
 * This context is documented in README.md "Usage" section under:
 * "Developer Workflow: State Management with src/contexts/DevicesContext.tsx"
 *
 * Features:
 * - Provides global state for: device inventory, health telemetry, AI recommendations
 * - Room visualization state: uploadAndAnalyzeRoom(), visualizationData
 * - Scene management: scenes, saveScene(), fetchScenes()
 * - Notifications: showNotification(), showCriticalError()
 * - Admin CRM data: adminHealthStats, plannerLeads, supportTickets
 *
 * See README.md Usage section for hook usage examples with useDevices().
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { collection, getDocs, onSnapshot, query, where, or, orderBy, Timestamp, addDoc, setDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db, functions, uploadRoomPhoto } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';
import type { ContactRequest, PlannerLead, SupportTicket, QuoteItem } from '../models/Collections';
import { quotesCollection } from '../models/Collections';
import type { DeviceRecommendation, RecommendationRequest, RoomVisualizationResult } from '../models';

// UI Components integrated directly to comply with "no new files" constraint

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

/**
 * Translates technical error messages (like Firebase internal errors) 
 * into user-friendly, professional messages.
 * Consolidated here to keep the application stable within a specific file subset commit.
 */
export const getFriendlyErrorMessage = (err: any): string => {
  if (typeof window !== 'undefined' && !window.navigator.onLine) {
    return "No internet connection. Please check your network and try again.";
  }
  
  if (typeof err === 'string') {
    if (err.toLowerCase().includes('internal')) return "Our secondary services are briefly busy. Please try again soon.";
    return err;
  }

  const code = err?.code || (err?.message?.includes('internal') ? 'internal' : 'unknown');
  
  switch (code) {
    case 'internal':
      return "Our secondary services are briefly busy. Please try again in a few moments.";
    case 'unavailable':
      return "The cloud service is currently unreachable. Please check your connection.";
    case 'deadline-exceeded':
      return "The request timed out. This can happen on slower connections.";
    case 'permission-denied':
      return "You don't have permission to perform this action.";
    case 'unauthenticated':
      return "Your session has expired. Please sign in again.";
    default:
      return err?.message || "An unexpected error occurred. Please try again.";
  }
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

export type NotificationType = 'success' | 'error' | 'warning' | 'info';
export type NotificationMode = 'snackbar' | 'modal';

export interface NotificationState {
  message: React.ReactNode | null;
  type: NotificationType;
  mode: NotificationMode;
  isOpen: boolean;
  title?: string;
}

export interface CriticalErrorState {
  isOpen: boolean;
  title: string;
  message: string;
  onRetry?: () => void;
}

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
  updateItemDragIndex: (collectionName: string, id: string, newDragIndex: number) => Promise<void>;
  // Scene-related
  scenes: any[];
  sceneLoading: boolean;
  fetchScenes: () => Promise<void>;
  saveScene: (scene: any) => Promise<void>;
  deleteScene: (sceneId: string) => Promise<void>;
  // Health-related
  adminHealthStats: any | null;
  fetchAdminHealthOverview: () => Promise<void>;
  isAdmin: boolean;
  // Room Visualization
  roomPhoto: File | null;
  roomPhotoUrl: string | null;
  roomPhotoPreview: string | null;
  uploadProgress: number;
  uploadError: string | null;
  uploadLoading: boolean;
  visualizationLoading: boolean;
  visualizationData: RoomVisualizationResult | null;
  visualizationError: string | null;
  setRoomPhoto: (file: File) => void;
  clearVisualization: () => void;
  uploadAndAnalyzeRoom: (deviceNames: string[]) => Promise<void>;
  // Live Consultation
  activeConsultationId: string | null;
  consultationLoading: boolean;
  startLiveConsultation: () => Promise<string>;
  // Planning Leads for current user
  userPlannerLeads: PlannerLead[];
  currentUser: User | null;
  loginWithGoogle: () => Promise<User>;
  // Global Notification
  notification: NotificationState;
  showNotification: (params: { message: React.ReactNode; type?: NotificationType; mode?: NotificationMode; title?: string }) => void;
  hideNotification: () => void;
  // Critical Error Modal
  criticalError: CriticalErrorState;
  showCriticalError: (params: { title: string; message: string; onRetry?: () => void }) => void;
  hideCriticalError: () => void;
}

export const DevicesContext = createContext<DevicesContextValue | undefined>(undefined);

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

/** 
 * Integrated Snackbar Component
 * Standardized for transient, non-blocking feedback.
 */
const Snackbar: React.FC<{
  isOpen: boolean;
  message: React.ReactNode;
  type: NotificationType;
  onClose: () => void;
}> = ({ isOpen, message, type, onClose }) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.9 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] w-full max-w-md px-4 pointer-events-none"
        role="alert"
        aria-live="polite"
      >
        <div className={`
          backdrop-blur-xl border p-4 rounded-2xl shadow-2xl flex items-start gap-4 pointer-events-auto
          ${type === 'error' ? 'bg-red-500/20 border-red-500/30 text-red-100' :
            type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-100' :
            type === 'warning' ? 'bg-amber-500/20 border-amber-500/30 text-amber-100' :
            'bg-blue-500/20 border-blue-500/30 text-blue-100'}
        `}>
          <div className="mt-0.5 shrink-0">
            {type === 'error' && <AlertCircle className="w-5 h-5 text-red-400" />}
            {type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-400" />}
            {type === 'info' && <Info className="w-5 h-5 text-blue-400" />}
            {type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-relaxed">{message}</p>
          </div>
          <button 
            onClick={onClose}
            className="mt-0.5 opacity-40 hover:opacity-100 transition-opacity p-1 -mr-1 rounded-lg hover:bg-white/10"
            aria-label="Close notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

export const DevicesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [role, setRole] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceDoc[]>([]);
  const [planLeads, setPlanLeads] = useState<PlannerLead[]>([]);
  const [contactSubmissions, setContactSubmissions] = useState<ContactRequest[]>([]);
  const [reports, setReports] = useState<SupportTicket[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCriteria, setFilterCriteria] = useState({ dateRange: 'all', itemType: 'all' });
  const [loading, setLoading] = useState<boolean>(false);
  const [adminLoading, setAdminLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<DeviceRecommendation[]>([]);
  const [recommendationLoading, setRecommendationLoading] = useState<boolean>(false);
  const [scenes, setScenes] = useState<any[]>([]);
  const [sceneLoading, setSceneLoading] = useState<boolean>(false);
  const [adminHealthStats, setAdminHealthStats] = useState<any | null>(null);
  const adminHealthStatsRef = useRef<any | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // ── Room Visualization State ─────────────────────────────────────────────
  const [roomPhoto, setRoomPhotoFile] = useState<File | null>(null);
  const [roomPhotoUrl, setRoomPhotoUrl] = useState<string | null>(null);
  const [roomPhotoPreview, setRoomPhotoPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState<boolean>(false);
  const [visualizationLoading, setVisualizationLoading] = useState<boolean>(false);
  const [visualizationData, setVisualizationData] = useState<RoomVisualizationResult | null>(null);
  const [visualizationError, setVisualizationError] = useState<string | null>(null);
  const analysisInFlight = useRef(false);

  // ── Live Consultation State ─────────────────────────────────────────────
  const [activeConsultationId, setActiveConsultationId] = useState<string | null>(null);
  const [consultationLoading, setConsultationLoading] = useState<boolean>(false);

  // ── User Planning Leads State ───────────────────────────────────────────
  const [adminAccepted, setAdminAccepted] = useState<boolean>(false);
  const [userPlannerLeads, setUserPlannerLeads] = useState<PlannerLead[]>([]);

  // ── Global Notification State ──────────────────────────────────────────
  const [notification, setNotification] = useState<NotificationState>({
    message: null,
    type: 'info',
    mode: 'snackbar',
    isOpen: false,
    title: ''
  });

  const [criticalError, setCriticalError] = useState<CriticalErrorState>({
    isOpen: false,
    title: '',
    message: '',
  });


  const showNotification = useCallback((params: { 
    message: React.ReactNode; 
    type?: NotificationType; 
    mode?: NotificationMode; 
    title?: string 
  }) => {
    setNotification({
      message: params.message,
      type: params.type || 'info',
      mode: params.mode || 'snackbar',
      isOpen: true,
      title: params.title || (params.type === 'error' ? 'Error' : params.type === 'success' ? 'Success' : 'Notice')
    });

    // Auto-hide snackbars after 6 seconds
    if ((params.mode || 'snackbar') === 'snackbar') {
      setTimeout(() => {
        setNotification(prev => ({ ...prev, isOpen: false }));
      }, 6000);
    }
  }, []);

  const hideNotification = useCallback(() => {
    setNotification(prev => ({ ...prev, isOpen: false }));
  }, []);

  const showCriticalError = useCallback(({ title, message, onRetry }: { 
    title: string; 
    message: string; 
    onRetry?: () => void;
  }) => {
    setCriticalError({ isOpen: true, title, message, onRetry });
  }, []);

  const hideCriticalError = useCallback(() => {
    setCriticalError(prev => ({ ...prev, isOpen: false }));
  }, []);

  const setRoomPhoto = useCallback((file: File) => {
    setRoomPhotoFile(file);
    setUploadError(null);
    setVisualizationData(null);
    setVisualizationError(null);
    setUploadProgress(0);
    setRoomPhotoUrl(null);
    const preview = URL.createObjectURL(file);
    setRoomPhotoPreview(preview);
  }, []);

  const clearVisualization = useCallback(() => {
    setRoomPhotoFile(null);
    setRoomPhotoUrl(null);
    setRoomPhotoPreview(null);
    setUploadProgress(0);
    setUploadError(null);
    setVisualizationData(null);
    setVisualizationError(null);
  }, []);

  const uploadAndAnalyzeRoom = useCallback(async (deviceNames: string[]) => {
    if (!roomPhoto) {
      showNotification({ message: 'Please select a room photo first.', type: 'warning' });
      return;
    }
    if (!uid) {
      showNotification({ 
        message: 'Please sign in to use Room Visualizer.', 
        type: 'warning'
      });
      return;
    }
    if (!window.navigator.onLine) {
      showNotification({ 
        message: 'No internet connection. Please check your network and try again.', 
        type: 'error'
      });
      return;
    }

    if (analysisInFlight.current) return;
    analysisInFlight.current = true;

    setUploadError(null);
    setVisualizationError(null);
    setVisualizationData(null);
    setUploadLoading(true);
    setUploadProgress(0);

    try {
      const downloadUrl = await uploadRoomPhoto(roomPhoto, uid, (pct) => {
        setUploadProgress(pct);
      });
      setRoomPhotoUrl(downloadUrl);
      setUploadLoading(false);

      setVisualizationLoading(true);

      // Verify UID again right before the call to ensure no closure stale context
      const currentUid = uid || auth.currentUser?.uid;
      if (!currentUid) {
         throw new Error("No user ID found. Please refresh and try again.");
      }

      console.log("Calling analyzeRoomWithAI with UID:", currentUid);
      const analyzeFn = httpsCallable<any, RoomVisualizationResult>(functions, 'analyzeRoomWithAI');
      const result = await analyzeFn({ imageUrl: downloadUrl, deviceNames, uid: currentUid });
      const data = result.data;
      setVisualizationData(data);

      // Persist Floorplan result to Planner_Leads
      const email = auth.currentUser?.email || 'anonymous';
      const emailKey = email.trim().toLowerCase();
      await setDoc(doc(db, 'Planner_Leads', `${emailKey}_fp_${Date.now()}`), {
        email: emailKey,
        uid: currentUid,
        status: 'new',
        source: 'floorplan',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        complexity: 'Floorplan Analysis',
        roomType: data.roomType,
        lightingQuality: data.lightingQuality,
        wifiCoverageNote: data.wifiCoverageNote,
        generalInsight: data.generalInsight,
        markers: data.markers,
        imageUrl: downloadUrl,
        planText: `Room Type: ${data.roomType}\nLighting: ${data.lightingQuality}\nWiFi: ${data.wifiCoverageNote}\n\nInsight: ${data.generalInsight}`
      });
    } catch (err: any) {
      console.error("AI Room Analysis Failed:", err);
      const msg = getFriendlyErrorMessage(err);
      setVisualizationError(msg);
      showCriticalError({ 
        title: 'Analysis Failed',
        message: msg,
        onRetry: () => uploadAndAnalyzeRoom(deviceNames)
      });
    } finally {
      setUploadLoading(false);
      setVisualizationLoading(false);
      analysisInFlight.current = false;
    }
  }, [roomPhoto, uid, uploadLoading]);

  const startLiveConsultation = useCallback(async (): Promise<string> => {
    if (!uid) {
      throw new Error('Must be logged in to start a consultation.');
    }
    setConsultationLoading(true);
    try {
      const initiateFn = httpsCallable<any, { sessionId: string; status: string }>(functions, 'initiateLiveConsultation');
      const res = await initiateFn();
      const sid = res.data.sessionId;
      setActiveConsultationId(sid);
      return sid;
    } catch (err: any) {
      console.error('Failed to initiate consultation:', err);
      throw err;
    } finally {
      setConsultationLoading(false);
    }
  }, [uid]);


  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUser(u);
      setUid(u?.uid ?? null);
      if (!u) setRole(null);
    });
    return () => unsub();
  }, []);

  // Fetch user role
  useEffect(() => {
    if (!uid) {
      setRole(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'Accounts', uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setRole(data.Role || 'User');
      } else {
        setRole('User');
      }
    }, (err) => {
      console.warn('Failed to fetch user role (expected for new or guest accounts):', err);
      setRole('User');
    });
    return () => unsub();
  }, [uid]);

  const isAdmin = useMemo(() => {
    if (!role) return false;
    const r = role.toLowerCase();
    return r === 'admin' || r === 'super admin';
  }, [role]);

  useEffect(() => {
    let unsubs: (() => void)[] = [];

    if (uid && isAdmin) {
      setAdminLoading(true);
      try {
        const u1 = onSnapshot(collection(db, 'Planner_Leads'), snap => {
          setPlanLeads(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as PlannerLead)));
          setAdminLoading(false);
        }, (err) => { 
          console.debug('Planner_Leads collection snapshot failed (expected for non-admins):', err);
          setAdminLoading(false);
        }); 
        const u2 = onSnapshot(collection(db, 'contactRequests'), snap => {
          setContactSubmissions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as ContactRequest)));
          setAdminLoading(false);
        }, (err) => { 
          console.debug('contactRequests collection snapshot failed (expected for non-admins):', err);
          setAdminLoading(false);
        });
        const u3 = onSnapshot(collection(db, 'Support_Tickets'), snap => {
          setReports(snap.docs.map(doc => {
            const data = doc.data();
            return { 
              id: doc.id, 
              ...data, 
              userUid: data.uid,
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt || null),
              adminRepliedAt: data.adminRepliedAt?.toDate ? data.adminRepliedAt.toDate() : (data.adminRepliedAt || null)
            } as unknown as SupportTicket;
          }));
          setAdminLoading(false);
        }, (err) => { 
          console.debug('Support_Tickets collection snapshot failed (expected for non-admins):', err);
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
      // If user is just a regular user, we don't show admin loader
      if (uid && !isAdmin) setAdminLoading(false);
    }
    return () => unsubs.forEach(u => u());
  }, [uid, role]);

  // Real-time listener for current user's planner leads (UID or Email match)
  useEffect(() => {
    if (!uid) {
      setUserPlannerLeads([]);
      return;
    }
    
    const userEmail = auth.currentUser?.email?.trim();
    if (!userEmail && !uid) return;

    // Remove orderBy to avoid 'missing index' errors for composite 'or' queries.
    // We will sort in memory for maximum reliability.
    const q = query(
      collection(db, 'Planner_Leads'), 
      or(
        where('uid', '==', uid), 
        ...(userEmail ? [
          where('email', '==', userEmail.toLowerCase()),
          where('email', '==', userEmail) 
        ] : [])
      )
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const leads = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      // Deduplicate by ID just in case
      const uniqueLeads = Array.from(new Map(leads.map(l => [l.id, l])).values());
      
      // Update global acceptance status
      setAdminAccepted(uniqueLeads.some(l => l.status === 'accepted' || l.status === 'Accepted' || l.adminAccepted === true));

      // Sort in memory by updatedAt or createdAt
      const sortedLeads = uniqueLeads.sort((a, b) => {
        const dateA = a.updatedAt?.toDate?.() || new Date(a.updatedAt || 0);
        const dateB = b.updatedAt?.toDate?.() || new Date(b.updatedAt || 0);
        return dateB.getTime() - dateA.getTime();
      }) as unknown as PlannerLead[];

      setUserPlannerLeads(sortedLeads);
    }, (err) => {
      console.warn('User planner leads listener failed:', err);
    });
    return () => unsub();
  }, [uid, auth.currentUser?.email]);

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
    if (!window.navigator.onLine) {
      showNotification({ 
        message: 'No internet connection. Please check your network and try again.', 
        type: 'error'
      });
      return;
    }
    setSceneLoading(true);
    try {
      const saveSceneFn = httpsCallable<any, { status: string; id: string }>(functions, 'saveUserScene');
      await saveSceneFn({ scene });
      await fetchScenes();
      showNotification({ message: 'Scene saved successfully!', type: 'success' });
    } catch (err: any) {
      console.error('Failed to save scene:', err);
      const msg = getFriendlyErrorMessage(err);
      showNotification({ 
        message: msg, 
        type: 'error'
      });
      throw err;
    } finally {
      setSceneLoading(false);
    }
  }, [uid, fetchScenes]);

  const deleteScene = useCallback(async (sceneId: string) => {
    if (!uid) throw new Error('Must be logged in to delete scenes.');
    if (!window.navigator.onLine) {
      showNotification({ 
        message: 'No internet connection. Please check your network and try again.', 
        type: 'error'
      });
      return;
    }
    setSceneLoading(true);
    try {
      const deleteFn = httpsCallable<any, { status: string }>(functions, 'deleteUserScene');
      await deleteFn({ sceneId });
      await fetchScenes();
      showNotification({ message: 'Scene deleted.', type: 'success' });
    } catch (err: any) {
      console.error('Failed to delete scene:', err);
      const msg = getFriendlyErrorMessage(err);
      showNotification({ 
        message: msg, 
        type: 'error'
      });
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
      const msg = getFriendlyErrorMessage(err);
      setError(msg);
      showNotification({ message: msg, type: 'error' });
    } finally {
      setRecommendationLoading(false);
    }
  }, []);

  const saveRecommendationToQuote = useCallback(async (recommendation: DeviceRecommendation) => {
    if (!uid) throw new Error('You must be logged in to save a plan.');
    try {
      const pCol = collection(db, 'Planner_Leads');
      const email = auth.currentUser?.email || 'anonymous';
      const emailKey = email.trim().toLowerCase();
      
      await setDoc(doc(db, 'Planner_Leads', `${emailKey}_ai_${Date.now()}`), {
        email: emailKey,
        uid: uid,
        status: 'new',
        source: 'ai_consultant',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        complexity: 'AI Recommended',
        recommendedAreas: [recommendation.category || 'Smart Home'],
        formData: {
          deviceName: recommendation.name,
          category: recommendation.category,
          estimatedPrice: recommendation.estimatedPrice,
          details: recommendation.reason
        },
        planText: `AI Recommended: ${recommendation.name}\nPrice: ₹${recommendation.estimatedPrice}\n\n${recommendation.reason}`
      });
    } catch (err: any) {
      console.error('Failed to save recommendation to Plan Leads:', {
        error: err,
        message: err.message,
        code: err.code,
        uid: uid,
        email: auth.currentUser?.email
      });
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
    try {
      const docRef = doc(db, collectionName, id);
      const updateData: any = { 
        status: newStatus, 
        updatedAt: serverTimestamp() 
      };

      // Handle Admin Acceptance logic in frontend for real-time responsiveness
      if (collectionName === 'Planner_Leads' && (newStatus === 'accepted' || newStatus === 'Accepted')) {
        updateData.adminAccepted = true;
        updateData.acceptedAt = serverTimestamp();
      }

      await updateDoc(docRef, updateData);
    } catch (err: any) {
      console.error(`Status update failed:`, err);
      throw err;
    }
  }, []);

  const updateItemDragIndex = useCallback(async (collectionName: string, id: string, newDragIndex: number) => {
    try {
      const docRef = doc(db, collectionName, id);
      await updateDoc(docRef, { 
        dragIndex: newDragIndex, 
        updatedAt: serverTimestamp() 
      });
    } catch (err: any) {
      console.error(`Drag index update failed:`, err);
      throw err;
    }
  }, []);

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

  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      return result.user;
    } catch (err) {
      console.error('Google Login Error in DevicesContext:', err);
      throw err;
    }
  }, []);

  const value = useMemo(() => ({
    devices,
    planLeads,
    contactSubmissions,
    reports,
    filteredPlanLeads,
    filteredContactSubmissions,
    filteredReports,
    searchQuery,
    setSearchQuery,
    filterCriteria,
    setFilterCriteria,
    loading,
    adminLoading,
    error,
    refresh: fetchDevices,
    uid,
    isFloorplanItem,
    recommendations,
    recommendationLoading,
    fetchRecommendations,
    saveRecommendationToQuote,
    updateItemStatus,
    updateItemDragIndex,
    scenes,
    sceneLoading,
    fetchScenes,
    saveScene,
    deleteScene,
    adminHealthStats,
    fetchAdminHealthOverview,
    isAdmin,
    roomPhoto,
    roomPhotoUrl,
    roomPhotoPreview,
    uploadProgress,
    uploadError,
    uploadLoading,
    visualizationLoading,
    visualizationData,
    visualizationError,
    setRoomPhoto,
    clearVisualization,
    uploadAndAnalyzeRoom,
    activeConsultationId,
    consultationLoading,
    startLiveConsultation,
    userPlannerLeads,
    currentUser,
    loginWithGoogle,
    notification,
    showNotification,
    hideNotification,
    criticalError,
    showCriticalError,
    hideCriticalError
  }), [
    devices, planLeads, contactSubmissions, reports, filteredPlanLeads,
    filteredContactSubmissions, filteredReports, searchQuery, filterCriteria,
    loading, adminLoading, error, fetchDevices, uid, isFloorplanItem,
    recommendations, recommendationLoading, fetchRecommendations,
    saveRecommendationToQuote, updateItemStatus, updateItemDragIndex,
    scenes, sceneLoading, fetchScenes, saveScene, deleteScene,
    adminHealthStats, isAdmin, roomPhoto, roomPhotoUrl,
    roomPhotoPreview, uploadProgress, uploadError, uploadLoading,
    visualizationLoading, visualizationData, visualizationError,
    setRoomPhoto, clearVisualization, uploadAndAnalyzeRoom,
    activeConsultationId, consultationLoading, startLiveConsultation,
    userPlannerLeads, currentUser, loginWithGoogle, notification,
    showNotification, hideNotification,
    criticalError, showCriticalError, hideCriticalError
  ]);

  return (
    <DevicesContext.Provider value={value}>
      {children}
      
      
      {/* ── Notification Components ── */}

      {/* Global Snackbar for transient notifications */}
      <Snackbar 
        isOpen={notification.isOpen && notification.mode === 'snackbar'}
        message={notification.message}
        type={notification.type}
        onClose={hideNotification}
      />

      {/* Global Modals for critical / blocking feedback */}
      <AnimatePresence>
        {notification.isOpen && notification.mode === 'modal' && (
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={hideNotification}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-[#0A0A0B] border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
            >
              <div className={`h-1.5 w-full ${
                notification.type === 'error' ? 'bg-red-500' :
                notification.type === 'success' ? 'bg-emerald-500' :
                'bg-blue-500'
              }`} />
              <div className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className={`p-3 rounded-2xl ${
                    notification.type === 'error' ? 'bg-red-500/10 text-red-500' :
                    notification.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' :
                    'bg-blue-500/10 text-blue-500'
                  }`}>
                    {notification.type === 'error' && <AlertCircle className="w-8 h-8" />}
                    {notification.type === 'success' && <CheckCircle className="w-8 h-8" />}
                    {notification.type === 'info' && <Info className="w-8 h-8" />}
                    {notification.type === 'warning' && <AlertTriangle className="w-8 h-8" />}
                  </div>
                  <h3 id="modal-title" className="text-2xl font-bold text-white leading-none">
                    {notification.title || (notification.type === 'error' ? 'Error' : 'Notification')}
                  </h3>
                </div>
                
                <p className="text-white/60 text-lg leading-relaxed mb-8">
                  {notification.message}
                </p>

                <div className="flex justify-end">
                  <button
                    onClick={hideNotification}
                    className={`
                      px-8 py-3 rounded-xl font-semibold transition-all
                      ${notification.type === 'error' ? 'bg-red-500 hover:bg-red-600' :
                        notification.type === 'success' ? 'bg-emerald-500 hover:bg-emerald-600' :
                        'bg-white text-black hover:bg-white/90'}
                    `}
                  >
                    Got it
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {criticalError.isOpen && (
          <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={hideCriticalError}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              className="relative w-full max-w-md bg-gradient-to-b from-charcoal to-[#050505] border border-red-500/20 rounded-[2.5rem] shadow-[0_0_50px_rgba(239,68,68,0.2)] overflow-hidden"
              role="alertdialog"
              aria-modal="true"
            >
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50" />
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-500/10 rounded-full blur-[60px]" />
              
              <div className="p-10">
                <div className="flex flex-col items-center text-center">
                  <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(239,68,68,0.1)]">
                    <AlertCircle className="w-10 h-10 text-red-500" />
                  </div>
                  
                  <h3 className="text-2xl font-black text-white mb-3 tracking-tight">
                    {criticalError.title}
                  </h3>
                  
                  <p className="text-slate-400 leading-relaxed mb-8 font-medium">
                    {criticalError.message}
                  </p>
                  
                  <div className="w-full flex flex-col gap-3">
                    {criticalError.onRetry && (
                      <button
                        onClick={() => {
                          criticalError.onRetry?.();
                          hideCriticalError();
                        }}
                        className="w-full py-4 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold transition-all shadow-lg shadow-red-500/20 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        Try Again
                      </button>
                    )}
                    <button
                      onClick={hideCriticalError}
                      className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold transition-all border border-white/5"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </DevicesContext.Provider>
  );
};

export function useDevices() {
  const ctx = useContext(DevicesContext);
  if (!ctx) throw new Error('useDevices must be used within a DevicesProvider');
  return ctx;
}
