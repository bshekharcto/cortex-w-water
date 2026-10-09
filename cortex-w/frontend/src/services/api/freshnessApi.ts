import { apiRequest } from './httpClient';

export interface DataFreshness {
  /** When the cortex history scheduler last updated the numbers (every 15 minutes); null before its first run. */
  updatedAt: string | null;
  /** The same moment as clock time at the site: "2026-10-09 18:15:00". */
  localTime: string | null;
}

/** When the numbers were last updated. Cheap, so the pages can ask it every minute. */
export async function fetchDataFreshness(): Promise<DataFreshness> {
  return apiRequest<DataFreshness>('/dashboard/freshness');
}
