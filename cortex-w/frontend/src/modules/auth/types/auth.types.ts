export interface AuthenticatedUser {
  displayName: string;
  role: 'Admin' | 'Operations' | 'Billing' | string;
  /** Every role the user holds (`role` is the first). */
  roles?: string[];
  /** The client has no billing: no Billing page, tab or bill figures anywhere. */
  hideBilling?: boolean;
}

export interface AuthState {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
}
