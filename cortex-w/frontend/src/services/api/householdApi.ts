import { apiRequest } from './httpClient';
import type { HouseholdDTO } from '@/modules/consumer/households/types/household.types';
import type { SpringPage } from '@/modules/dashboard/types/dashboard.types';
import type { GisMeter, MeterDailyReading } from '@/modules/gis/shared/gisData';

export interface HouseholdListFilter {
  page: number;
  size: number;
  search?: string;
  city?: string;
  siteIds?: number[];
}

export interface HouseholdDetailResponse {
  consumer: {
    id: number | null;
    customId: string;
    name: string;
    location: string;
    ward: string;
    mobile: string;
    siteName: string;
    status: string;
    registrationDate: string;
    city?: string;
    lat?: number | null;
    lng?: number | null;
  };
  meters: Array<{
    meterNumber: string;
    replacedFrom?: string;
    replacedBy?: string;
    replacementDate?: string;
    startReading?: number;
    endReading?: number;
    totalConsumption?: number;
    dailyReadings?: Array<{ date: string; reading: number; consumption: number }>;
  }>;
  activeMeter: GisMeter | null;
  dailyReadings: MeterDailyReading[];
  latestBill?: {
    billNumber: string;
    billDate: string;
    dueDate: string;
    totalAmount: number;
    waterCharges: number;
    sewerageCharges: number;
    status: string;
    paymentDate?: string;
  };
}

export const householdApi = {
  list: (filter: HouseholdListFilter) =>
    apiRequest<SpringPage<HouseholdDTO>>('/households/page', { method: 'POST', body: filter }),

  get: (id: number | string) => apiRequest<HouseholdDTO>(`/households/${id}`),

  getDetail: (idOrCustomId: number | string) =>
    apiRequest<HouseholdDetailResponse>(`/households/${encodeURIComponent(idOrCustomId)}/detail`),

  create: (payload: Omit<HouseholdDTO, 'id'>) =>
    apiRequest<HouseholdDTO>('/households', { method: 'POST', body: payload }),

  update: (id: number, patch: Partial<HouseholdDTO>) =>
    apiRequest<HouseholdDTO>(`/households/${id}`, { method: 'PATCH', body: patch }),

  remove: (id: number) => apiRequest<void>(`/households/${id}`, { method: 'DELETE' }),

  meterHistory: (householdId: string) =>
    apiRequest<Array<{ assetId: string; meterId: string; installedAt: string; removedAt?: string }>>(
      `/households/${householdId}/meter-history`,
    ),

  consumerLookup: (searchType: 'CONSUMER_ID' | 'METER_NUMBER', value: string, fromDate: string, toDate: string) =>
    apiRequest<{
      consumer: HouseholdDTO;
      meters: Array<{ assetId: string; meterId: string; startReading: number; endReading: number; totalConsumption: number }>;
    }>('/households/lookup', { method: 'POST', body: { searchType, value, fromDate, toDate } }),
};
