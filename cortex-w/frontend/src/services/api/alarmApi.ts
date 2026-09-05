import { apiRequest } from './httpClient';
import type {
  AlertDTO,
  AlertListFilter,
  AlertStats,
  AlertDetailResponse,
} from '@/modules/ai-analysis/alarms/types/alarm.types';
import type { SpringPage } from '@/modules/dashboard/types/dashboard.types';

export type AlertPageResponse = SpringPage<AlertDTO> & {
  stats?: AlertStats;
};

export const alarmApi = {
  /**
   * Fetch paginated live field alerts from Cognecto.
   */
  list: (filter: AlertListFilter) =>
    apiRequest<AlertPageResponse>('/alarms/list', { method: 'POST', body: filter }),

  /**
   * Fetch composite 360 alert detail including S3 field photos and meter telemetry.
   */
  getDetail: (idOrCode: number | string) =>
    apiRequest<AlertDetailResponse>(`/alarms/${encodeURIComponent(idOrCode)}/detail`),

  /**
   * Single alarm by ID.
   */
  get: (id: number | string) => apiRequest<AlertDTO>(`/alarms/${id}`),

  /**
   * Update alarm status (e.g. resolve / acknowledge).
   */
  updateStatus: (id: number | string, status: string) =>
    apiRequest<{ id: string | number; status: string }>(`/alarms/${id}/status`, {
      method: 'PATCH',
      body: { status },
    }),
};
