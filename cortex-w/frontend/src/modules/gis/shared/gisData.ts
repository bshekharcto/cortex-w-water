export interface MeterDailyReading {
  date: string;
  shortDate: string;
  consumptionL: number;
  consumptionM3: number;
  readingM3: number;
  minFlowLph: number;
  maxFlowLph: number;
  uplinksReceived: number;
  uplinksExpected: number;
  flag: 'Normal' | 'Peak' | 'Leak Risk' | 'Zero Flow';
}

export interface MeterAlert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'Leakage' | 'Hardware' | 'RF Link' | 'Billing' | 'Tamper';
  title: string;
  description: string;
  timestamp: string;
  status: 'Active' | 'Investigating' | 'Resolved';
}

export interface GisMeter {
  id?: string | number;
  assetId?: number;
  meterId: string;
  devEui: string;
  householdId: string;
  householdShortId: string;
  householdName: string;
  locality: string;
  lat: number;
  lng: number;
  gatewayId: string;
  gatewayAlias: string;
  distanceMeters: number;
  rssi: number;
  snr: number;
  // connected / disconnected / never (the same three everywhere)
  status: 'connected' | 'disconnected' | 'never';
  lastSeen: string;
  pipeDiameter: string;
  connectionType: string;
  installDate: string;
  currentReadingM3: number;
  yesterdayConsumptionL: number;
  yesterdayConsumptionM3: number;
  monthConsumptionL: number;
  monthConsumptionM3: number;
  estimatedBillInr: number;
  currentFlowRateLph: number;
  dailyAvgL: number;
  last10DaysReadings: MeterDailyReading[];
  alerts: MeterAlert[];
  city?: 'Bhubaneswar' | 'Puri' | 'Cuttack' | string;
}

export const BHUBANESWAR_CENTER = {
  lat: 20.2961,
  lng: 85.8245,
};
