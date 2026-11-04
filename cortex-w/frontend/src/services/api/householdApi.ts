import { apiRequest } from './httpClient';
import type { HouseholdDTO } from '@/modules/consumer/households/types/household.types';
import type { SpringPage } from '@/modules/dashboard/types/dashboard.types';
import type { MeterDayRow } from './mapApi';

export interface HouseholdListFilter {
  page: number;
  size: number;
  search?: string;
  siteIds?: number[];
  sort?: HouseholdSortField;
  dir?: 'asc' | 'desc';
}

export type HouseholdSortField = 'customId' | 'name' | 'location' | 'mobile' | 'status' | 'registrationDate';

export interface HouseholdSummary {
  /** Every household of the client; null when the count could not be read. */
  total: number | null;
  /** The client's top-level sites with their household counts. */
  sites: Array<{ id: number; name: string; count: number | null }>;
}

export interface HouseholdConsumer {
  id: number | null;
  customId: string | null;
  name: string | null;
  location: string | null;
  ward: string | null;
  mobile: string | null;
  countryCode: string | null;
  pinCode: string | null;
  zone: string | null;
  locality: string | null;
  dma: string | null;
  siteId: number | null;
  siteName: string | null;
  status: string | null;
  registrationDate: string | null;
}

export interface HouseholdMeterInfo {
  meterId: string;
  assetId: number;
  siteId: number | null;
  isActive: boolean;
  installedDate: string | null;
  ward: string | null;
  devEui: string | null;
  lastSeen: string | null;
  readingM3: number | null;
  rssi: number | null;
  snr: number | null;
  gatewayId: string | null;
}

/** Who the household is, its meters and the primary meter's readings: the part that opens the drawer. */
export interface HouseholdCore {
  consumer: HouseholdConsumer;
  meters: HouseholdMeterInfo[];
  primaryMeterId: string | null;
  /** Oldest first, only days that have a reading (up to 10). */
  readings: MeterDayRow[];
  yesterdayM3: number | null;
  monthToDateM3: number | null;
}

export interface BillCharge {
  chargeName: string;
  type?: string;
  rate?: number;
  amountCharged?: number;
}

export interface HouseholdBill {
  date?: string;
  dueDate?: string;
  startDate?: string;
  endDate?: string;
  amount?: number;
  totalAmount?: number;
  prevReading?: number;
  currentReading?: number;
  consumption?: number;
  status?: string;
  billCharges?: BillCharge[];
}

export interface TariffSlab {
  minUnits: number;
  maxUnits: number | null;
  ratePerUnit: number;
}

export interface HouseholdBills {
  latestBill: HouseholdBill | null;
  slabs: TariffSlab[];
  unavailable: string[];
}

export interface HouseholdHardware {
  meter: HouseholdMeterInfo | null;
  lastFrame?: { time: string; frequencyHz: number | null; dataRate: number | null; adr: boolean | null; fCnt: number | null } | null;
}

export interface MeterPhotoInfo {
  documentId?: number;
  name: string;
  category: string;
  url: string;
  uploadDate?: string;
}

export interface HouseholdDocuments {
  photos: MeterPhotoInfo[];
  replacement: {
    oldMeterNumber: string;
    oldMeterReading: number;
    newMeterNumber: string;
    newMeterReading?: number;
    date: string | null;
    status: string | null;
  } | null;
  unavailable: string[];
}

const part = (id: number | string, name: string) => `/households/${encodeURIComponent(id)}/${name}`;

export const householdApi = {
  list: (filter: HouseholdListFilter, signal?: AbortSignal) =>
    apiRequest<SpringPage<HouseholdDTO>>('/households/page', { method: 'POST', body: filter, signal }),

  summary: (signal?: AbortSignal, refresh = false) =>
    apiRequest<HouseholdSummary>('/households/summary', { signal, query: refresh ? { refresh: '1' } : undefined }),

  core: (id: number | string) => apiRequest<HouseholdCore>(part(id, 'core')),
  bills: (id: number | string) => apiRequest<HouseholdBills>(part(id, 'bills')),
  hardware: (id: number | string) => apiRequest<HouseholdHardware>(part(id, 'hardware')),
  documents: (id: number | string) => apiRequest<HouseholdDocuments>(part(id, 'documents')),
};
