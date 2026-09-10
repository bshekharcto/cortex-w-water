export type DashboardScope =
  | { level: 'GLOBAL' }
  | { level: 'ZONE'; zoneId: string; zoneName: string }
  | { level: 'DMA'; zoneId: string; zoneName: string; dmaId: string; dmaName: string };
