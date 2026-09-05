import { apiRequest } from './httpClient';

export interface AssetSearchResult {
  assetId: string;
  meterId: string;
  householdId?: string;
  siteId: number;
}

export const assetApi = {
  /** query is a pre-built DSL string, see services/api/queryDsl.ts */
  search: (query: string) => apiRequest<AssetSearchResult[]>('/assets/query', { method: 'POST', body: { query } }),
};
