import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Tv, Flame, Lock, Sun, Car,
  ShieldCheck, Monitor, Users, Server, Briefcase,
  Moon, UtensilsCrossed, Droplets, DoorOpen,
  Home, Building2, Building, X, ArrowRight, Zap, CheckCircle, Loader2, MessageSquare,
  Upload, ImagePlus, GripVertical, Plus, Trash2, Sparkles, Pencil
} from 'lucide-react';
import { submitSpaceRequest, useQuoteRequest, type SpaceRequestPayload } from '../../hooks/useQuoteRequest';

type LocalSpaceType = 'home' | 'office' | 'apartment';
import { useDevices, type CustomFloorplanHotspot } from '../../contexts/DevicesContext';
import { hotspotReveal } from '../../lib/animate';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Hotspot {
  id: string;
  x: number;
  y: number;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tags: string[];
}

interface CustomHotspot extends Hotspot {
  isAiGenerated?: boolean;
  roomType?: string;
  editable?: boolean;
  detectedFeatures?: string[];
}

interface SpaceConfig {
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
  hotspots: Hotspot[];
  svgRooms: { label: string; x: number; y: number }[];
  svgWalls: { x1: number; y1: number; x2: number; y2: number }[];
  svgDoors: { x: number; y: number; w: number; h: number }[];
}

interface ModalState {
  open: boolean;
  submitting: boolean;
  success: boolean;
  email: string;
  phone: string;
}

