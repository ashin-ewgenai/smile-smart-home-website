import React, { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Camera, Sparkles, X, AlertTriangle, CheckCircle2, Loader2,
  Wifi, Lightbulb, Eye, Info, ChevronDown, ChevronUp, RotateCcw,
  ImagePlus, Zap, MapPin
} from 'lucide-react';
import { useDeviceRecommendations } from '../hooks/useDeviceRecommendations';
import { useDevices } from '../contexts/DevicesContext';
import { Plus, Trash2, Crosshair, MousePointer2, Hand } from 'lucide-react';
import type { DevicePlacementMarker, RoomVisualizationResult } from '../models';

// ── Helpers ──────────────────────────────────────────────────────────────────

const LIGHTING_COLORS: Record<string, string> = {
  Excellent: 'text-emerald-500',
  Good:      'text-teal',
  Fair:      'text-amber-500',
  Poor:      'text-red-500',
};

const LIGHTING_BG: Record<string, string> = {
  Excellent: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/30',
  Good:      'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-900/30',
  Fair:      'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/30',
  Poor:      'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/30',
};

// ── Device Marker Overlay ─────────────────────────────────────────────────────

interface MarkerProps {
  marker: DevicePlacementMarker;
  index: number;
  isActive: boolean;
  onToggle: () => void;
}

