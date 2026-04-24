import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useDevices } from '../contexts/DevicesContext';
import type { RecommendationRequest, DeviceRecommendation } from '../models';
import { quoteTemplates } from '../data/quoteTemplates';

const DEVICE_PRICES: Record<string, number> = {
  'Smart Color Bulb': 1500,
  'Smart Plug Set (4-pack)': 2400,
  'Floodlight Camera': 8500,
  'Pro Smart Lock': 12000,
  'Motion Sensor Pro': 3200,
  'Video Doorbell Elite': 6800,
  'Smart Home Hub Ultra': 9500,
  'Learning Thermostat': 8900,
  'In-Wall Dimmer': 2800,
  'Ambiance Light Strip': 4500,
  'Motorized Curtains': 15000,
  'Smart Speaker System': 8900
};

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
  const [lastInteractionTime, setLastInteractionTime] = useState<number>(Date.now());

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
        const doc = snap.docs[0];
        const data = doc.data();

        // Convert updatedAt to milliseconds for comparison
        // Firestore timestamps have toDate()
        const updatedAt = data.updatedAt?.toDate?.()?.getTime() || 0;

        // Only show acceptance if it's from a lead updated/created AFTER our last interaction
        if (updatedAt >= lastInteractionTime) {
          setAdminAccepted(!!data.adminAccepted);
          setAcceptedAt(data.acceptedAt || null);
        } else {
          // If the most recent lead is OLD, don't show its acceptance status
          setAdminAccepted(false);
          setAcceptedAt(null);
        }
      } else {
        setAdminAccepted(false);
        setAcceptedAt(null);
      }
    });

    return () => unsubscribe();
  }, [uid, lastInteractionTime]);

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
      estimatedPrice: DEVICE_PRICES[deviceName] || 0
    }));

    setLocalRecommendations(templateDevices);

    // Auto-fill form data if applicable
    if (template.propertyType) updateFormData({ houseSize: template.propertyType });

    setAdminAccepted(false);
    setLastInteractionTime(Date.now());
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
    setAdminAccepted(false);
    setLastInteractionTime(Date.now());
    await fetchRecommendations(formData);
    nextStep(); // Move to results step
  };

  const resetForm = () => {
    setStep(1);
    setSelectedTemplateId(null);
    setAdminAccepted(false);
    setLastInteractionTime(Date.now());
    setFormData({
      houseSize: '',
      budget: 1500,
      securityNeeds: 'Medium',
      preferences: []
    });
  };


  // Predictive Health Alerts Exposure
  const criticalHealthAlerts = React.useMemo(() => {
    return devices.filter(d => 
      (d.health?.score || 100) < 50 || 
      d.health?.forecast?.includes('Failure') ||
      (d.health?.alerts && d.health.alerts.some(a => a.includes('🔴') || a.toLowerCase().includes('critical')))
    );
  }, [devices]);

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
    criticalHealthAlerts, // Exposed for real-time dashboard notifications
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
