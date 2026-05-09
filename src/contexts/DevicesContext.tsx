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
import { collection, getDocs, onSnapshot, query, where, or, orderBy, limit, Timestamp, addDoc, setDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db, functions, uploadRoomPhoto, storage } from '../lib/firebase';
import { getDownloadURL, listAll, ref as sRef } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';
import type { ContactRequest, PlannerLead, SupportTicket, QuoteItem } from '../models/Collections';
import { quotesCollection } from '../models/Collections';
import type { DeviceRecommendation, RecommendationRequest, RoomVisualizationResult, DevicePlacementMarker } from '../models';
import { useServiceHistory } from '../hooks/useServiceHistory';

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
  forecast?: string; // Failure forecasting
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

// Custom Floorplan Hotspot Type
export interface CustomFloorplanHotspot {
  id: string;
  x: number;
  y: number;
  title: string;
  description: string;
  icon: string; // Icon name as string for serialization
  tags: string[];
  isAiGenerated?: boolean;
  roomType?: string;
  editable?: boolean;
  detectedFeatures?: string[];
}

// Savings Data Type
export interface SavingsData {
  annualSavings: number;
  lightingSavings: number;
  hvacSavings: number;
  standbySavings: number;
  co2Reduction: number;
  roiMonths: number;
  monthlyCurrent: number;
  monthlyOptimized: number;
}

// Personality Quiz Types
export type QuizAnswerValue = 'A' | 'B' | 'C' | 'D';

export interface QuizAnswer {
  value: QuizAnswerValue;
  label: string;
  description?: string;
}

export interface QuizQuestion {
  id: number;
  question: string;
  answers: QuizAnswer[];
}

export interface PersonalityType {
  id: string;
  name: string;
  tagline: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  recommendedCategories: string[];
  automationScenarios: string[];
  manifesto: string;
}

export interface UserProfile {
  name: string;
  avatarUrl: string | null;
  email: string | null;
  role: string;
  deviceCount: number;
}

export interface QuizResult {
  personalityType: PersonalityType;
  recommendations: DeviceRecommendation[];
}

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

// Personality Quiz Data
export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    question: 'When do you feel most productive?',
    answers: [
      { value: 'A', label: 'Early Bird', description: 'I love mornings and sunrise routines' },
      { value: 'B', label: 'Night Owl', description: 'I come alive after dark' },
      { value: 'C', label: 'Flexible', description: 'I adapt to any schedule' },
      { value: 'D', label: 'Spontaneous', description: 'No fixed pattern - I go with the flow' }
    ]
  },
  {
    id: 2,
    question: 'How do you approach technology?',
    answers: [
      { value: 'A', label: 'Gadget Lover', description: 'Latest tech excites me' },
      { value: 'B', label: 'Minimalist', description: 'Only what I truly need' },
      { value: 'C', label: 'Security First', description: 'Safety and privacy matter most' },
      { value: 'D', label: 'Comfort Seeker', description: 'Tech should make life cozy' }
    ]
  },
  {
    id: 3,
    question: 'What is your ideal weekend activity?',
    answers: [
      { value: 'A', label: 'Movie Marathon', description: 'Home theater vibes' },
      { value: 'B', label: 'Entertaining Guests', description: 'Hosting parties and gatherings' },
      { value: 'C', label: 'Quiet Relaxation', description: 'Peaceful moments at home' },
      { value: 'D', label: 'Home Projects', description: 'Improving and optimizing' }
    ]
  }
];

export const PERSONALITY_TYPES: Record<string, PersonalityType> = {
  comfort_maximizer: {
    id: 'comfort_maximizer',
    name: 'Comfort Maximizer',
    tagline: 'Your home is your sanctuary',
    description: 'You prioritize comfort and relaxation above all. Your smart home should create the perfect ambiance with automated lighting, climate control, and entertainment systems that adapt to your mood.',
    color: 'text-teal',
    bgColor: 'bg-teal-50 dark:bg-teal-900/20',
    borderColor: 'border-teal-200 dark:border-teal-800',
    recommendedCategories: ['Climate Control', 'Smart Lighting', 'Entertainment'],
    automationScenarios: [
      'Morning: Gentle wake-up with gradual lighting and preferred temperature',
      'Evening: Automatic dimming and cozy ambiance for relaxation',
      'Movie Night: One-tap theater mode with dimmed lights and optimized sound'
    ],
    manifesto: "For you, home isn't just a place; it's a living, breathing sanctuary of calm. You believe that technology should be invisible, serving only to enhance the warmth of your surroundings. Your ideal living space breathes with you, softening the edges of the world and creating a haven where every light, every sound, and every breath of air is perfectly tuned to your peace of mind."
  },
  security_guardian: {
    id: 'security_guardian',
    name: 'Security Guardian',
    tagline: 'Protection and peace of mind',
    description: 'Security is your top priority. You want comprehensive monitoring, smart locks, and automated alerts that keep your home and loved ones safe around the clock.',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50 dark:bg-cyan-900/20',
    borderColor: 'border-cyan-200 dark:border-cyan-800',
    recommendedCategories: ['Security Cameras', 'Smart Locks', 'Motion Sensors'],
    automationScenarios: [
      'Away Mode: All sensors armed with instant notifications',
      'Night Patrol: Automated camera recording and perimeter monitoring',
      'Visitor Detection: Smart doorbell with two-way audio and recording'
    ],
    manifesto: "In a world of uncertainty, your home is your fortress. You believe that true luxury is the freedom from worry. Your vision is a watchful, intelligent environment that anticipates risks before they emerge. It's not about gadgets; it's about the unbreakable promise of safety for those you love, ensuring that your sanctuary remains private, protected, and perpetually secure."
  },
  tech_enthusiast: {
    id: 'tech_enthusiast',
    name: 'Tech Enthusiast',
    tagline: 'Cutting-edge living',
    description: 'You love the latest technology and want a fully integrated smart home with voice control, automation routines, and the newest gadgets working in harmony.',
    color: 'text-teal-600',
    bgColor: 'bg-teal-50 dark:bg-teal-900/20',
    borderColor: 'border-teal-200 dark:border-teal-800',
    recommendedCategories: ['Smart Hubs', 'Voice Assistants', 'Smart Displays'],
    automationScenarios: [
      'Voice Control: Every device responds to natural voice commands',
      'Smart Routines: Complex automations based on time, weather, and presence',
      'Energy Optimization: AI-driven power management across all devices'
    ],
    manifesto: "You live on the edge of tomorrow. For you, a home is a sophisticated machine for living—a symphony of hardware and software working in perfect harmony. You see the potential in every connection and the beauty in a fully integrated life. Your vision is a home that doesn't just respond, but evolves with you, pushing the boundaries of what's possible through the power of intelligent design."
  },
  efficiency_expert: {
    id: 'efficiency_expert',
    name: 'Efficiency Expert',
    tagline: 'Maximum results, minimum effort',
    description: 'You value simplicity and efficiency. Your smart home should automate repetitive tasks, save energy, and make daily routines effortless without unnecessary complexity.',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    recommendedCategories: ['Smart Thermostats', 'Smart Plugs', 'Automated Lighting'],
    automationScenarios: [
      'Energy Saving: Automatic power-off for unused devices',
      'Smart Scheduling: Lights and climate adjust based on your calendar',
      'Quick Actions: One-tap scenes for common activities'
    ],
    manifesto: "You understand that time is your most precious resource. You believe that a home should be an engine of efficiency, eliminating the trivial and automating the mundane. Your vision is a streamlined existence where energy is never wasted and effort is always minimized. It's about a home that works for you, so you can focus on the things that truly matter in life."
  }
};

