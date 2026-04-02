import { useState, useCallback, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useDevices } from '../contexts/DevicesContext';
import { uploadRoomPhoto } from '../lib/firebase';
import { functions } from '../lib/firebase';
import type { RecommendationRequest, RoomVisualizationResult } from '../models';

/**
 * Hook for managing the recommendation form state, AI interaction,
 * and the new Room Visualization feature.
 */
export function useDeviceRecommendations() {
  const { 
    fetchRecommendations, 
    recommendations, 
    recommendationLoading, 
    error, 
    saveRecommendationToQuote, 
    uid,
    devices,
    adminHealthStats,
    fetchAdminHealthOverview,
    loading: devicesLoading,
    // Room visualization from context
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
  } = useDevices();

  // ── Recommendation form local state (specific to this form instance) ──────
  const [step, setStep] = useState<number>(1);
  const [formData, setFormData] = useState<RecommendationRequest>({
    houseSize: '',
    budget: 1500,
    securityNeeds: 'Medium',
    preferences: []
  });

  const updateFormData = (data: Partial<RecommendationRequest>) => {
    setFormData(prev => ({ ...prev, ...data }));
  };

  const nextStep = () => setStep(prev => prev + 1);
  const prevStep = () => setStep(prev => prev - 1);

  const handleSubmit = async () => {
    await fetchRecommendations(formData);
    nextStep();
  };

  const resetForm = () => {
    setStep(1);
    setFormData({
      houseSize: '',
      budget: 1500,
      securityNeeds: 'Medium',
      preferences: []
    });
  };

  return {
    // Recommendation form
    step,
    setStep,
    formData,
    updateFormData,
    nextStep,
    prevStep,
    handleSubmit,
    resetForm,
    recommendations,
    loading: recommendationLoading || devicesLoading,
    error,
    saveRecommendationToQuote,
    uid,
    devices,
    adminHealthStats,
    fetchAdminHealthOverview,
    // Room visualization (now from context)
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
  };
}
