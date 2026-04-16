import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useDevices } from '../contexts/DevicesContext';
import type { RecommendationRequest } from '../models';

/**
 * Hook for managing the recommendation form state and API interaction.
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

    await fetchRecommendations(formData);
    nextStep(); // Move to results step
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
    step,
    setStep,
    formData,
    updateFormData,
    nextStep,
    prevStep,
    handleSubmit,
    resetForm,
    recommendations,
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
    savingsData
  };
}
