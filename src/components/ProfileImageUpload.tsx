import React, { useState, useCallback, useRef, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ZoomIn, ZoomOut, RotateCcw, Check, Upload, Loader2, ImageIcon, AlertCircle, RefreshCw, Maximize2, Minimize2, ChevronLeft, ChevronRight, ShieldAlert } from 'lucide-react';
import { useAuthMode } from '../contexts/AuthModeContext';

interface Point {
  x: number;
  y: number;
}

interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ProfileImageUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (croppedFile: File, previewUrl: string) => Promise<void>;
  currentImageUrl?: string;
}

const ASPECT_RATIO = 1; // Square aspect ratio for profile pictures
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

const ProfileImageUpload: React.FC<ProfileImageUploadProps> = ({
  isOpen,
  onClose,
  onUpload,
  currentImageUrl,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [showWarning, setShowWarning] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const { user, loading: authLoading } = useAuthMode();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropperContainerRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setImageSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setCroppedAreaPixels(null);
      setPreviewUrl(null);
      setError(null);
      setIsUploading(false);
      setIsDragOver(false);
      setIsFullscreen(false);
      setImageDimensions(null);
      setShowWarning(null);
      setCurrentStep(1);
    }
  }, [isOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isUploading) {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else if (imageSrc) {
          setImageSrc(null);
          setCurrentStep(1);
        } else {
          onClose();
        }
      }
      if (imageSrc) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          setZoom((prev) => Math.min(prev + 0.2, MAX_ZOOM));
        }
        if (e.key === '-') {
          e.preventDefault();
          setZoom((prev) => Math.max(prev - 0.2, MIN_ZOOM));
        }
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          handleReset();
        }
        if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          handleUpload();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFullscreen, imageSrc, isUploading, onClose]);

  const onFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPEG, PNG)');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image size should be less than 10MB');
      return;
    }

    setError(null);
    setShowWarning(null);

    // Read and display the image
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImageSrc(result);
      // Reset crop and zoom when new image is loaded
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setCurrentStep(2);

      // Check image dimensions
      const img = new Image();
      img.onload = () => {
        setImageDimensions({ width: img.width, height: img.height });
        if (img.width < 400 || img.height < 400) {
          setShowWarning(`Image resolution (${img.width}x${img.height}) is low. For best results, use an image of at least 400x400 pixels.`);
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  }, []);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please drop a valid image file (JPEG, PNG)');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image size should be less than 10MB');
      return;
    }

    setError(null);
    setShowWarning(null);

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImageSrc(result);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setCurrentStep(2);

      const img = new Image();
      img.onload = () => {
        setImageDimensions({ width: img.width, height: img.height });
        if (img.width < 400 || img.height < 400) {
          setShowWarning(`Image resolution (${img.width}x${img.height}) is low. For best results, use an image of at least 400x400 pixels.`);
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  }, []);

  // Mouse wheel zoom handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!imageSrc) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((prev) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta)));
  }, [imageSrc]);

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  // Generate preview of cropped image
  const generatePreview = useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const image = await createImage(imageSrc);
      const { width, height } = croppedAreaPixels;

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        width,
        height,
        0,
        0,
        width,
        height
      );

      const previewDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setPreviewUrl(previewDataUrl);
    } catch (err) {
      console.error('Error generating preview:', err);
    }
  }, [imageSrc, croppedAreaPixels]);

  // Update preview when crop changes
  useEffect(() => {
    if (imageSrc && croppedAreaPixels) {
      const timeoutId = setTimeout(generatePreview, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [imageSrc, croppedAreaPixels, zoom, crop, rotation, generatePreview]);

  // Create image helper function
  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.src = url;
    });

  // Generate cropped image as File
  const generateCroppedImageFile = async (): Promise<File | null> => {
    if (!imageSrc || !croppedAreaPixels) return null;

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const image = await createImage(imageSrc);
      const { width, height } = croppedAreaPixels;

      // Set output size (resize to reasonable profile picture dimensions)
      const outputSize = 400;
      canvas.width = outputSize;
      canvas.height = outputSize;

      // Apply rotation if needed
      if (rotation !== 0) {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
      }

      ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        width,
        height,
        0,
        0,
        outputSize,
        outputSize
      );

      if (rotation !== 0) {
        ctx.restore();
      }

      // Convert canvas to blob
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
      });

      if (!blob) return null;

      // Create File from blob
      const file = new File([blob], 'profile-picture.jpg', {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });

      return file;
    } catch (err) {
      console.error('Error generating cropped image:', err);
      setError('Failed to process image. Please try again.');
      return null;
    }
  };

  const handleUpload = async () => {
    if (isUploading || authLoading) return;
    
    if (!user) {
      setError('Your session has expired. Please sign in again to upload.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const croppedFile = await generateCroppedImageFile();
      if (!croppedFile) {
        setError('Failed to process image. Please try again.');
        return;
      }

      await onUpload(croppedFile, previewUrl || imageSrc || '');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to upload image. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.2, MAX_ZOOM));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.2, MIN_ZOOM));
  };

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full ${isFullscreen ? 'max-w-6xl h-[95vh]' : 'max-w-4xl max-h-[90vh]'} overflow-hidden flex flex-col`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-teal-50 to-transparent dark:from-teal-900/20 dark:to-transparent">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-teal-600" />
                Update Profile Picture
              </h2>
              {/* Step Indicator */}
              <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-full px-3 py-1">
                <div className={`flex items-center gap-1 transition-colors ${currentStep === 1 ? 'text-teal-600 font-medium' : 'text-gray-500'}`}>
                  <div className={`w-5 h-5 rounded-full text-xs flex items-center justify-center ${currentStep === 1 ? 'bg-teal-600 text-white' : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'}`}>
                    1
                  </div>
                  <span className="text-xs hidden sm:inline">Select</span>
                </div>
                <ChevronRight className="h-3 w-3 text-gray-400" />
                <div className={`flex items-center gap-1 transition-colors ${currentStep === 2 ? 'text-teal-600 font-medium' : 'text-gray-500'}`}>
                  <div className={`w-5 h-5 rounded-full text-xs flex items-center justify-center ${currentStep === 2 ? 'bg-teal-600 text-white' : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'}`}>
                    2
                  </div>
                  <span className="text-xs hidden sm:inline">Crop</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {imageSrc && (
                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  disabled={isUploading}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  ) : (
                    <Maximize2 className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  )}
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                disabled={isUploading}
              >
                <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            {!user && !authLoading ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-full py-12 text-center"
              >
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-full mb-4">
                  <ShieldAlert className="h-12 w-12 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Session Required</h3>
                <p className="text-gray-600 dark:text-gray-400 max-w-md mb-6">
                  You must be logged in to update your profile picture. Your session may have expired.
                </p>
                <button
                  onClick={() => window.location.href = '/login'}
                  className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors font-medium"
                >
                  Go to Login
                </button>
              </motion.div>
            ) : authLoading ? (
              <div className="flex flex-col items-center justify-center h-64">
                <Loader2 className="h-12 w-12 text-teal-500 animate-spin mb-4" />
                <p className="text-gray-600 dark:text-gray-400">Verifying session...</p>
              </div>
            ) : (
              <>
                <AnimatePresence mode="wait">
                {!imageSrc ? (
                // File Upload Area with Drag & Drop
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex flex-col items-center justify-center py-8"
                >
                  <motion.div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full max-w-md h-72 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${
                      isDragOver
                        ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30 scale-105'
                        : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 hover:border-teal-500 dark:hover:border-teal-400'
                    }`}
                  >
                    <motion.div
                      animate={isDragOver ? { y: [0, -10, 0] } : {}}
                      transition={{ repeat: isDragOver ? Infinity : 0, duration: 0.6 }}
                    >
                      <Upload className={`h-16 w-16 mb-4 transition-colors ${isDragOver ? 'text-teal-500' : 'text-gray-400 dark:text-gray-500'}`} />
                    </motion.div>
                    <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {isDragOver ? 'Drop your image here!' : 'Click or drag to upload'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center px-4">
                      Supports JPG, PNG up to 10MB
                    </p>
                    <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">JPG</span>
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">PNG</span>
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">Max 10MB</span>
                    </div>
                  </motion.div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/jpg"
                    className="hidden"
                    onChange={onFileChange}
                  />
                  {currentImageUrl && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-8 text-center"
                    >
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Current Picture</p>
                      <div className="relative inline-block">
                        <img
                          src={currentImageUrl}
                          alt="Current profile"
                          className="w-28 h-28 rounded-full object-cover border-4 border-gray-200 dark:border-gray-700 shadow-lg"
                        />
                        <div className="absolute inset-0 rounded-full border-4 border-teal-500/20 animate-pulse" />
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              ) : (
                // Cropping Interface
                <motion.div
                  key="crop"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className={`flex flex-col ${isFullscreen ? 'h-full' : 'lg:flex-row'} gap-6`}
                >
                  {/* Cropper Area */}
                  <div className={`flex-1 ${isFullscreen ? 'flex flex-col' : ''}`}>
                    <div
                      ref={cropperContainerRef}
                      onWheel={handleWheel}
                      className={`relative bg-gray-900 rounded-xl overflow-hidden ${isFullscreen ? 'flex-1 min-h-[50vh]' : 'h-80 lg:h-96'}`}
                    >
                      <Cropper
                        image={imageSrc}
                        crop={crop}
                        zoom={zoom}
                        aspect={ASPECT_RATIO}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onCropComplete}
                        cropShape="round"
                        showGrid={false}
                        style={{
                          containerStyle: {
                            backgroundColor: '#111827',
                          },
                        }}
                      />
                      {/* Zoom hint overlay */}
                      <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full pointer-events-none">
                        Scroll to zoom
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-center gap-4 mt-4 flex-wrap">
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={handleZoomOut}
                        className="p-3 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors shadow-sm"
                        title="Zoom out (-)"
                      >
                        <ZoomOut className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      </motion.button>
                      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-full px-4 py-2">
                        <input
                          type="range"
                          min={MIN_ZOOM}
                          max={MAX_ZOOM}
                          step={0.1}
                          value={zoom}
                          onChange={(e) => setZoom(parseFloat(e.target.value))}
                          className="w-36 h-2 bg-gray-300 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-teal-500"
                        />
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400 min-w-[3rem] text-right">
                          {zoom.toFixed(1)}x
                        </span>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={handleZoomIn}
                        className="p-3 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors shadow-sm"
                        title="Zoom in (+)"
                      >
                        <ZoomIn className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={handleReset}
                        className="p-3 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors shadow-sm"
                        title="Reset (R)"
                      >
                        <RotateCcw className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      </motion.button>
                    </div>

                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-3">
                      Drag to position • Scroll to zoom • Press R to reset
                    </p>

                    {/* Image Info */}
                    {imageDimensions && (
                      <p className="text-xs text-gray-400 text-center mt-1">
                        Original: {imageDimensions.width} × {imageDimensions.height}px
                      </p>
                    )}
                  </div>

                  {/* Preview Area */}
                  <div className={`${isFullscreen ? 'w-full' : 'lg:w-72'} flex flex-col items-center justify-center`}>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                      <Check className="h-4 w-4 text-teal-500" />
                      Preview
                    </h3>
                    <motion.div
                      className="w-40 h-40 lg:w-48 lg:h-48 rounded-full overflow-hidden border-4 border-teal-200 dark:border-teal-700 shadow-xl"
                      whileHover={{ scale: 1.05 }}
                      transition={{ type: 'spring', stiffness: 300 }}
                    >
                      {previewUrl ? (
                        <motion.img
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          src={previewUrl}
                          alt="Cropped preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
                          <Loader2 className="h-10 w-10 text-teal-500 animate-spin" />
                        </div>
                      )}
                    </motion.div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4 max-w-[200px]">
                      This is how your profile picture will appear across the app
                    </p>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setImageSrc(null);
                        setPreviewUrl(null);
                        setCrop({ x: 0, y: 0 });
                        setZoom(1);
                        setShowWarning(null);
                        setCurrentStep(1);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="mt-6 flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Choose different image
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Warning Message */}
            <AnimatePresence>
              {showWarning && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-lg text-sm flex items-start gap-2"
                >
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{showWarning}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-sm flex items-start gap-2"
                >
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

          {/* Footer */}
          <AnimatePresence>
            {imageSrc && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
              >
                <div className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                  Press <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">Ctrl+Enter</kbd> to save
                </div>
                <div className="flex items-center gap-3 ml-auto">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setImageSrc(null);
                      setCurrentStep(1);
                    }}
                    disabled={isUploading}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors font-medium flex items-center gap-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleUpload}
                    disabled={isUploading || !previewUrl}
                    className="px-6 py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white rounded-lg transition-all font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-teal-500/25"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Save Photo
                      </>
                    )}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ProfileImageUpload;
