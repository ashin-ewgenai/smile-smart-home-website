export * from './Collections';

// Device Recommendation Types
export interface DeviceRecommendation {
  name: string;
  category: string;
  reason: string;
  estimatedPrice: number;
  imageUrl?: string;
}

export interface RecommendationRequest {
  houseSize: string;
  budget: number;
  securityNeeds: 'Low' | 'Medium' | 'High' | string;
  preferences?: string[];
}