const DeviceMarker: React.FC<MarkerProps> = ({ marker, index, isActive, onToggle }) => {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive) {
      const previouslyFocused = document.activeElement as HTMLElement;
      popupRef.current?.focus();
      return () => {
        previouslyFocused?.focus();
      };
    }
  }, [isActive]);

  const tooltipVariants = {
    hidden: { opacity: 0, y: 15, scale: 0.8, rotate: -5 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      rotate: 0,
      transition: { 
        type: 'spring', 
        damping: 15, 
        stiffness: 250,
        mass: 0.8 
      }
    },
    exit: { 
      opacity: 0, 
      y: 10, 
      scale: 0.8, 
      transition: { duration: 0.2, ease: 'easeIn' } 
    }
  };

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0, rotate: -20 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ 
        type: 'spring', 
        stiffness: 350, 
        damping: 15, 
        delay: index * 0.08 
      }}
      className="absolute z-10"
      style={{ left: `${marker.x}%`, top: `${marker.y}%`, transform: 'translate(-50%, -50%)' }}
    >
      {/* Ping animation */}
      <span className={`absolute inset-0 rounded-full bg-teal/40 animate-ping ${isActive ? '' : 'hidden'}`} />

      <button
        onClick={onToggle}
        className={`relative flex items-center justify-center w-10 h-10 rounded-full border-2 shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-teal/50 ${
          isActive
            ? 'bg-teal border-white scale-125 shadow-teal/50'
            : 'bg-white/90 dark:bg-charcoal/90 border-teal hover:scale-110 hover:bg-teal/10'
        }`}
        aria-label={`${marker.deviceName} placement`}
        title={marker.deviceName}
      >
        <span className="text-lg leading-none select-none">{marker.icon}</span>
      </button>

      {/* Tooltip */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            ref={popupRef}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onToggle();
            }}
            variants={tooltipVariants as any}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 w-48 bg-white dark:bg-charcoal rounded-2xl shadow-2xl border border-teal/20 p-3 z-20 focus:outline-none"
          >
            <div className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-1.5 mb-1">
              <span>{marker.icon}</span>
              {marker.deviceName}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{marker.reason}</p>
            {/* Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-white dark:border-t-charcoal" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ── Drop Zone ─────────────────────────────────────────────────────────────────

interface DropZoneProps {
  onFile: (file: File) => void;
  preview: string | null;
  onClear: () => void;
  uploadProgress: number;
  uploadLoading: boolean;
}

const DropZone: React.FC<DropZoneProps> = ({ onFile, preview, onClear, uploadProgress, uploadLoading }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }, [onFile]);

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = '';
  };

  if (preview) {
    return (
      <div className="relative rounded-3xl overflow-hidden border-2 border-teal/30 shadow-xl">
        <img
          src={preview}
          alt="Room preview"
          className="w-full h-64 object-cover"
        />
        {uploadLoading && (
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-3">
            <Loader2 className="animate-spin text-white" size={32} />
            <div className="text-white font-bold text-sm">Uploading... {uploadProgress}%</div>
            <div className="w-48 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-teal rounded-full"
                animate={{ width: `${uploadProgress}%` }}
                transition={{ ease: 'easeOut' }}
              />
            </div>
          </div>
        )}
        {!uploadLoading && (
          <button
            onClick={onClear}
            className="absolute top-3 right-3 p-2 bg-white/90 dark:bg-charcoal/90 rounded-full shadow-lg hover:scale-110 transition-transform border border-gray-200 dark:border-gray-700"
            aria-label="Remove photo"
          >
            <X size={16} className="text-slate-700 dark:text-white" />
          </button>
        )}
        <div className="absolute bottom-3 left-3 bg-teal/90 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
          <Camera size={12} />
          Room photo ready
        </div>
      </div>
    );
  }

  return (
    <motion.div
      onDragEnter={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      animate={{ borderColor: dragging ? '#009688' : 'rgba(0,150,136,0.3)' }}
      className={`relative border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors duration-200 ${
        dragging
          ? 'bg-teal/5 dark:bg-teal-900/10'
          : 'bg-soft-gray dark:bg-gray-800/30 hover:bg-teal/5 dark:hover:bg-teal-900/10'
      }`}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      aria-label="Upload room photo"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handlePick}
        id="room-photo-input"
      />
      <motion.div
        animate={{ scale: dragging ? 1.15 : 1 }}
        className="w-16 h-16 rounded-2xl bg-teal/10 border border-teal/20 flex items-center justify-center"
      >
        <ImagePlus size={28} className="text-teal" />
      </motion.div>
      <div className="text-center">
        <p className="text-slate-700 dark:text-white font-bold text-base">
          {dragging ? 'Drop your photo here' : 'Drag & drop your room photo'}
        </p>
        <p className="text-slate-500 text-sm mt-1">or <span className="text-teal font-semibold">browse files</span> · JPEG, PNG, WebP · max 10MB</p>
      </div>
      <div className="flex gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1"><Camera size={12} /> Any room type</span>
        <span className="flex items-center gap-1"><Sparkles size={12} /> AI-powered analysis</span>
        <span className="flex items-center gap-1"><MapPin size={12} /> Device placement</span>
      </div>
    </motion.div>
  );
};

// ── Results Overlay Card ───────────────────────────────────────────────────────

interface InsightCardProps {
  data: RoomVisualizationResult;
}

const InsightCard: React.FC<InsightCardProps> = ({ data }) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-charcoal rounded-3xl border border-teal/20 shadow-xl overflow-hidden"
    >
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-teal/10 flex items-center justify-center">
            <Eye size={18} className="text-teal" />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 dark:text-white">Room Insights</h4>
            <p className="text-xs text-slate-400">Detected: {data.roomType}{data.demoMode ? ' · Demo mode' : ''}</p>
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Lighting Quality */}
              <div className={`rounded-2xl p-4 border ${LIGHTING_BG[data.lightingQuality] || LIGHTING_BG.Good}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Lightbulb size={14} className={LIGHTING_COLORS[data.lightingQuality] || 'text-teal'} />
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Lighting</span>
                </div>
                <div className={`text-lg font-black ${LIGHTING_COLORS[data.lightingQuality] || 'text-teal'}`}>
                  {data.lightingQuality}
                </div>
              </div>

              {/* WiFi Note */}
              <div className="rounded-2xl p-4 border bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30">
                <div className="flex items-center gap-2 mb-1">
                  <Wifi size={14} className="text-blue-500" />
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">WiFi Coverage</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{data.wifiCoverageNote}</p>
              </div>

              {/* General Insight */}
              {data.generalInsight && (
                <div className="sm:col-span-2 rounded-2xl p-4 border bg-teal/5 dark:bg-teal-900/10 border-teal/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Info size={14} className="text-teal" />
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">AI Insight</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{data.generalInsight}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ── Device Selector ────────────────────────────────────────────────────────────

interface DeviceSelectorProps {
  deviceNames: string[];
  selected: Set<string>;
  onToggle: (name: string) => void;
}

const DeviceSelector: React.FC<DeviceSelectorProps> = ({ deviceNames, selected, onToggle }) => (
  <div>
    <h4 className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
      <Zap size={14} className="text-teal" /> Select Devices to Place
    </h4>
    <div className="flex flex-wrap gap-2">
      {deviceNames.map((name) => {
        const active = selected.has(name);
        return (
          <button
            key={name}
            onClick={() => onToggle(name)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200 ${
              active
                ? 'bg-teal text-white border-teal shadow-md shadow-teal/20'
                : 'bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-400 border-gray-200 dark:border-gray-700 hover:border-teal/50 hover:text-teal'
            }`}
          >
            {name}
          </button>
        );
      })}
    </div>
    <p className="text-xs text-slate-400 mt-2">{selected.size} device{selected.size !== 1 ? 's' : ''} selected</p>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────

