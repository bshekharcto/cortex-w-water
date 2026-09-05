import { create } from 'zustand';
import { authRepository } from '../repository/authRepository';
import type { AuthState, AuthenticatedUser } from '../types/auth.types';

interface AuthStore extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrateFromSession: (user: AuthenticatedUser) => void;
}

/**
 * Zustand used only for this small slice of app-wide state, per spec 2.3 /
 * 31 ("Zustand or Context only for light application state"). All server
 * data (dashboard, meters, etc.) goes through TanStack Query instead — see
 * services/api and each module's hooks/.
 */
export const useAuth = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,

  login: async (username, password) => {
    const user = await authRepository.login(username, password);
    set({ user, isAuthenticated: true });
  },

  logout: async () => {
    await authRepository.logout();
    set({ user: null, isAuthenticated: false });
  },

  hydrateFromSession: (user) => set({ user, isAuthenticated: true }),
}));
