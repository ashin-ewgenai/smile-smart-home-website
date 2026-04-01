import { useState } from 'react';
import { useDevices } from '../contexts/DevicesContext';
import type { RecommendationRequest } from '../models';

/**
 * Hook for managing the recommendation form state and AI interaction.
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
    loading: devicesLoading
  } = useDevices();

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
    loading: recommendationLoading || devicesLoading,
    error,
    saveRecommendationToQuote,
    uid,
    devices,
    adminHealthStats,
    fetchAdminHealthOverview
  };
}

