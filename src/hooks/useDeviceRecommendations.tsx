import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useDevices } from '../contexts/DevicesContext';
import type { RecommendationRequest, DeviceRecommendation } from '../models';
import { quoteTemplates } from '../data/quoteTemplates';

/**
 * Hook for managing the recommendation form state and API interaction.
 */
export function useDeviceRecommendations() {
  const { 
    fetchRecommendations, 
    recommendations: contextRecommendations, 
    recommendationLoading, 
    error, 
    saveRecommendationToQuote, 
    uid, 
    devices, 
    adminHealthStats, 
    fetchAdminHealthOverview,
    // Room Visualization
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
    userPlannerLeads,
    showNotification,
    // Energy Savings from Context
    savingsData,
    calculateSavings
  } = useDevices();

  const [adminAccepted, setAdminAccepted] = useState<boolean>(false);
  const [acceptedAt, setAcceptedAt] = useState<any>(null);

  // Predefined Templates state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [localRecommendations, setLocalRecommendations] = useState<DeviceRecommendation[]>([]);

  // Sync local recommendations with context unless a template is selected
  useEffect(() => {
    if (!selectedTemplateId) {
      setLocalRecommendations(contextRecommendations);
    }
  }, [contextRecommendations, selectedTemplateId]);

  // Use useEffect to subscribe to acceptance status changes in real-time
  useEffect(() => {
    if (!uid) return;
    
    // Find the most recent AI Consultant request for this user
    const q = query(
      collection(db, 'Planner_Leads'),
      where('uid', '==', uid),
      where('source', '==', 'ai_consultant'),
      orderBy('updatedAt', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setAdminAccepted(!!data.adminAccepted);
        setAcceptedAt(data.acceptedAt || null);
      }
    });

    return () => unsubscribe();
  }, [uid]);

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

  const applyTemplate = (templateId: string) => {
    const template = quoteTemplates.find(t => t.id === templateId);
    if (!template) return;

    setSelectedTemplateId(templateId);
    
    // Create recommendation objects from template devices
    // Since we don't have full device details here, we'll create representative mocks
    // that match the DeviceRecommendation interface
    const templateDevices: DeviceRecommendation[] = template.devices.map(deviceName => ({
      name: deviceName,
      category: 'Smart Bundle',
      reason: `Included in the ${template.name}`,
      estimatedPrice: 0 // Prices will be determined by admin
    }));

    setLocalRecommendations(templateDevices);
    
    // Auto-fill form data if applicable
    if (template.propertyType) updateFormData({ houseSize: template.propertyType });
    
    setStep(4); // Jump to results
  };

  const nextStep = () => setStep(prev => prev + 1);
  const prevStep = () => setStep(prev => prev - 1);

  const handleSubmit = async () => {
    if (!window.navigator.onLine) {
      showNotification({
        message: 'No internet connection. Please check your network and try again.',
        type: 'error'
      });
      return;
    }

    setSelectedTemplateId(null); // Clear template if manual AI search is used
    await fetchRecommendations(formData);
    nextStep(); // Move to results step
  };

  const resetForm = () => {
    setStep(1);
    setSelectedTemplateId(null);
    setFormData({
      houseSize: '',
      budget: 1500,
      securityNeeds: 'Medium',
      preferences: []
    });
  };


  return {
    step,
    setStep,
    formData,
    updateFormData,
    nextStep,
    prevStep,
    handleSubmit,
    resetForm,
    recommendations: localRecommendations,
    loading: recommendationLoading,
    error,
    saveRecommendationToQuote,
    uid,
    devices,
    adminHealthStats,
    fetchAdminHealthOverview,
    // Room Visualization
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
    adminAccepted,
    acceptedAt,
    // Savings Calculator
    calculateSavings,
    savingsData,
    // Templates
    selectedTemplateId,
    applyTemplate,
    quoteTemplates
  };
}
