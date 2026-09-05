import { apiRequest } from './httpClient';

export interface SiteDTO {
  id: number;
  name: string;
}

export const siteApi = {
  list: () => apiRequest<SiteDTO[]>('/sites'),
};