// ─── Space Config Data ─────────────────────────────────────────────────────────
const SPACES: Record<LocalSpaceType, SpaceConfig> = {
  home: {
    label: 'Home',
    sublabel: 'Residential Installation',
    icon: Home,
    svgWalls: [
      { x1: 300, y1: 50, x2: 300, y2: 400 },
      { x1: 50, y1: 300, x2: 300, y2: 300 },
      { x1: 300, y1: 200, x2: 750, y2: 200 },
      { x1: 550, y1: 200, x2: 550, y2: 550 },
      { x1: 300, y1: 400, x2: 550, y2: 400 },
    ],
    svgDoors: [
      { x: 350, y: 540, w: 100, h: 20 },
      { x: 290, y: 100, w: 20, h: 80 },
      { x: 150, y: 290, w: 80, h: 20 },
      { x: 400, y: 190, w: 80, h: 20 },
    ],
    svgRooms: [
      { label: 'BEDROOM', x: 175, y: 185 },
      { label: 'GARAGE', x: 175, y: 435 },
      { label: 'LIVING', x: 420, y: 315 },
      { label: 'KITCHEN', x: 525, y: 135 },
    ],
    hotspots: [
      {
        id: 'living', x: 45, y: 70,
        title: 'Living Room Oasis',
        description: 'At 8 PM, the smart blinds close, ambient RGB strips sync to your TV, and the thermostat adjusts to 22°C automatically. Say "Movie Mode" to instantly dim the lights and power on your home theater.',
        icon: Tv,
        tags: ['Movie Mode', 'Smart Blinds', 'RGB Lighting'],
      },
      {
        id: 'kitchen', x: 65, y: 25,
        title: 'Culinary Masterpiece',
        description: 'Smart smoke detectors and automated appliance plugs ensure maximum safety. Voice-controlled under-cabinet lighting assists your cooking without ever touching a switch with messy hands.',
        icon: Flame,
        tags: ['Voice Control', 'Safety Alerts', 'Auto Lighting'],
      },
      {
        id: 'door', x: 50, y: 90,
        title: 'Secure Entryway',
        description: 'A high-definition video doorbell and smart deadbolt let you see and admit guests remotely. Grant temporary access codes and monitor your front door from anywhere in the world.',
        icon: Lock,
        tags: ['Video Doorbell', 'Remote Access', 'Guest Codes'],
      },
      {
        id: 'bedroom', x: 25, y: 30,
        title: 'Sunrise Bedroom',
        description: 'Wake up naturally without jarring alarms. Smart bedside lamps gently fade on to simulate a sunrise while your smart coffee maker begins brewing downstairs — all before you open your eyes.',
        icon: Sun,
        tags: ['Sunrise Alarm', 'Morning Routine', 'Smart Security'],
      },
      {
        id: 'garage', x: 23, y: 75,
        title: 'Automated Garage',
        description: 'Never wonder if you left the garage door open again. Receive instant geofencing alerts when you drive away and let the door close automatically as you pull out of the driveway.',
        icon: Car,
        tags: ['Geofencing', 'Auto Close', 'Remote Monitor'],
      },
    ],
  },

  office: {
    label: 'Office',
    sublabel: 'Commercial / Workspace',
    icon: Building2,
    svgWalls: [
      { x1: 300, y1: 50, x2: 300, y2: 550 },
      { x1: 50, y1: 250, x2: 300, y2: 250 },
      { x1: 300, y1: 300, x2: 750, y2: 300 },
      { x1: 550, y1: 50, x2: 550, y2: 300 },
      { x1: 300, y1: 420, x2: 750, y2: 420 },
    ],
    svgDoors: [
      { x: 360, y: 540, w: 90, h: 20 },
      { x: 290, y: 130, w: 20, h: 80 },
      { x: 510, y: 290, w: 80, h: 20 },
      { x: 390, y: 290, w: 80, h: 20 },
    ],
    svgRooms: [
      { label: 'SERVER', x: 175, y: 145 },
      { label: 'WORKSPACE', x: 175, y: 420 },
      { label: 'CONF.', x: 650, y: 175 },
      { label: 'EXEC.', x: 640, y: 480 },
      { label: 'RECEPTION', x: 530, y: 365 },
    ],
    hotspots: [
      {
        id: 'reception', x: 50, y: 85,
        title: 'Reception & Lobby',
        description: 'Smart access control greets employees and visitors automatically. A digital welcome display syncs with your calendar and ambient lighting transitions from energizing morning tones to focused afternoon hues.',
        icon: ShieldCheck,
        tags: ['Smart Access', 'Visitor Log', 'Welcome Lighting'],
      },
      {
        id: 'conference', x: 75, y: 20,
        title: 'Conference Room',
        description: 'Voice-command the projector, adjust blinds for glare-free presentations, and let occupancy sensors automatically start or end meeting room bookings. The room resets itself after every session.',
        icon: Monitor,
        tags: ['AV Control', 'Smart Blinds', 'Occupancy Scheduling'],
      },
      {
        id: 'workspace', x: 20, y: 65,
        title: 'Open Workspace',
        description: 'Smart lighting zones adapt per desk area. CO₂ and occupancy sensors trigger automatic ventilation when air quality drops, and climate automation keeps the workspace at peak productivity temperature.',
        icon: Users,
        tags: ['Lighting Zones', 'Air Quality', 'Climate Automation'],
      },
      {
        id: 'server', x: 20, y: 22,
        title: 'Server / IT Room',
        description: 'Real-time temperature and humidity sensors send automatic alerts if thresholds are breached. A restricted smart-lock ensures only authorized IT personnel can enter. Every access event is logged.',
        icon: Server,
        tags: ['Temp Monitoring', 'Smart Lock', 'Access Logging'],
      },
      {
        id: 'executive', x: 78, y: 75,
        title: 'Executive Suite',
        description: 'One tap activates Privacy Mode — blinds close, the door indicator flips to "Do Not Disturb", and the room shifts to a personalized climate and lighting profile. Your workspace, your way.',
        icon: Briefcase,
        tags: ['Privacy Mode', 'Climate Profile', 'Do Not Disturb'],
      },
    ],
  },

  apartment: {
    label: 'Apartment',
    sublabel: 'Compact Living Spaces',
    icon: Building,
    svgWalls: [
      { x1: 350, y1: 50, x2: 350, y2: 330 },
      { x1: 50, y1: 330, x2: 750, y2: 330 },
      { x1: 50, y1: 180, x2: 350, y2: 180 },
      { x1: 500, y1: 330, x2: 500, y2: 550 },
      { x1: 200, y1: 330, x2: 200, y2: 550 },
    ],
    svgDoors: [
      { x: 380, y: 540, w: 90, h: 20 },
      { x: 340, y: 240, w: 20, h: 70 },
      { x: 160, y: 320, w: 80, h: 20 },
      { x: 450, y: 320, w: 80, h: 20 },
    ],
    svgRooms: [
      { label: 'BEDROOM', x: 200, y: 120 },
      { label: 'LIVING', x: 540, y: 195 },
      { label: 'KITCHEN', x: 550, y: 440 },
      { label: 'BATHROOM', x: 120, y: 440 },
    ],
    hotspots: [
      {
        id: 'living', x: 62, y: 45,
        title: 'Living Area',
        description: 'Transform your evenings by voice. Ambient lighting scenes shift from energising daylight to cosy evening warmth automatically. A single smart hub connects your TV, speakers, and streaming devices seamlessly.',
        icon: Tv,
        tags: ['Voice Routines', 'Ambient Lighting', 'Entertainment Hub'],
      },
      {
        id: 'bedroom', x: 22, y: 25,
        title: 'Bedroom',
        description: 'A smart sleep mode dims every light and locks the front door at bedtime. A sunrise simulation gently wakes you at your set time — no jarring alarms. When you sleep, your apartment secures itself.',
        icon: Moon,
        tags: ['Sleep Mode', 'Sunrise Wake-up', 'Auto Security'],
      },
      {
        id: 'kitchen', x: 68, y: 78,
        title: 'Kitchen & Dining',
        description: 'Smart plugs monitor appliance energy draw and cut power to idle devices automatically. A connected smoke sensor sends your phone an alert before your smoke alarm even triggers. Stay safe and efficient.',
        icon: UtensilsCrossed,
        tags: ['Safety Alerts', 'Energy Monitor', 'Auto Ventilation'],
      },
      {
        id: 'bathroom', x: 18, y: 75,
        title: 'Bathroom',
        description: 'A smart mirror displays your morning brief — weather, calendar, and news — while you get ready. A leak sensor under the sink sends an instant alert at the first sign of water damage, saving thousands.',
        icon: Droplets,
        tags: ['Smart Mirror', 'Leak Detection', 'Fan Automation'],
      },
      {
        id: 'entrance', x: 50, y: 90,
        title: 'Building Entrance',
        description: 'Answer your door from anywhere. The video intercom shows you who is at the building entrance on your phone. Smart key fob access means no fumbling with physical keys. Package delivery alerts keep you informed.',
        icon: DoorOpen,
        tags: ['Video Intercom', 'Smart Key', 'Package Alerts'],
      },
    ],
  },

};

