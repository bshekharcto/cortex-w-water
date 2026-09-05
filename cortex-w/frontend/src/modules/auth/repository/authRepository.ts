import { authApi } from '@/services/api/authApi';
import { setAuthToken, clearAuthState } from './authTokenStore';
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
    return { displayName: res.displayName, role: res.role };
  },

  async logout(): Promise<void> {
    try {
      await authApi.logout();
    } finally {
      clearAuthState();
    }
  },
};
