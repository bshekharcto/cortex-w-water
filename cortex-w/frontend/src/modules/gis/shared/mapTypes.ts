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
  /** 1 = the most valuable */
  gatewayNumber: number;
  latitude: number;
  longitude: number;
  /** Every meter within the radius, including those other gateways reach as well. */
  metersAssigned: number;
  /** Meters it newly brings into reach: no existing gateway reaches them, and each is counted for one new gateway only. */
  metersCoveredCount: number;
  /** metersCoveredCount as a share of all the meters planned for (0-100). */
  percentCovered?: number;
  /** What it adds on top of the gateways ranked before it. */
  addedInOrder?: number;
  /** Meters no other gateway (new or existing) reaches: lost without this one. */
  onlyThisOne?: number;
  avgDistanceM: number | null;
  maxDistanceM: number | null;
  coverageScore?: number;
  coverageRadiusM?: number;
  nearestExistingId?: string | null;
  nearestExistingName?: string | null;
  nearestExistingDistanceM?: number | null;
  assignedAssetIds: number[];
}

/** Which existing gateways are taken as already reaching the meters around them. */
export type ExistingMode = 'all' | 'working' | 'none';

/** Why the plan stopped adding gateways (see backend services/gatewayPlacement.ts). */
export type PlacementStopReason = 'no-meters' | 'already-covered' | 'all-covered' | 'target-reached' | 'low-gain' | 'max-gateways';

export interface GatewayPlacementResult {
  siteId: string;
  /** The most new gateways that were allowed. */
  gatewayCount?: number;
  coverageRadiusM?: number;
  existingMode?: ExistingMode;
  /** Every meter of the selection, with or without a position. */
  metersInSelection?: number;
  /** The meters planned for: those with a usable position. */
  totalMeters: number | null;
  /** Meters left out: no usable position. */
  excludedMeterCount: number;
  excludedAssetIds: number[];
  coordinatesStatus?: 'fresh' | 'stale' | 'unavailable';
  coveredByExisting?: number;
  newlyCovered?: number;
  totalMetersCovered: number;
  uncovered?: number;
  coverageBeforePercent?: number | null;
  overallCoveragePercent?: number | null;
  stopReason?: PlacementStopReason;
  /** What one more gateway would newly reach (null: nothing left to reach). */
  nextGain?: number | null;
  minNewMetersUsed?: number;
  targetCoveragePercent?: number;
  /** Coverage with 0, 1, 2 ... new gateways: the plan first, then estimates beyond it. */
  curve?: Array<{ newGateways: number; covered: number; percent: number }>;
  curveComplete?: boolean;
  /** Fewest new gateways for these coverage levels (null: more than the curve follows). */
  gatewaysFor?: Record<'90' | '95' | '99' | '100', number | null>;
  existingGatewaysCount?: number;
  existingCounted?: number;
  unplacedGatewaysCount?: number;
  gateways: GatewayCandidate[];
  computeMs?: number;
}
