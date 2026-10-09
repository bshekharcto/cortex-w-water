export type TrendMode = 'DAILY' | 'MONTHLY';

// One bucket of the consumption chart of an area: a day (2026-10-08) or a month (2026-10).
export interface TrendPoint {
  label: string;
  consumption: number; // KL used in that day / month by every meter under the area
  reading: number;     // sum of the meters' last reading of that day / month (KL)
}

// A zone / DMA boundary polygon.
export interface Boundary {
  id: string;
  name: string;
  siteId: number | null;
  points: Array<{ lat: number; lng: number }>;
}
