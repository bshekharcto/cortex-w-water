import { apiRequest } from './httpClient';
import type { BillDTO, BillingSlabDTO } from '@/modules/consumer/billing/types/billing.types';
import type { SpringPage } from '@/modules/dashboard/types/dashboard.types';

/**
 * Upstream draws a hard, easy-to-miss line between `POST /api/billing`
 * (list, no trailing slash) and `POST /api/billing/` (create, trailing
 * slash required) — spec 26.1/26.2/28.3. That distinction is preserved
 * inside the BFF's billing route handler. The frontend calls two clearly
 * named, unambiguous BFF routes so no one can collapse them back together
 * "for consistency."
 */
export const billingApi = {
  list: (filter: { page: number; size: number; startDate?: string; endDate?: string }) =>
    apiRequest<SpringPage<BillDTO>>('/billing/list', { method: 'POST', body: filter }),

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