const SPACE_TYPES: LocalSpaceType[] = ['home', 'office', 'apartment'];

// ─── SVG Blueprint ─────────────────────────────────────────────────────────────
const BlueprintSVG: React.FC<{ config: SpaceConfig }> = ({ config }) => (
  <svg viewBox="0 0 800 600" className="w-full h-full opacity-40 select-none" aria-hidden="true">
    {/* Outer boundary */}
    <rect x="50" y="50" width="700" height="500" fill="none" stroke="#14b8a6" strokeWidth="6" rx="12" />
    {/* Interior walls */}
    {config.svgWalls.map((w, i) => (
      <line key={i} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#14b8a6" strokeWidth="3" />
    ))}
    {/* Door gaps */}
    {config.svgDoors.map((d, i) => (
      <rect key={i} x={d.x} y={d.y} width={d.w} height={d.h} fill="#111827" />
    ))}
    {/* Room labels */}
    {config.svgRooms.map((r, i) => (
      <text key={i} x={r.x} y={r.y} fill="#14b8a6" fontSize="26" fontWeight="bold"
        fontFamily="sans-serif" textAnchor="middle" opacity="0.2">{r.label}</text>
    ))}
  </svg>
);

// ─── Main Component ────────────────────────────────────────────────────────────
export default function InteractiveFloorplan() {
  const [activeSpace, setActiveSpace] = useState<LocalSpaceType>('home');
  const [activeSpot, setActiveSpot] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({
    open: false, submitting: false, success: false,
    email: '', phone: '',
  });

  // Local UI state
  const [isDragging, setIsDragging] = useState(false);
  const [draggingHotspotId, setDraggingHotspotId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const floorplanContainerRef = useRef<HTMLDivElement>(null);

  // Custom Hotspot Editing state
  const [isEditingHotspot, setIsEditingHotspot] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [editFields, setEditFields] = useState({
    title: '',
    description: '',
    tags: ''
  });

  // Pull ALL custom floorplan state and methods from context
  const {
    showNotification,
    customFloorplanImage,
    setCustomFloorplanImage,
    customFloorplanHotspots,
    setCustomFloorplanHotspots,
    addCustomFloorplanHotspot,
    updateCustomFloorplanHotspot,
    deleteCustomFloorplanHotspot,
    clearCustomFloorplan,
    analyzeFloorplanWithAI,
    generateRoomDetailsWithAI,
    isAnalyzingFloorplan,
    floorplanAnalysisError,
  } = useDevices();

  const { whatsappStatus, notifyQuoteAction } = useQuoteRequest();
  const panelRef = useRef<HTMLDivElement | null>(null);

  const config = SPACES[activeSpace];

  // Helper to get icon component by name string
  const getIconByName = (iconName: string): React.ComponentType<{ className?: string }> => {
    const icons: Record<string, React.ComponentType<{ className?: string }>> = {
      Tv, Moon, UtensilsCrossed, Droplets, Car, Lock, Sun, ShieldCheck,
      Flame, Zap, Building, Building2, Home, Monitor, Users, Server, Briefcase,
      DoorOpen, X, ArrowRight, CheckCircle, Loader2, MessageSquare, Upload, ImagePlus, Plus, Trash2, Sparkles
    };
    return icons[iconName] || Zap;
  };

  // Convert context hotspots (icon as string) to component format (icon as React component)
  const customHotspots: CustomHotspot[] = useMemo(() => {
    return (customFloorplanHotspots || []).map(h => ({
      ...h,
      icon: getIconByName(h.icon)
    }));
  }, [customFloorplanHotspots]);

  const currentHotspot = config.hotspots.find(h => h.id === activeSpot) ?? null;

  const handleSpaceChange = (space: LocalSpaceType) => {
    setActiveSpace(space);
    setActiveSpot(null);
    setIsEditingHotspot(false);
  };

  // ─── Custom Floorplan Handlers ───────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showNotification({ message: 'Please select an image file (JPEG or PNG)', type: 'error' });
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      showNotification({ message: 'Image size should be less than 10MB', type: 'error' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        // Store image in context
        setCustomFloorplanImage(result);
        // Clear previous hotspots in context
        setCustomFloorplanHotspots([]);
        showNotification({
          message: 'Floorplan uploaded! Click "Analyze with AI" to detect rooms.',
          type: 'success'
        });
      }
    };
    reader.onerror = () => {
      showNotification({ message: 'Failed to read the image file. Please try again.', type: 'error' });
    };
    reader.readAsDataURL(file);
  };

  // Delegate to context's AI analysis (handles both demo-mode and real OpenAI)
  const handleAnalyzeFloorplan = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!customFloorplanImage) return;
    await analyzeFloorplanWithAI(customFloorplanImage);
  };




  // Drag repositioning via context updater
  const handleHotspotDrag = (hotspotId: string, newX: number, newY: number) => {
    updateCustomFloorplanHotspot(hotspotId, {
      x: Math.max(0, Math.min(100, newX)),
      y: Math.max(0, Math.min(100, newY)),
    });
  };

  // --- Hotspot Customization ---

  const handleStartEdit = () => {
    if (!currentHotspot) return;
    setEditFields({
      title: currentHotspot.title,
      description: currentHotspot.description,
      tags: currentHotspot.tags.join(', ')
    });
    setIsEditingHotspot(true);
  };

  const handleGenerateAIDescription = async () => {
    if (!editFields.title.trim()) {
      showNotification({
        message: 'Please enter a room title first!',
        type: 'warning'
      });
      return;
    }

    setIsGeneratingDescription(true);
    try {
      const { description, tags } = await generateRoomDetailsWithAI(editFields.title);
      setEditFields(prev => ({
        ...prev,
        description,
        tags: tags.join(', ')
      }));
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingHotspot(false);
  };

  const handleSaveEdit = () => {
    if (!activeSpot) return;

    const updatedTags = editFields.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    updateCustomFloorplanHotspot(activeSpot, {
      title: editFields.title || 'Untitled Space',
      description: editFields.description || 'No description provided.',
      tags: updatedTags
    });

    setIsEditingHotspot(false);
    showNotification({ message: 'Hotspot updated successfully', type: 'success' });
  };

  const handleDeleteHotspot = (hotspotId: string) => {
    deleteCustomFloorplanHotspot(hotspotId);
    if (activeSpot === hotspotId) setActiveSpot(null);
    showNotification({ message: 'Hotspot removed', type: 'info' });
  };

  // Add new hotspot via context
  const handleAddCustomHotspot = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const newHotspot: CustomFloorplanHotspot = {
      id: `custom-${Date.now()}`,
      x: 50,
      y: 50,
      title: 'Custom Room',
      description: 'Add your custom automation description here.',
      icon: 'Zap',
      tags: ['Custom'],
      isAiGenerated: false,
      editable: true
    };
    addCustomFloorplanHotspot(newHotspot);
    setActiveSpot(newHotspot.id);
    showNotification({ message: 'New hotspot added! Drag it to position or click to edit.', type: 'info' });
  };

  // Clear floorplan via context
  const handleClearFloorplan = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (confirm('Are you sure you want to remove the uploaded floorplan and all hotspots?')) {
      clearCustomFloorplan();
      setActiveSpot(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openModal = () => setModal(m => ({ ...m, open: true, success: false }));
  const closeModal = () => {
    if (modal.submitting) return;
    setModal({ open: false, submitting: false, success: false, email: '', phone: '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHotspot) return;

    if (!window.navigator.onLine) {
      showNotification({
        message: 'No internet connection. Please check your network and try again.',
        type: 'error',
        mode: 'snackbar'
      });
      return;
    }

    setModal(m => ({ ...m, submitting: true }));
    try {
      const payload: any = {
        email: modal.email.trim(),
        phone: modal.phone.trim(),
        spaceType: activeSpace,
        roomTitle: currentHotspot.title,
        roomDescription: currentHotspot.description,
        roomTags: currentHotspot.tags,
      };

      // 1. Submit to Firestore (Trigger backend)
      await submitSpaceRequest(payload as any);

      // 2. Also trigger notifications (Email is always sent, WhatsApp only if phone provided)
      try {
        await notifyQuoteAction({
          type: 'quote_submitted',
          quoteId: `Tour-${Date.now()}`,
          email: modal.email.trim(),
          phone: modal.phone.trim() || undefined,
          name: 'Valued Customer',
          details: { space: activeSpace, room: currentHotspot.title }
        });
      } catch (e) {
        console.warn('Notification trigger failed (non-fatal)', e);
      }

      setModal(m => ({ ...m, submitting: false, success: true }));
    } catch (err: any) {
      const errorMessage = err?.message || 'Submission failed. Please try again.';
      setModal(m => ({ ...m, submitting: false }));
      showNotification({ message: errorMessage, type: 'error', mode: 'snackbar' });
    }
  };

  // Run hotspotReveal animation when panel appears
  useEffect(() => {
    if (activeSpot && panelRef.current) {
      hotspotReveal(panelRef.current);
    }
    // Always exit edit mode when switching spots
    setIsEditingHotspot(false);
  }, [activeSpot]);

  // Close panel + modal on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
        setActiveSpot(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modal.submitting]);

  return (
    <section
      className="py-24 pb-16 bg-soft-gray dark:bg-gray-900 border-t border-gray-200 dark:border-white/5 relative overflow-hidden"
      id="interactive-tour"
      aria-label="Interactive Smart Home Tour"
    >
      {/* Ambient background glows */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-teal-500/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

        {/* Section Header */}
        <div className="text-center mb-10">
          <span className="text-teal-600 dark:text-teal-400 font-semibold tracking-wider uppercase text-sm mb-4 block inline-flex items-center gap-2">
            <Zap className="w-4 h-4" /> Virtual Experience
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-charcoal dark:text-white mb-4 tracking-tight">
            Explore Your Smart Space
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto font-light leading-relaxed">
            Select your space type, then click the pulsing hotspots to discover how Smile Smart Homes transforms every corner.
          </p>
        </div>

        {/* Space Type Selector */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex bg-white dark:bg-gray-800/60 border border-gray-300 dark:border-white/10 rounded-2xl p-1.5 gap-1 shadow-sm" role="tablist" aria-label="Space type selector">
            {SPACE_TYPES.map((space) => {
              const Icon = SPACES[space].icon;
              const isActive = activeSpace === space;
              return (
                <button
                  key={space}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleSpaceChange(space)}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${isActive
                      ? 'bg-teal text-white shadow-lg shadow-teal/30'
                      : 'text-gray-600 dark:text-gray-400 hover:text-charcoal dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{SPACES[space].label}</span>
                  <span className="sm:hidden">{SPACES[space].label.slice(0, 3)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected space sublabel */}
        <p className="text-center text-gray-500 dark:text-gray-500 text-sm mb-8 -mt-4">
          {SPACES[activeSpace].sublabel}
        </p>

        {/* Hidden file input for custom floorplan */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Main interactive area */}
        <div className="flex flex-col lg:flex-row gap-8 items-start justify-center px-4 sm:px-6 lg:px-12">

          {/* Floorplan Display - SVG or Custom Image */}
          <div
            ref={floorplanContainerRef}
            className="relative w-full max-w-3xl aspect-[4/3] bg-white/80 dark:bg-gray-800/20 border border-gray-200 dark:border-white/10 rounded-[2.5rem] overflow-hidden backdrop-blur-xl shadow-2xl transition-all duration-700 flex-shrink-0"
          >
            {/* Ambient Background Gradient for the Container */}
            <div className="absolute inset-0 bg-gradient-to-tr from-teal-500/5 to-indigo-500/5 pointer-events-none" />

              <>
                <BlueprintSVG config={config} />

                {/* Standard Hotspot buttons */}
                {config.hotspots.map((spot) => {
                  const isActive = activeSpot === spot.id;
                  return (
                    <div
                      key={spot.id}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 group/spot"
                      style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                      onClick={() => setActiveSpot(isActive ? null : spot.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setActiveSpot(isActive ? null : spot.id);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-pressed={isActive}
                      aria-label={`${isActive ? 'Close' : 'View details for'} ${spot.title}`}
                    >
                      <div className={`relative flex items-center justify-center transition-all duration-300 ${isActive ? 'scale-125' : 'hover:scale-110'}`}>
                        {/* Ping ring — hidden when active */}
                        {!isActive && (
                          <div className="absolute inset-0 rounded-full bg-teal-400 animate-ping opacity-75" />
                        )}
                        {/* Core dot */}
                        <div className={`relative w-10 h-10 rounded-full flex items-center justify-center border-[3px] transition-all duration-300 ${isActive
                            ? 'bg-teal border-teal-200 shadow-[0_0_30px_rgba(0,150,136,1)]'
                            : 'bg-white dark:bg-gray-900 border-teal/70 shadow-[0_0_15px_rgba(0,150,136,0.5)] group-hover/spot:bg-teal-50 dark:group-hover/spot:bg-teal-900 group-hover/spot:border-teal'
                          }`}>
                          <div className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${isActive ? 'bg-white' : 'bg-teal'}`} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
          </div>

          {/* Right Sidebar Column (Controls + Info) */}
          <div className="w-full lg:w-[380px] flex-shrink-0 lg:sticky lg:top-8 self-start space-y-6">

            {/* Custom Floorplan Controls removed */}

            {/* Info Panel - for when a hotspot is selected */}
            {currentHotspot ? (
                <div
                  ref={panelRef}
                  key={currentHotspot.id}
                  className={`relative bg-white dark:bg-white/5 backdrop-blur-2xl border border-gray-200 dark:border-white/10 rounded-[2.5rem] shadow-2xl max-h-[80vh] flex flex-col transition-all duration-300 ${isEditingHotspot ? 'p-6' : 'p-8'}`}
                >
                  {/* Scrollable Content Area */}
                  <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6">
                    {/* Close button */}
                    <button
                      onClick={() => setActiveSpot(null)}
                      className="absolute top-5 right-5 text-gray-400 hover:text-charcoal dark:hover:text-white bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 p-2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                      aria-label="Close panel"
                    >
                      <X className="w-4 h-4" />
                    </button>

                    {/* Info Panel Content */}
                    {isEditingHotspot ? (
                      /* EDIT MODE */
                      <div className="space-y-4">
                        <h4 className="text-lg font-bold text-teal flex items-center gap-2 mb-2">
                          <Pencil className="w-4 h-4" /> Edit Hotspot
                        </h4>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Room Title</label>
                          </div>
                          <input
                            type="text"
                            value={editFields.title}
                            onChange={e => setEditFields({ ...editFields, title: e.target.value })}
                            className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-teal/50"
                            placeholder="e.g. Living Room"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Description</label>
                            <button
                              type="button"
                              onClick={handleGenerateAIDescription}
                              disabled={isGeneratingDescription}
                              className="flex items-center gap-1.5 text-[10px] font-bold text-teal hover:text-teal-600 transition-colors uppercase tracking-widest disabled:opacity-50"
                            >
                              {isGeneratingDescription ? (
                                <><Loader2 className="w-2.5 h-2.5 animate-spin" /> Thinking...</>
                              ) : (
                                <><Sparkles className="w-2.5 h-2.5" /> Generate with AI</>
                              )}
                            </button>
                          </div>
                          <div className="relative">
                            <textarea
                              value={editFields.description}
                              onChange={e => setEditFields({ ...editFields, description: e.target.value })}
                              className={`w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-teal/50 h-28 resize-none transition-all ${isGeneratingDescription ? 'opacity-50 blur-[1px]' : ''}`}
                              placeholder="What happens in this space?"
                            />
                            {isGeneratingDescription && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="flex flex-col items-center gap-2">
                                  <Sparkles className="w-5 h-5 text-teal animate-pulse" />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Tags (comma separated)</label>
                          <input
                            type="text"
                            value={editFields.tags}
                            onChange={e => setEditFields({ ...editFields, tags: e.target.value })}
                            className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-teal/50"
                            placeholder="Smart TV, Motion Sensor..."
                          />
                        </div>

                        <div className="flex gap-3 pt-2">
                          <button
                            onClick={handleSaveEdit}
                            className="flex-1 py-3 bg-teal text-white rounded-xl font-bold hover:bg-teal-600 transition-all shadow-lg shadow-teal/20"
                          >
                            Save Changes
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-6 py-3 bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-white/10 transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* VIEW MODE */
                      <>
                        {/* Icon */}
                        <div className="flex items-start justify-between mb-5">
                          <div className="w-14 h-14 bg-gradient-to-br from-teal/20 to-teal/5 text-teal rounded-2xl flex items-center justify-center border border-teal/30 shadow-[0_0_20px_rgba(0,150,136,0.2)]">
                            <currentHotspot.icon className="w-7 h-7" />
                          </div>
                        </div>

                        {/* Title + accent */}
                        <h3 className="text-2xl font-extrabold text-charcoal dark:text-white mb-2 leading-tight">{currentHotspot.title}</h3>
                        <div className="h-1 w-10 bg-teal rounded-full mb-4" />

                        {/* Description */}
                        <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-5 font-light">{currentHotspot.description}</p>

                        {/* Feature tags */}
                        <div className="flex flex-wrap gap-2 mb-7">
                          {currentHotspot.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-3 py-1 bg-teal/10 border border-teal/20 text-teal-700 dark:text-teal-300 text-xs font-semibold rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        {/* CTA */}
                        <button
                          onClick={openModal}
                          className="inline-flex items-center gap-2 text-teal font-semibold hover:text-teal-700 dark:hover:text-teal-300 group/link transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-lg"
                        >
                          Plan this space
                          <ArrowRight className="w-4 h-4 transform group-hover/link:translate-x-1.5 transition-transform" />
                        </button>
                      </>)}
                  </div>
                </div>
              ) : (
                  /* Placeholder when no hotspot is selected */
                  <div className="relative overflow-hidden bg-gray-50/50 dark:bg-gray-800/20 border border-gray-200 dark:border-white/5 p-10 rounded-[2.5rem] flex flex-col items-center justify-center text-center backdrop-blur-md shadow-inner min-h-[360px] group-placeholder">
                    <div className="relative mb-6">
                      <div className="absolute inset-0 bg-teal/20 rounded-full blur-2xl group-hover-placeholder:scale-150 transition-transform duration-1000" />
                      <div className="relative w-20 h-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-[1.5rem] flex items-center justify-center shadow-2xl transform group-hover-placeholder:rotate-12 transition-transform duration-500">
                        <Zap className="w-10 h-10 text-teal animate-pulse" />
                      </div>
                    </div>
                    <h3 className="text-2xl font-bold text-charcoal dark:text-white mb-3">Explore Your Space</h3>
                    <p className="text-gray-500 dark:text-gray-400 font-light leading-relaxed max-w-[280px]">
                      Select a pulsing hotspot on the floorplan to discover how <span className="text-teal font-medium">Smile Smart Home</span> enhances your lifestyle.
                    </p>
                  </div>
              )}
          </div>
        </div>
      </div>

      {/* Submission Modal */}
      {modal.open && currentHotspot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeModal} />

          <div className="relative z-10 w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl p-8">
            {/* Close */}
            <button
              onClick={closeModal}
              disabled={modal.submitting}
              className="absolute top-4 right-4 text-gray-400 hover:text-charcoal dark:hover:text-white bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 p-2 rounded-full transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {modal.success ? (
              /* Success state */
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-teal/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-teal" />
                </div>
                <h3 className="text-2xl font-bold text-charcoal dark:text-white mb-2">Request Sent!</h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-6">
                  Our team will review your <strong className="text-teal">{currentHotspot.title}</strong> automation request and get back to you shortly.
                </p>

                {/* WhatsApp Status */}
                <div className="mb-6">
                  {whatsappStatus === 'sending' && (
                    <div className="flex items-center gap-2 text-teal-400 text-xs justify-center bg-teal-400/5 py-2 rounded-xl border border-teal-400/10">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Sending WhatsApp message...
                    </div>
                  )}
                  {whatsappStatus === 'sent' && (
                    <div className="flex items-center gap-2 text-emerald-400 text-xs justify-center bg-emerald-400/5 py-2 rounded-xl border border-emerald-400/10">
                      <CheckCircle className="w-3.5 h-3.5" />
                      WhatsApp message sent successfully!
                    </div>
                  )}
                  {whatsappStatus === 'failed' && (
                    <div className="flex items-center gap-2 text-red-500 text-xs justify-center bg-red-500/5 py-2 rounded-xl border border-red-500/10 font-medium">
                      <MessageSquare className="w-3.5 h-3.5" />
                      WhatsApp delivery failed, but email was sent.
                    </div>
                  )}
                </div>
                <button
                  onClick={closeModal}
                  className="w-full py-3 rounded-xl bg-teal hover:bg-teal-600 text-white font-semibold transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              /* Form state */
              <>
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-1">
                    <currentHotspot.icon className="w-5 h-5 text-teal" />
                    <h3 id="modal-title" className="text-xl font-bold text-charcoal dark:text-white">Plan Your {currentHotspot.title}</h3>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    Share your details and our team will reach out to plan your <span className="text-teal capitalize">{activeSpace}</span> automation.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5" htmlFor="fp-email">
                      Your Email Address *
                    </label>
                    <input
                      id="fp-email"
                      type="email"
                      required
                      autoFocus
                      value={modal.email}
                      onChange={e => setModal(m => ({ ...m, email: e.target.value }))}
                      placeholder="e.g. john@example.com"
                      className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-white/10 text-charcoal dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal transition-shadow text-base"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5" htmlFor="fp-phone">
                      WhatsApp Number (Optional)
                    </label>
                    <input
                      id="fp-phone"
                      type="tel"
                      value={modal.phone}
                      onChange={e => setModal(m => ({ ...m, phone: e.target.value }))}
                      placeholder="e.g. +91 9876543210"
                      className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-shadow text-base"
                    />
                    <p className="text-xs text-gray-500 mt-1.5">
                      Enter your mobile number to receive your plan summary via WhatsApp.
                    </p>
                  </div>

                  {/* Selected features summary */}
                  <div className="flex flex-wrap gap-2">
                    {currentHotspot.tags.map(tag => (
                      <span key={tag} className="px-2.5 py-1 bg-teal/10 border border-teal/20 text-teal-700 dark:text-teal-300 text-xs font-semibold rounded-full">{tag}</span>
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={modal.submitting}
                    className="w-full py-3 rounded-xl bg-teal hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    {modal.submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : 'Send Details to My Email →'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
