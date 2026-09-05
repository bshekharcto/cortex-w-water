import { apiRequest } from './httpClient';
import type {
  BillDTO,
  BillingSlabDTO,
  BillingListFilter,
  BillingStats,
  BillDetailResponse,
} from '@/modules/consumer/billing/types/billing.types';
import type { SpringPage } from '@/modules/dashboard/types/dashboard.types';

export type BillingPageResponse = SpringPage<BillDTO> & {
  stats?: BillingStats;
};

export const billingApi = {
  /**
   * List bills with date range, search, pagination, and status filters.
   * Default date range is 2026-01-01 to 2026-02-28 to capture live Cognecto records.
   */
  list: (filter: BillingListFilter) =>
    apiRequest<BillingPageResponse>('/billing/list', { method: 'POST', body: filter }),

  /**
   * Composite 360 Bill Detail with live meter telemetry and slab breakdown.
   */
  getDetail: (idOrCustomId: number | string) =>
    apiRequest<BillDetailResponse>(`/billing/${encodeURIComponent(idOrCustomId)}/detail`),

  create: (payload: Omit<BillDTO, 'id' | 'amount' | 'billCharges'>) =>
    // Server computes amount/billCharges — spec 26.8. Never calculated client-side.
    apiRequest<BillDTO>('/billing/create', { method: 'POST', body: payload }),

  latestBill: (assetId: string) => apiRequest<BillDTO | null>(`/billing/latest/${assetId}`),

  header: (siteId: number) => apiRequest<{ siteName: string; billingCycle: string }>(`/billing/header/${siteId}`),

  listSlabs: (siteIds: number[]) =>
    apiRequest<BillingSlabDTO[]>('/billing/slabs', { query: { siteIds: siteIds.join(',') } }),

  createSlab: (slab: Omit<BillingSlabDTO, 'id'>) =>
    apiRequest<BillingSlabDTO>('/billing/slabs', { method: 'POST', body: slab }),

  updateSlab: (id: number, patch: Partial<BillingSlabDTO>) =>
    apiRequest<BillingSlabDTO>(`/billing/slabs/${id}`, { method: 'PATCH', body: patch }),

  deleteSlab: (id: number) => apiRequest<void>(`/billing/slabs/${id}`, { method: 'DELETE' }),

  deleteBill: (id: number) => apiRequest<void>(`/billing/${id}`, { method: 'DELETE' }),
};
