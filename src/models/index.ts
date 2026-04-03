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

// Room Visualization Types
export interface DevicePlacementMarker {
  deviceName: string;
  x: number;        // percentage (0-100) from left
  y: number;        // percentage (0-100) from top
  reason: string;
  icon: string;
}

export interface RoomVisualizationResult {
  markers: DevicePlacementMarker[];
  roomType: string;
  lightingQuality: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  wifiCoverageNote: string;
  generalInsight: string;
  demoMode?: boolean;
}