export const RoomVisualization: React.FC = () => {
  const {
    uid,
    recommendations,
    roomPhoto,
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
  } = useDeviceRecommendations();

  // Build a list of device names from recommendations (and show fallback options if none)
  const FALLBACK_DEVICE_NAMES = [
    'Smart Color Bulb', 'Smart Lock', 'Security Camera',
    'Learning Thermostat', 'Motion Sensor', 'Smart Doorbell',
  ];
  const allDeviceNames = recommendations.length > 0
    ? recommendations.map(r => r.name)
    : FALLBACK_DEVICE_NAMES;

  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(
    () => new Set(allDeviceNames.slice(0, 4))
  );
  const [activeMarker, setActiveMarker] = useState<string | null>(null);

  const { showNotification, addedDevices, addDevice, removeDevice, analyzeSingleDevice } = useDevices();
  const [newDeviceName, setNewDeviceName] = useState('');
  const [isAddingDevice, setIsAddingDevice] = useState(false);
  const [isPlacementMode, setIsPlacementMode] = useState(false);
  const [pendingDevice, setPendingDevice] = useState<DevicePlacementMarker | null>(null);
  const [isAiPlacing, setIsAiPlacing] = useState(false);

  const toggleDevice = (name: string) => {
    setSelectedDevices(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const isLoading = uploadLoading || visualizationLoading;
  const hasResult = !!visualizationData;
  const hasError = !!(uploadError || visualizationError);

  const handleAnalyze = () => {
    if (selectedDevices.size === 0) return;
    uploadAndAnalyzeRoom(Array.from(selectedDevices));
  };

  const handleAddDevice = () => {
    if (!newDeviceName.trim()) return;
    
    // Enter placement mode - user will click on image to set position
    const device: DevicePlacementMarker = {
      deviceName: newDeviceName.trim(),
      x: 0,
      y: 0,
      reason: 'User-added device for custom room setup',
      icon: '🔌'
    };
    
    setPendingDevice(device);
    setIsPlacementMode(true);
    showNotification({
      message: `Click on the room image to place "${device.deviceName}"`,
      type: 'info'
    });
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isPlacementMode || !pendingDevice) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    // Clamp to 0-100%
    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));
    
    const deviceWithPosition: DevicePlacementMarker = {
      ...pendingDevice,
      x: clampedX,
      y: clampedY
    };
    
    addDevice(deviceWithPosition);
    setIsPlacementMode(false);
    setPendingDevice(null);
    setNewDeviceName('');
    setIsAddingDevice(false);
    
    showNotification({
      message: `${deviceWithPosition.deviceName} placed at ${Math.round(clampedX)}%, ${Math.round(clampedY)}%`,
      type: 'success'
    });
  };

  const cancelPlacement = () => {
    setIsPlacementMode(false);
    setPendingDevice(null);
    showNotification({
      message: 'Placement cancelled',
      type: 'warning'
    });
  };

  const handleAiPlaceDevice = async () => {
    if (!newDeviceName.trim()) return;
    
    setIsAiPlacing(true);
    showNotification({
      message: `AI is finding the best spot for "${newDeviceName.trim()}"...`,
      type: 'info'
    });
    
    const marker = await analyzeSingleDevice(newDeviceName.trim());
    
    if (marker) {
      addDevice(marker);
      setNewDeviceName('');
      setIsAddingDevice(false);
      showNotification({
        message: `${marker.deviceName} placed by AI at ${Math.round(marker.x)}%, ${Math.round(marker.y)}%`,
        type: 'success'
      });
    }
    
    setIsAiPlacing(false);
  };

  // Combine AI markers with user-added devices
  const allMarkers: DevicePlacementMarker[] = visualizationData 
    ? [...(visualizationData.markers || []), ...addedDevices]
    : [];

  // Handle ESC key to clear active marker
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeMarker) {
        setActiveMarker(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeMarker]);

  useEffect(() => {
    if (hasResult) {
      showNotification({
        message: 'AI Room Analysis complete! Explore the suggested placements below.',
        type: 'success'
      });
    }
  }, [hasResult, showNotification]);

  // Sign-in gate
  if (!uid) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-center gap-5">
        <div className="w-20 h-20 rounded-full bg-teal/10 flex items-center justify-center">
          <Camera size={36} className="text-teal" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Sign In to Use Room Visualizer</h3>
          <p className="text-slate-500 max-w-xs mx-auto text-sm">Upload a photo of your room and let our AI show you exactly where to place your smart devices.</p>
        </div>
        <button
          data-open-auth="login"
          className="btn-primary px-8 py-3 flex items-center gap-2 shadow-lg shadow-teal/20"
        >
          <Sparkles size={16} /> Sign In to Continue
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Drop Zone */}

      {/* Drop Zone */}
      <DropZone
        onFile={setRoomPhoto}
        preview={roomPhotoPreview}
        onClear={clearVisualization}
        uploadProgress={uploadProgress}
        uploadLoading={uploadLoading}
      />

      {/* Device Selector */}
      {roomPhoto && !hasResult && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-soft-gray dark:bg-gray-800/40 rounded-2xl p-5 border border-gray-200 dark:border-gray-700"
        >
          <DeviceSelector
            deviceNames={allDeviceNames}
            selected={selectedDevices}
            onToggle={toggleDevice}
          />
        </motion.div>
      )}

      {/* Manual Device Addition - Always visible when photo is present */}
      {roomPhoto && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-teal/20 shadow-lg"
        >
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Plus size={14} className="text-teal" /> Add Your Own Devices
            </h4>
            <button
              onClick={() => {
                if (isPlacementMode) {
                  cancelPlacement();
                }
                setIsAddingDevice(!isAddingDevice);
              }}
              className="text-xs font-semibold text-teal hover:text-teal-600 transition-colors"
            >
              {isAddingDevice ? 'Cancel' : 'Add Device'}
            </button>
          </div>
          
          {/* Placement Mode Banner */}
          {isPlacementMode && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl"
            >
              <div className="flex items-center gap-3">
                <Crosshair size={18} className="text-amber-600 animate-pulse" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    Placement Mode Active
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Click anywhere on the room image to place "{pendingDevice?.deviceName}"
                  </p>
                </div>
                <button
                  onClick={cancelPlacement}
                  className="text-xs font-semibold text-amber-600 hover:text-amber-800 px-2 py-1"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
          
          {isAddingDevice && !isPlacementMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-3"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAiPlaceDevice()}
                  placeholder="Enter device name (e.g., 'My Smart Speaker')"
                  className="flex-1 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-700 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal/50"
                />
              </div>
              
              {/* Placement Options */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleAiPlaceDevice}
                  disabled={!newDeviceName.trim() || isAiPlacing || !visualizationData}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-teal to-teal-600 text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-teal/20"
                >
                  {isAiPlacing ? (
                    <><Loader2 size={16} className="animate-spin" /> Analyzing...</>
                  ) : (
                    <><Sparkles size={16} /> AI Place</>
                  )}
                </button>
                
                <button
                  onClick={handleAddDevice}
                  disabled={!newDeviceName.trim()}
                  className="flex-1 px-4 py-2.5 bg-white dark:bg-gray-800 border-2 border-teal text-teal rounded-xl text-sm font-semibold hover:bg-teal/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Hand size={16} /> Manual Place
                </button>
              </div>
              
              <p className="text-xs text-slate-400">
                <span className="font-semibold text-teal">AI Place:</span> GPT-4o Vision finds the optimal position based on room layout, lighting, and coverage. 
                <span className="font-semibold text-teal ml-1">Manual Place:</span> You choose the exact location.
              </p>
              
              {!visualizationData && (
                <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg border border-amber-200">
                  Run "Analyze My Room" first to enable AI placement (requires room context).
                </p>
              )}
            </motion.div>
          )}
          
          {addedDevices.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs text-slate-400 mb-2">Added devices ({addedDevices.length}):</p>
              <div className="flex flex-wrap gap-2">
                {addedDevices.map((device, index) => (
                  <div
                    key={`${device.deviceName}-${index}`}
                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-xs"
                  >
                    <span>{device.icon}</span>
                    <span className="text-slate-700 dark:text-slate-300">{device.deviceName}</span>
                    <span className="text-amber-500/60">@{Math.round(device.x)}%,{Math.round(device.y)}%</span>
                    <button
                      onClick={() => removeDevice(device.deviceName)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                      title="Remove device"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Analyze CTA */}
      {roomPhoto && !hasResult && !isLoading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center">
          <button
            onClick={handleAnalyze}
            disabled={selectedDevices.size === 0}
            className="btn-primary px-10 py-4 text-base flex items-center gap-3 shadow-xl shadow-teal/20 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] transition-transform"
            id="analyze-room-btn"
          >
            <Sparkles size={20} />
            Analyze My Room
          </button>
        </motion.div>
      )}

      {/* Loading state */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 py-12"
          >
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-teal/10 border border-teal/20 flex items-center justify-center">
                <Loader2 size={36} className="animate-spin text-teal" />
              </div>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                className="absolute inset-0 rounded-full border-2 border-dashed border-teal/30"
              />
            </div>
            <div className="text-center">
              <p className="font-bold text-slate-800 dark:text-white text-base">
                {uploadLoading ? 'Uploading your photo...' : 'AI is analyzing your room...'}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {uploadLoading
                  ? `${uploadProgress}% complete`
                  : 'Identifying optimal device placement positions'}
              </p>
            </div>
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  className="w-2 h-2 rounded-full bg-teal"
                  animate={{ y: [0, -8, 0] }}
                  transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results: annotated photo with interactive markers */}
      <AnimatePresence>
        {hasResult && visualizationData && roomPhotoPreview && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Demo mode badge */}
            {visualizationData.demoMode && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-xl text-amber-700 dark:text-amber-400 text-sm">
                <Zap size={14} className="shrink-0" />
                <span><strong>Demo mode:</strong> Showing suggested placement. Configure your OpenAI API key for AI-powered analysis.</span>
              </div>
            )}

            {/* Success badge */}
            {!visualizationData.demoMode && (
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm font-medium">
                <CheckCircle2 size={16} /> AI analysis complete · {visualizationData.markers.length} devices placed
              </div>
            )}

            {/* Annotated photo */}
            <div
              className="relative rounded-3xl overflow-hidden border-2 border-teal/20 shadow-2xl bg-black"
              id="room-visualization-map"
            >
              <img
                src={roomPhotoPreview}
                alt="Analyzed room"
                onClick={handleImageClick}
                className={`w-full object-cover ${isPlacementMode ? 'cursor-crosshair' : 'cursor-default'}`}
                style={{ maxHeight: '480px', objectFit: 'cover' }}
              />
              
              {/* Placement Mode Overlay */}
              {isPlacementMode && (
                <div className="absolute inset-0 bg-amber-500/10 pointer-events-none flex items-center justify-center">
                  <div className="bg-white dark:bg-charcoal px-4 py-2 rounded-full shadow-lg border border-amber-200">
                    <span className="text-sm font-semibold text-amber-600 flex items-center gap-2">
                      <Crosshair size={16} className="animate-pulse" />
                      Click to place {pendingDevice?.deviceName}
                    </span>
                  </div>
                </div>
              )}
              {/* Dark overlay gradient for contrast */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />

              {/* Device markers - AI + User Added */}
              {allMarkers.map((marker: DevicePlacementMarker, i: number) => (
                <DeviceMarker
                  key={`${marker.deviceName}-${i}`}
                  marker={marker}
                  index={i}
                  isActive={activeMarker === marker.deviceName}
                  onToggle={() => setActiveMarker(prev =>
                    prev === marker.deviceName ? null : marker.deviceName
                  )}
                />
              ))}

              {/* Map legend */}
              <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1.5">
                {allMarkers.map((m: DevicePlacementMarker, i: number) => (
                  <button
                    key={i}
                    onClick={() => setActiveMarker(prev =>
                      prev === m.deviceName ? null : m.deviceName
                    )}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold shadow border transition-all duration-200 ${
                      activeMarker === m.deviceName
                        ? 'bg-teal text-white border-teal'
                        : addedDevices.some(d => d.deviceName === m.deviceName)
                          ? 'bg-amber-100/80 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:border-amber-400'
                          : 'bg-white/80 dark:bg-charcoal/80 text-slate-700 dark:text-white border-white/50 hover:border-teal/50'
                    }`}
                  >
                    <span>{m.icon}</span>
                    {m.deviceName}
                  </button>
                ))}
              </div>
            </div>

            {/* Click-to-expand detail cards */}
            <AnimatePresence>
              {activeMarker && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  {allMarkers
                    .filter((m: DevicePlacementMarker) => m.deviceName === activeMarker)
                    .map((m: DevicePlacementMarker, i: number) => {
                      const isUserAdded = addedDevices.some(d => d.deviceName === m.deviceName);
                      return (
                        <div
                          key={i}
                          className={`rounded-2xl p-4 flex items-start gap-4 ${
                            isUserAdded 
                              ? 'bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800' 
                              : 'bg-teal/5 dark:bg-teal-900/10 border border-teal/20'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                            isUserAdded ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-teal/10'
                          }`}>
                            {m.icon}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-800 dark:text-white">{m.deviceName}</h4>
                              {isUserAdded && (
                                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                                  User Added
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{m.reason}</p>
                            <div className={`text-xs font-mono mt-2 opacity-60 ${isUserAdded ? 'text-amber-600' : 'text-teal'}`}>
                              Position: {Math.round(m.x)}% from left, {Math.round(m.y)}% from top
                            </div>
                          </div>
                          {isUserAdded && (
                            <button
                              onClick={() => removeDevice(m.deviceName)}
                              className="text-slate-400 hover:text-red-500 transition-colors p-1"
                              title="Remove device"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Insights Card */}
            <InsightCard data={visualizationData} />

            {/* Re-analyze CTA */}
            <div className="flex justify-center gap-4">
              <button
                onClick={handleAnalyze}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl border-2 border-teal text-teal font-bold hover:bg-teal/5 transition-colors text-sm"
              >
                <Sparkles size={16} /> Re-Analyze
              </button>
              <button
                onClick={clearVisualization}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-slate-500 font-bold hover:border-teal/30 transition-colors text-sm"
              >
                <Upload size={16} /> New Photo
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
