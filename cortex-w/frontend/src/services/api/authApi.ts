import { apiRequest } from './httpClient';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  displayName: string;
  role: string;
}

/**
 * Regardless of APP_DATA_MODE, the BFF always returns the token in the JSON
 * body to this client. In api mode the BFF itself is the one reading the
 * upstream's response header (Authorization or Jwt-Token, spec 20.2) — the
 * frontend never has to special-case that.
 */
export const authApi = {
  login: (req: LoginRequest) => apiRequest<LoginResponse>('/auth/login', { method: 'POST', body: req }),
  logout: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
};