export const PERSONALITY_DEVICE_RECOMMENDATIONS: Record<string, DeviceRecommendation[]> = {
  comfort_maximizer: [
    {
      name: 'Smart Thermostat Pro',
      category: 'Climate Control',
      reason: 'Learns your preferred temperatures and adjusts automatically for maximum comfort',
      estimatedPrice: 12500
    },
    {
      name: 'Ambiance Light Strip',
      category: 'Smart Lighting',
      reason: 'Creates mood lighting that adapts to your activities and time of day',
      estimatedPrice: 4500
    },
    {
      name: 'Smart Speaker System',
      category: 'Entertainment',
      reason: 'Whole-home audio with voice control for your favorite music and podcasts',
      estimatedPrice: 8900
    },
    {
      name: 'Motorized Curtains',
      category: 'Smart Shades',
      reason: 'Wake up naturally with automated curtains that open with sunrise',
      estimatedPrice: 15000
    }
  ],
  security_guardian: [
    {
      name: '360° Security Camera',
      category: 'Security Cameras',
      reason: 'Full coverage monitoring with AI detection and night vision',
      estimatedPrice: 7500
    },
    {
      name: 'Biometric Smart Lock',
      category: 'Smart Locks',
      reason: 'Fingerprint and app-based entry with detailed access logs',
      estimatedPrice: 12000
    },
    {
      name: 'Motion Sensor Pro',
      category: 'Motion Sensors',
      reason: 'Advanced detection with instant mobile alerts and siren integration',
      estimatedPrice: 3200
    },
    {
      name: 'Video Doorbell Elite',
      category: 'Access Control',
      reason: 'HD video with two-way audio and package detection',
      estimatedPrice: 6800
    }
  ],
  tech_enthusiast: [
    {
      name: 'Smart Home Hub Ultra',
      category: 'Smart Hubs',
      reason: 'Central control for all devices with Matter and Zigbee support',
      estimatedPrice: 9500
    },
    {
      name: 'Voice Assistant Display',
      category: 'Voice Assistants',
      reason: 'Visual interface for controlling devices and viewing camera feeds',
      estimatedPrice: 5500
    },
    {
      name: 'Smart Display Panel',
      category: 'Smart Displays',
      reason: 'Wall-mounted control center for managing your entire smart home',
      estimatedPrice: 18000
    },
    {
      name: 'Universal Remote Pro',
      category: 'Automation',
      reason: 'Controls all devices including legacy IR equipment',
      estimatedPrice: 4200
    }
  ],
  efficiency_expert: [
    {
      name: 'Learning Thermostat',
      category: 'Smart Thermostats',
      reason: 'Saves up to 23% on energy bills with AI-driven climate scheduling',
      estimatedPrice: 8900
    },
    {
      name: 'Smart Plug Set (4-pack)',
      category: 'Smart Plugs',
      reason: 'Monitor and schedule power usage for any appliance',
      estimatedPrice: 2400
    },
    {
      name: 'Occupancy Sensors',
      category: 'Automated Lighting',
      reason: 'Lights turn on/off automatically based on room occupancy',
      estimatedPrice: 3600
    },
    {
      name: 'Energy Monitor',
      category: 'Power Management',
      reason: 'Real-time tracking of home energy consumption with insights',
      estimatedPrice: 5200
    }
  ]
};

