import { authApi } from '@/services/api/authApi';
import { apiRequest } from '@/services/api/httpClient';
import { setAuthToken, setStoredUser, clearAuthState } from './authTokenStore';
import type { AuthenticatedUser } from '../types/auth.types';

/**
 * Unlike other modules, auth does not need a Seed/Api repository pair on
 * the frontend: the Cortex-W backend already branches on APP_DATA_MODE for
 * /auth/login (accepting seed/demo roles in seed mode, calling the real
 * upstream login in api mode). The frontend always talks to one endpoint.
 */
export const authRepository = {
  async login(username: string, password: string): Promise<AuthenticatedUser> {
    const res = await authApi.login({ username, password });
    setAuthToken(res.token);
    // asked now, so a client without billing never sees the Billing menu, even for a moment
    const brand = await apiRequest<{ hideBilling?: boolean }>('/dashboard/client').catch(() => null);
    const user = { displayName: res.displayName, role: res.role, roles: res.roles ?? [res.role], hideBilling: brand?.hideBilling === true };
    setStoredUser(user);
    return user;
  },

  async logout(): Promise<void> {
    try {
      await authApi.logout();
    } finally {
      clearAuthState();
    }
  },
};
