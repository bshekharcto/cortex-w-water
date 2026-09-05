export interface AuthenticatedUser {
  displayName: string;
  role: 'Admin' | 'Operations' | 'Billing' | string;
}

export interface AuthState {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
}