// Quiz scoring function
export function calculatePersonality(answers: Record<number, QuizAnswerValue>): PersonalityType {
  const answerValues = Object.values(answers);

  const scores: Record<string, number> = {
    comfort_maximizer: 0,
    security_guardian: 0,
    tech_enthusiast: 0,
    efficiency_expert: 0
  };

  answerValues.forEach(answer => {
    switch (answer) {
      case 'A':
        scores.comfort_maximizer += 1;
        scores.tech_enthusiast += 1;
        break;
      case 'B':
        scores.efficiency_expert += 1;
        scores.comfort_maximizer += 1;
        break;
      case 'C':
        scores.security_guardian += 2;
        scores.efficiency_expert += 1;
        break;
      case 'D':
        scores.comfort_maximizer += 1;
        scores.tech_enthusiast += 1;
        scores.efficiency_expert += 1;
        break;
    }
  });

  let maxScore = -1;
  let winner = 'comfort_maximizer';

  Object.entries(scores).forEach(([type, score]) => {
    if (score > maxScore) {
      maxScore = score;
      winner = type;
    }
  });

  return PERSONALITY_TYPES[winner];
}

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
  filterCriteria: { dateRange: string; itemType: string; startDate: Date | null; endDate: Date | null };
  setFilterCriteria: (criteria: { dateRange: string; itemType: string; startDate: Date | null; endDate: Date | null }) => void;
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
  // User-added devices
  addedDevices: DevicePlacementMarker[];
  addDevice: (device: DevicePlacementMarker) => void;
  removeDevice: (deviceId: string) => void;
  updateDevicePosition: (deviceName: string, x: number, y: number) => void;
  analyzeSingleDevice: (deviceName: string) => Promise<DevicePlacementMarker | null>;
  // Live Consultation
  activeConsultationId: string | null;
  consultationLoading: boolean;
  startLiveConsultation: () => Promise<string>;
  // Planning Leads for current user
  userPlannerLeads: PlannerLead[];
  currentUser: User | null;
  userProfile: UserProfile | null;
  profileLoading: boolean;
  loginWithGoogle: () => Promise<User>;
  // Global Notification
  notification: NotificationState;
  showNotification: (params: { message: React.ReactNode; type?: NotificationType; mode?: NotificationMode; title?: string }) => void;
  hideNotification: () => void;
  // Critical Error Modal
  criticalError: CriticalErrorState;
  showCriticalError: (params: { title: string; message: string; onRetry?: () => void }) => void;
  hideCriticalError: () => void;
  // Personality Quiz
  quizQuestions: QuizQuestion[];
  personalityTypes: Record<string, PersonalityType>;
  personalityDeviceRecommendations: Record<string, DeviceRecommendation[]>;
  calculatePersonality: (answers: Record<number, QuizAnswerValue>) => PersonalityType;
  // Custom Floorplan
  customFloorplanImage: string | null;
  customFloorplanHotspots: CustomFloorplanHotspot[];
  isAnalyzingFloorplan: boolean;
  floorplanAnalysisError: string | null;
  setCustomFloorplanImage: (image: string | null) => void;
  setCustomFloorplanHotspots: (hotspots: CustomFloorplanHotspot[]) => void;
  addCustomFloorplanHotspot: (hotspot: CustomFloorplanHotspot) => void;
  updateCustomFloorplanHotspot: (id: string, updates: Partial<CustomFloorplanHotspot>) => void;
  deleteCustomFloorplanHotspot: (id: string) => void;
  clearCustomFloorplan: () => void;
  analyzeFloorplanWithAI: (imageBase64: string) => Promise<void>;
  generateRoomDetailsWithAI: (roomTitle: string) => Promise<{ description: string; tags: string[] }>;
  // Energy Savings
  savingsData: SavingsData | null;
  calculateSavings: (monthlyBill: number, homeSize: number, applianceCount: number) => void;
  // Service History
  serviceHistory: any[];
  serviceHistoryLoading: boolean;
  serviceHasMore: boolean;
  loadMoreServiceHistory: () => void;
  serviceFilters: { startDate: Date | null; endDate: Date | null };
  setServiceFilters: (filters: { startDate: Date | null; endDate: Date | null }) => void;
  fetchServiceHistory: (options?: any) => void; // Keeping for compatibility
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

