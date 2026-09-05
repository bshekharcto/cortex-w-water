export interface SensorRawDataDTO {
  timestamp: string;
  latitude: number;
  longitude: number;
  vehicleStatus: string;
  altitude: string;
  siteId: number;
}

export interface GeofenceDTO {
  id?: number;
  name: string;
  address?: string;
  radius?: number; // non-null radius => treat as a gateway, spec 21.8
  type: string;
  color?: string;
  siteId: number;
  assetId?: number;
  geofenceCoordinates: Array<{ latitude: number; longitude: number }>;
  assetList?: number[];
  isDisabled: boolean;
  outAlertEnabled: boolean;
}

export interface GatewayCandidate {
  gatewayNumber: number;
  latitude: number;
  longitude: number;
  metersAssigned: number;
  metersCoveredCount: number;
  percentCovered?: number;
  avgDistanceM: number | null;
  maxDistanceM: number | null;
  coverageScore?: number;
  coverageRadiusM?: number;
  nearestExistingName?: string | null;
  nearestExistingDistanceM?: number | null;
  assignedAssetIds: number[];
}

export interface GatewayPlacementResult {
  siteId: number;
  totalMeters: number;
  totalMetersCovered: number;
  overallCoveragePercent?: number;
  excludedMeterCount: number;
  excludedAssetIds: number[];
  gateways: GatewayCandidate[];
  existingGatewaysCount?: number;
}

