import { create } from 'zustand';
import { authRepository } from '../repository/authRepository';
import { getStoredUser, setStoredUser } from '../repository/authTokenStore';
import type { AuthState, AuthenticatedUser } from '../types/auth.types';

interface AuthStore extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrateFromSession: (user: AuthenticatedUser) => void;
  setHideBilling: (hide: boolean) => void;
}

/**
 * Zustand used only for this small slice of app-wide state, per spec 2.3 /
 * 31 ("Zustand or Context only for light application state"). All server
 * data (dashboard, meters, etc.) goes through TanStack Query instead — see
 * services/api and each module's hooks/.
 */
export const useAuth = create<AuthStore>((set) => ({
  // restored after a refresh, when the token is still in the tab's session
  user: getStoredUser(),
  isAuthenticated: getStoredUser() !== null,

  login: async (username, password) => {
    const user = await authRepository.login(username, password);
    set({ user, isAuthenticated: true });
  },

  logout: async () => {
    await authRepository.logout();
    set({ user: null, isAuthenticated: false });
  },

  hydrateFromSession: (user) => set({ user, isAuthenticated: true }),

  // a session started before the flag existed learns it from the client's settings
  setHideBilling: (hide) =>
    set((s) => {
      if (!s.user || (s.user.hideBilling === true) === hide) return s;
      const user = { ...s.user, hideBilling: hide };
      setStoredUser(user);
      return { user };
    }),
}));