const snackbarVariants = {
  hidden: { opacity: 0, y: -20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: [0, 0, 0.2, 1] as const } },
  exit: { opacity: 0, y: -20, scale: 0.95, transition: { duration: 0.2 } }
};

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
        variants={snackbarVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed top-6 right-6 z-[10005] w-full max-w-sm pointer-events-none"
        role="alert"
        aria-live="polite"
      >
        <div className={`
          backdrop-blur-2xl border p-4 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.1)] flex items-start gap-4 pointer-events-auto
          ${type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-900 dark:text-red-100' :
            type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-900 dark:text-emerald-100' :
              type === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-900 dark:text-amber-100' :
                'bg-teal-500/10 border-teal-500/20 text-teal-900 dark:text-teal-100'}
        `}>
          <div className="mt-0.5 shrink-0">
            {type === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
            {type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
            {type === 'info' && <Info className="w-5 h-5 text-teal-500" />}
            {type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold leading-relaxed">{message}</p>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 opacity-40 hover:opacity-100 transition-opacity p-1 -mr-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
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
  const [role, setRole] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const storedRole = localStorage.getItem('userRole');
      return storedRole || null;
    }
    return null;
  });
  const isAdmin = useMemo(() => {
    if (!role) return false;
    const r = role.toLowerCase();
    return r === 'admin' || r === 'super admin';
  }, [role]);
  const [devices, setDevices] = useState<DeviceDoc[]>([]);
  const [planLeads, setPlanLeads] = useState<PlannerLead[]>([]);
  const [contactSubmissions, setContactSubmissions] = useState<ContactRequest[]>([]);
  const [reports, setReports] = useState<SupportTicket[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCriteria, setFilterCriteria] = useState({ 
    dateRange: 'all', 
    itemType: 'all',
    startDate: null as Date | null,
    endDate: null as Date | null
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [adminLoading, setAdminLoading] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const userRole = localStorage.getItem('userRole');
      const roleNorm = (userRole || '').toLowerCase().replace(/[_-]+/g, ' ').trim();
      return roleNorm === 'admin' || roleNorm === 'super admin';
    }
    return true;
  });
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

  // ── User-Added Devices State ──────────────────────────────────────────────
  const [addedDevices, setAddedDevices] = useState<DevicePlacementMarker[]>([]);

  // ── Custom Floorplan State ───────────────────────────────────────────────
  const [customFloorplanImage, setCustomFloorplanImage] = useState<string | null>(null);
  const [customFloorplanHotspots, setCustomFloorplanHotspots] = useState<CustomFloorplanHotspot[]>([]);
  const [isAnalyzingFloorplan, setIsAnalyzingFloorplan] = useState<boolean>(false);
  const [floorplanAnalysisError, setFloorplanAnalysisError] = useState<string | null>(null);

  // Update device position after drag
  const updateDevicePosition = useCallback((deviceName: string, x: number, y: number) => {
    setAddedDevices(prev => prev.map(device =>
      device.deviceName === deviceName
        ? { ...device, x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }
        : device
    ));
  }, []);

  // ── Live Consultation State ─────────────────────────────────────────────
  const [activeConsultationId, setActiveConsultationId] = useState<string | null>(null);
  const [consultationLoading, setConsultationLoading] = useState<boolean>(false);

  // ── User Planning Leads State ───────────────────────────────────────────
  const [adminAccepted, setAdminAccepted] = useState<boolean>(false);
  const [userPlannerLeads, setUserPlannerLeads] = useState<PlannerLead[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(true);

  // ── Service History Logic ───────────────────────────────────────────────
  const [serviceLimit, setServiceLimit] = useState(20);
  const [serviceFilters, setServiceFilters] = useState<{ startDate: Date | null; endDate: Date | null }>({
    startDate: null,
    endDate: null
  });

  const { 
    events: serviceHistory, 
    loading: serviceHistoryLoading, 
    hasMore: serviceHasMore 
  } = useServiceHistory({
    uid: role === 'admin' ? undefined : (uid || undefined),
    userEmail: role === 'admin' ? undefined : (currentUser?.email || undefined),
    limitCount: serviceLimit,
    startDate: serviceFilters.startDate,
    endDate: serviceFilters.endDate
  });

  const loadMoreServiceHistory = useCallback(() => {
    setServiceLimit(prev => prev + 20);
  }, []);

  // For backward compatibility with components calling fetchServiceHistory directly
  const fetchServiceHistory = useCallback(() => {
    setServiceLimit(20);
  }, []);


  // ── Energy Savings State ────────────────────────────────────────────────
  const [savingsData, setSavingsData] = useState<SavingsData | null>(null);

  const calculateSavings = useCallback((monthlyBill: number, homeSize: number, applianceCount: number) => {
    // Basic validation
    if (monthlyBill <= 0 || homeSize <= 0) return;

    const annualBill = monthlyBill * 12;

    // Efficiency factors (based on Smile Smart device specs)
    const lightingEfficiency = 0.62;
    const hvacEfficiency = 0.25;
    const applianceEfficiency = 0.18;

    // Dynamic Distribution based on home profile
    // Larger homes have more HVAC/Lighting percentage
    const hvacShare = 0.35 + (Math.min(homeSize, 10000) / 10000) * 0.15; // 35% to 50%
    const lightingShare = 0.15 + (Math.min(homeSize, 5000) / 5000) * 0.05; // 15% to 20%
    const standbyShare = 0.05 + (Math.min(applianceCount, 50) / 50) * 0.10; // 5% to 15%

    const lightingSavings = Math.round(annualBill * lightingShare * lightingEfficiency);
    const hvacSavings = Math.round(annualBill * hvacShare * hvacEfficiency);
    const standbySavings = Math.round(annualBill * standbyShare * applianceEfficiency);

    const totalAnnualSavings = lightingSavings + hvacSavings + standbySavings;

    // CO2 reduction: ~0.85kg CO2 per kWh. Assuming avg cost per kWh is ₹7
    const kwhSavedAnnual = totalAnnualSavings / 7;
    const co2Reduction = Math.round(kwhSavedAnnual * 0.85);

    // Dynamic ROI: More appliances = higher initial cost but potentially better efficiency
    // Est cost: ₹15,000 base + ₹1,500 per device
    const estimatedCost = 15000 + (applianceCount * 1500);
    const roiMonths = Math.max(6, Math.round((estimatedCost / (totalAnnualSavings / 12))));

    setSavingsData({
      annualSavings: totalAnnualSavings,
      lightingSavings,
      hvacSavings,
      standbySavings,
      co2Reduction,
      roiMonths,
      monthlyCurrent: monthlyBill,
      monthlyOptimized: Math.round(monthlyBill - (totalAnnualSavings / 12))
    });
  }, []);

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
    setAddedDevices([]);
  }, []);

  const addDevice = useCallback((device: DevicePlacementMarker) => {
    setAddedDevices(prev => [...prev, device]);
  }, []);

  const removeDevice = useCallback((deviceId: string) => {
    setAddedDevices(prev => prev.filter(d => d.deviceName !== deviceId));
  }, []);

  const analyzeSingleDevice = useCallback(async (deviceName: string): Promise<DevicePlacementMarker | null> => {
    if (!roomPhotoUrl) {
      showNotification({ message: 'Please upload and analyze a room photo first.', type: 'warning' });
      return null;
    }
    if (!uid) {
      showNotification({ message: 'Please sign in to use AI placement.', type: 'warning' });
      return null;
    }
    if (!window.navigator.onLine) {
      showNotification({ message: 'No internet connection.', type: 'error' });
      return null;
    }

    setVisualizationLoading(true);
    try {
      const currentUid = uid || auth.currentUser?.uid;
      const analyzeFn = httpsCallable<any, RoomVisualizationResult>(functions, 'analyzeRoomWithAI');
      const result = await analyzeFn({ imageUrl: roomPhotoUrl, deviceNames: [deviceName], uid: currentUid });
      const data = result.data;

      if (data.markers && data.markers.length > 0) {
        // Return the first (and only) marker
        return data.markers[0];
      }
      return null;
    } catch (err: any) {
      console.error('AI Single Device Analysis Failed:', err);
      const msg = getFriendlyErrorMessage(err);
      showNotification({ message: msg, type: 'error' });
      return null;
    } finally {
      setVisualizationLoading(false);
    }
  }, [roomPhotoUrl, uid]);

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

  // Handle ESC key to close popups
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (notification.isOpen) hideNotification();
        if (criticalError.isOpen) hideCriticalError();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [notification.isOpen, criticalError.isOpen, hideNotification, hideCriticalError]);

  // Focus trap for blocking modals
  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (notification.isOpen && notification.mode === 'modal') {
      const focusableElements = modalRef.current?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusableElements && focusableElements.length > 0) {
        (focusableElements[0] as HTMLElement).focus();
      }
    }
  }, [notification.isOpen, notification.mode]);


  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUser(u);
      setUid(u?.uid ?? null);
      if (!u) setRole(null);
    });
    return () => unsub();
  }, []);


  // -- User Data Sync (Role & Profile) --
  useEffect(() => {
    if (!uid) {
      setRole(null);
      setUserProfile(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);

    const unsub = onSnapshot(doc(db, 'Accounts', uid), async (snap) => {
      try {
        const user = auth.currentUser;
        let name = user?.displayName || localStorage.getItem('userName') || 'User';
        let avatarUrl = user?.photoURL || null;
        let resolvedRole = 'User';
        const email = user?.email || localStorage.getItem('userEmail') || null;

        if (snap.exists()) {
          const data = snap.data();
          resolvedRole = data.Role || 'User';
          if (data.name) name = data.name;
          if (data.profilePic && typeof data.profilePic === 'string' && data.profilePic.startsWith('http')) {
            avatarUrl = data.profilePic;
          }
        }

        setRole(resolvedRole);

        // 2) Resolve Avatar from Storage if not in Firestore/Auth
        if (!avatarUrl && user) {
          try {
            const folderRef = sRef(storage, `profile/${user.uid}`);
            const listing = await listAll(folderRef);
            if (listing.items.length > 0) {
              const sorted = listing.items.sort((a, b) => a.name.localeCompare(b.name));
              avatarUrl = await getDownloadURL(sorted[sorted.length - 1]);
            }
          } catch (e) {
            console.debug('[DevicesContext] Storage avatar fallback omitted:', e);
          }
        }

        setUserProfile({
          name,
          avatarUrl,
          email,
          role: resolvedRole,
          deviceCount: devices.length // Still present in the object, but updated reactively
        });
      } catch (err) {
        console.error('[DevicesContext] Sync error:', err);
      } finally {
        setProfileLoading(false);
      }
    }, (err) => {
      console.warn('[DevicesContext] Account sync failed:', err);
      setRole('User');
      setProfileLoading(false);
    });

    return () => unsub();
  }, [uid, devices.length]); // Decoupled from 'role' to prevent loops

  useEffect(() => {
    let unsubs: (() => void)[] = [];

    if (uid && isAdmin) {
      // Avoid flickering if already loaded
      if (planLeads.length === 0 && contactSubmissions.length === 0) {
        setAdminLoading(true);
      }
      
      try {
        const u1 = onSnapshot(collection(db, 'Planner_Leads'), snap => {
          setPlanLeads(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as PlannerLead)));
          setAdminLoading(false);
        }, (err) => {
          console.debug('Planner_Leads collection snapshot failed:', err);
          setAdminLoading(false);
        });
        
        const u2 = onSnapshot(collection(db, 'contactRequests'), snap => {
          setContactSubmissions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as ContactRequest)));
          setAdminLoading(false);
        }, (err) => {
          console.debug('contactRequests collection snapshot failed:', err);
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
          console.debug('Support_Tickets collection snapshot failed:', err);
          setAdminLoading(false);
        });
        
        unsubs = [u1, u2, u3];
      } catch (e) {
        console.error('Failed to initialize admin listeners:', e);
        setAdminLoading(false);
      }
    } else {
      if (!uid) {
        setPlanLeads([]);
        setContactSubmissions([]);
        setReports([]);
      }
      // If we're not an admin or still resolving role, only stop loading if we actually have no UID
      if (!uid || (role && !isAdmin)) {
        setAdminLoading(false);
      }
    }
    return () => unsubs.forEach(u => u());
  }, [uid, role, isAdmin]);

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

  const passesDate = (timestamp: any, criteria: typeof filterCriteria) => {
    if (criteria.dateRange === 'all') return true;
    if (!timestamp) return false;
    
    const date = timestamp.toDate ? timestamp.toDate() : 
                 (typeof timestamp === 'number' ? new Date(timestamp * 1000) : new Date(timestamp));
                 
    if (criteria.dateRange === 'custom') {
      if (criteria.startDate) {
        const start = new Date(criteria.startDate);
        start.setHours(0, 0, 0, 0);
        if (date < start) return false;
      }
      if (criteria.endDate) {
        const end = new Date(criteria.endDate);
        end.setHours(23, 59, 59, 999);
        if (date > end) return false;
      }
      return true;
    }

    const now = new Date();
    if (criteria.dateRange === 'today') return date.toDateString() === now.toDateString();
    if (criteria.dateRange === 'week') return (now.getTime() - date.getTime()) < 7 * 24 * 60 * 60 * 1000;
    if (criteria.dateRange === 'month') return (now.getTime() - date.getTime()) < 30 * 24 * 60 * 60 * 1000;
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
      list = list.filter(p => passesDate(p.updatedAt || p.createdAt, filterCriteria));
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
      list = list.filter(c => passesDate(c.createdAt, filterCriteria));
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
      list = list.filter(r => passesDate(r.createdAt, filterCriteria));
    }
    if (filterCriteria.itemType === 'floorplan') {
      list = list.filter(r => isFloorplanItem(r));
    } else if (filterCriteria.itemType === 'standard') {
      list = list.filter(r => !isFloorplanItem(r));
    }
    return list;
  }, [reports, searchQuery, filterCriteria, isFloorplanItem]);

  const deviceMetadataCache = useRef<Map<string, any>>(new Map());

  const fetchDevices = useCallback(async () => {
    // This is now handled by the real-time listener in useEffect
    // but kept as a manual refresh trigger if needed.
    if (!uid) {
      setDevices([]);
      return;
    }
  }, [uid]);

  // Real-time Telemetry Listener
  useEffect(() => {
    if (!uid) {
      setDevices([]);
      return;
    }

    setLoading(true);
    const userDevicesRef = collection(db, 'User_Devices');
    const qy = query(userDevicesRef, where('uid', '==', uid));

    const unsubscribe = onSnapshot(qy, async (snapshot) => {
      try {
        if (snapshot.empty) {
          setDevices(MOCK_DEVICES);
          setLoading(false);
          return;
        }

        const userDevicesData = snapshot.docs.map(doc => ({
          docId: doc.id,
          ...doc.data()
        } as any));

        // Get unique source device IDs that are not in cache
        const sourceIdsToFetch = Array.from(new Set(
          userDevicesData.map(d => d.sourceDeviceId).filter(id => id && !deviceMetadataCache.current.has(id))
        ));

        // Fetch missing metadata
        if (sourceIdsToFetch.length > 0) {
          const devicesRef = collection(db, 'Devices');
          const batches: string[][] = [];
          for (let i = 0; i < sourceIdsToFetch.length; i += 10) {
            batches.push(sourceIdsToFetch.slice(i, i + 10));
          }

          for (const ids of batches) {
            const q = query(devicesRef, where('__name__', 'in', ids));
            const snap = await getDocs(q);
            snap.docs.forEach(d => {
              deviceMetadataCache.current.set(d.id, d.data());
            });
          }
        }

        // Merge telemetry with metadata
        const results = userDevicesData.map(ud => {
          const metadata = deviceMetadataCache.current.get(ud.sourceDeviceId) || {};
          
          // Enhanced health calculation (client-side matching backend logic)
          const battery = ud.batteryLevel ?? 100;
          const rssi = ud.signalStrength ?? -50;
          const uptime = ud.uptime24h ?? 1;
          
          const rssiScore = Math.max(0, Math.min(100, ((rssi + 95) / 65) * 100));
          const score = Math.round((battery * 0.3) + (rssiScore * 0.4) + (uptime * 100 * 0.3));
          
          // Generate predictive maintenance forecast
          let forecast = 'Stable';
          if (battery < 10) forecast = 'Battery Failure Imminent';
          else if (rssi < -85) forecast = 'Signal Loss Forecasted';
          else if (uptime < 0.6) forecast = 'System Instability Detected';

          return {
            id: ud.docId,
            deviceName: metadata.deviceName || metadata.name || ud.deviceName || 'Smart Device',
            name: metadata.name,
            type: metadata.type,
            status: rssi < -90 ? 'Offline' : 'Online',
            serial: ud.serial || metadata.serial || 'N/A',
            modelNumber: metadata.modelNumber,
            imageUrl: metadata.imageUrl,
            price: metadata.price,
            stock: metadata.stock,
            warranty: getUserWarranty(ud) || metadata.warranty || null,
            brand: metadata.brand,
            description: metadata.description,
            health: {
              score,
              status: rssi < -90 ? 'Offline' : 'Online',
              lastSeen: ud.lastSeen?.toDate?.().toISOString() || ud.lastSeen || new Date().toISOString(),
              batteryLevel: battery,
              signalStrength: rssi,
              alerts: ud.health?.alerts || [],
              forecast
            }
          };
        });

        setDevices(results as any);
        setError(null);
      } catch (err: any) {
        console.error('[DevicesContext] Stream error:', err);
        setError('Failed to stream telemetry updates.');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [uid]);

  const fetchScenes = useCallback(async () => {
    console.log('[fetchScenes] Called with uid:', uid, 'auth.currentUser:', auth.currentUser?.uid);
    if (!uid) {
      console.log('[fetchScenes] No uid, returning early with empty scenes');
      setScenes([]);
      return;
    }
    setSceneLoading(true);
    try {
      const getScenesFn = httpsCallable<any, { scenes: any[] }>(functions, 'getUserScenes');
      const res = await getScenesFn();
      const userScenes = res.data.scenes || [];
      console.log('[fetchScenes] Success, got', userScenes.length, 'scenes');
      setScenes(userScenes);
    } catch (err: any) {
      console.error('[fetchScenes] Error:', err);
      console.error('[fetchScenes] Error code:', err.code, 'message:', err.message);
      showNotification({
        message: 'Failed to load scenes. Please try refreshing.',
        type: 'error'
      });
      setScenes([]);
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
    console.log('[deleteScene] Called with sceneId:', sceneId, 'uid:', uid);
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
      console.log('[deleteScene] Calling deleteUserScene function...');
      await deleteFn({ sceneId });
      console.log('[deleteScene] Delete successful, refreshing scenes...');
      await fetchScenes();
      showNotification({ message: 'Scene deleted.', type: 'success' });
    } catch (err: any) {
      console.error('[deleteScene] Error:', err);
      console.error('[deleteScene] Error code:', err.code, 'message:', err.message);
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
      // fetchDevices is now handled by the real-time telemetry listener useEffect
      fetchScenes();
    }
  }, [uid, fetchScenes]);

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

  // ── Custom Floorplan Functions ────────────────────────────────────────────
  const addCustomFloorplanHotspot = useCallback((hotspot: CustomFloorplanHotspot) => {
    setCustomFloorplanHotspots(prev => [...prev, hotspot]);
  }, []);

  const updateCustomFloorplanHotspot = useCallback((id: string, updates: Partial<CustomFloorplanHotspot>) => {
    setCustomFloorplanHotspots(prev => prev.map(h =>
      h.id === id ? { ...h, ...updates } : h
    ));
  }, []);

  const deleteCustomFloorplanHotspot = useCallback((id: string) => {
    setCustomFloorplanHotspots(prev => prev.filter(h => h.id !== id));
  }, []);

  const clearCustomFloorplan = useCallback(() => {
    setCustomFloorplanImage(null);
    setCustomFloorplanHotspots([]);
    setFloorplanAnalysisError(null);
  }, []);

  // Client-side AI analysis for floorplan (direct API call)
  const analyzeFloorplanWithAI = useCallback(async (imageBase64: string) => {
    setIsAnalyzingFloorplan(true);
    setFloorplanAnalysisError(null);

    try {
      // Check for OpenAI API key from environment
      const OPENAI_API_KEY = (import.meta as any).env?.PUBLIC_OPENAI_API_KEY as string | undefined;

      // DEMO MODE: Generate mock hotspots if no API key
      if (!OPENAI_API_KEY) {
        console.log('[DevicesContext] DEMO MODE - Generating mock hotspots');

        const mockHotspots: CustomFloorplanHotspot[] = [
          {
            id: `demo-living-${Date.now()}`,
            x: 30,
            y: 40,
            title: 'Living Room',
            description: 'Smart TV integration with voice-controlled lighting and automated blinds. Perfect for movie nights with ambient RGB lighting.',
            icon: 'Tv',
            tags: ['Smart TV', 'Ambient Lighting', 'Voice Control'],
            roomType: 'living',
            isAiGenerated: true,
            editable: true
          },
          {
            id: `demo-bedroom-${Date.now()}`,
            x: 70,
            y: 25,
            title: 'Master Bedroom',
            description: 'Sunrise simulation with smart bedside lamps and automated curtains. Sleep mode dims all lights and locks doors at bedtime.',
            icon: 'Moon',
            tags: ['Sunrise Alarm', 'Sleep Mode', 'Smart Curtains'],
            roomType: 'bedroom',
            isAiGenerated: true,
            editable: true
          },
          {
            id: `demo-kitchen-${Date.now()}`,
            x: 25,
            y: 75,
            title: 'Kitchen',
            description: 'Smart appliances with voice-controlled lighting and safety alerts. Automated coffee maker starts brewing when you wake up.',
            icon: 'UtensilsCrossed',
            tags: ['Smart Appliances', 'Safety Alerts', 'Voice Control'],
            roomType: 'kitchen',
            isAiGenerated: true,
            editable: true
          },
          {
            id: `demo-bathroom-${Date.now()}`,
            x: 60,
            y: 70,
            title: 'Bathroom',
            description: 'Leak detection sensors and smart mirror with weather display. Automated exhaust fan activates based on humidity.',
            icon: 'Droplets',
            tags: ['Leak Detection', 'Smart Mirror', 'Auto Ventilation'],
            roomType: 'bathroom',
            isAiGenerated: true,
            editable: true
          }
        ];

        setCustomFloorplanHotspots(mockHotspots);
        showNotification({
          message: `Demo mode: Added ${mockHotspots.length} sample hotspots. Drag them to match your floorplan!`,
          type: 'success'
        });
        return;
      }

      // REAL AI ANALYSIS via OpenAI API (client-side direct call)
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `You are a smart home consultant. Analyze floorplan images and identify rooms with smart device suggestions. Return ONLY valid JSON:
{
  "hotspots": [
    {
      "id": "unique-id",
      "x": 50,
      "y": 30,
      "title": "Room Name",
      "description": "Smart home description",
      "icon": "Tv",
      "tags": ["Tag1"],
      "roomType": "living"
    }
  ],
  "detectedRooms": ["living room"],
  "detectedFeatures": ["door"],
  "confidence": 0.92
}
Coordinates x and y must be 0-100. Available icons: Tv, Moon, UtensilsCrossed, Droplets, Car, Lock, Sun, ShieldCheck.`
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Analyze this floorplan and suggest smart home device placements. Return valid JSON only.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
                  }
                }
              ]
            }
          ],
          max_tokens: 2000,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        throw new Error(`AI analysis failed: ${response.status}`);
      }

      const aiResponse = await response.json();
      const content = aiResponse.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No analysis content received');
      }

      // Parse JSON from AI response
      let parsedResult;
      try {
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[1] : content;
        parsedResult = JSON.parse(jsonString);
      } catch (parseError) {
        console.error('[DevicesContext] JSON parse error:', parseError);
        throw new Error('Failed to parse AI analysis');
      }

      // Map AI hotspots to CustomFloorplanHotspot format
      const mappedHotspots: CustomFloorplanHotspot[] = (parsedResult.hotspots || []).map((h: any, index: number) => ({
        id: h.id || `ai-${Date.now()}-${index}`,
        x: Math.max(0, Math.min(100, h.x || 50)),
        y: Math.max(0, Math.min(100, h.y || 50)),
        title: h.title || 'Room',
        description: h.description || 'Smart home automation area',
        icon: h.icon || 'Zap',
        tags: h.tags || ['Smart Home'],
        roomType: h.roomType || 'room',
        isAiGenerated: true,
        editable: true,
        detectedFeatures: parsedResult.detectedFeatures || []
      }));

      setCustomFloorplanHotspots(mappedHotspots);
      showNotification({
        message: `AI analysis complete! Found ${parsedResult.detectedRooms?.length || 0} rooms with ${mappedHotspots.length} hotspots.`,
        type: 'success'
      });

    } catch (err: any) {
      console.error('[DevicesContext] Floorplan analysis error:', err);
      setFloorplanAnalysisError(err?.message || 'Analysis failed');
      showNotification({
        message: err?.message || 'Failed to analyze floorplan',
        type: 'error'
      });
    } finally {
      setIsAnalyzingFloorplan(false);
    }
  }, [showNotification]);

  const generateRoomDetailsWithAI = useCallback(async (roomTitle: string) => {
    try {
      const OPENAI_API_KEY = (import.meta as any).env?.PUBLIC_OPENAI_API_KEY as string | undefined;

      if (!OPENAI_API_KEY) {
        return {
          description: `A premium smart home automation setup for your ${roomTitle}, featuring intelligent lighting and integrated comfort controls.`,
          tags: ['Smart Lighting', 'Climate Control', 'Voice Assistant']
        };
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are a professional smart home consultant. Generate automation details for a specific room. Return ONLY a JSON object: {"description": "concise description < 150 chars", "tags": ["Device 1", "Device 2", "Device 3"]}. Focus on comfort, security, and convenience.'
            },
            {
              role: 'user',
              content: `Generate smart home automation details for a "${roomTitle}".`
            }
          ],
          response_format: { type: "json_object" },
          max_tokens: 200,
          temperature: 0.7
        })
      });

      if (!response.ok) throw new Error('AI generation failed');

      const aiResponse = await response.json();
      const content = JSON.parse(aiResponse.choices?.[0]?.message?.content);

      return {
        description: content.description || `Premium automation for your ${roomTitle}.`,
        tags: content.tags || ['Smart Home', 'Automation']
      };
    } catch (err) {
      console.error('[DevicesContext] Room details generation error:', err);
      return {
        description: `Professional smart home automation features for your ${roomTitle}.`,
        tags: ['Smart Lighting', 'Voice Control']
      };
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
    addedDevices,
    addDevice,
    removeDevice,
    updateDevicePosition,
    analyzeSingleDevice,
    activeConsultationId,
    consultationLoading,
    startLiveConsultation,
    userPlannerLeads,
    currentUser,
    userProfile,
    profileLoading,
    loginWithGoogle,
    notification,
    showNotification,
    hideNotification,
    criticalError,
    showCriticalError,
    hideCriticalError,
    // Personality Quiz
    quizQuestions: QUIZ_QUESTIONS,
    personalityTypes: PERSONALITY_TYPES,
    personalityDeviceRecommendations: PERSONALITY_DEVICE_RECOMMENDATIONS,
    calculatePersonality,
    // Custom Floorplan
    customFloorplanImage,
    customFloorplanHotspots,
    isAnalyzingFloorplan,
    floorplanAnalysisError,
    setCustomFloorplanImage,
    setCustomFloorplanHotspots,
    addCustomFloorplanHotspot,
    updateCustomFloorplanHotspot,
    deleteCustomFloorplanHotspot,
    clearCustomFloorplan,
    analyzeFloorplanWithAI,
    generateRoomDetailsWithAI,
    // Energy Savings
    savingsData,
    calculateSavings,
    // Service History
    serviceHistory,
    serviceHistoryLoading,
    serviceHasMore,
    loadMoreServiceHistory,
    serviceFilters,
    setServiceFilters,
    fetchServiceHistory
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
    criticalError, showCriticalError, hideCriticalError,
    // Custom Floorplan dependencies
    customFloorplanImage, customFloorplanHotspots, isAnalyzingFloorplan, floorplanAnalysisError,
    setCustomFloorplanImage, setCustomFloorplanHotspots, addCustomFloorplanHotspot,
    updateCustomFloorplanHotspot, deleteCustomFloorplanHotspot, clearCustomFloorplan,
    analyzeFloorplanWithAI,
    // Energy Savings deps
    savingsData, calculateSavings,
    // Service History deps
    serviceHistory, serviceHistoryLoading, serviceHasMore, loadMoreServiceHistory, serviceFilters, setServiceFilters, fetchServiceHistory,
    // Profile deps
    userProfile, profileLoading
  ]);

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
