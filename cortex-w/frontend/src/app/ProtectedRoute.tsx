import { Navigate, Outlet } from 'react-router-dom';
import { getAuthToken } from '@/modules/auth/repository/authTokenStore';

/**
 * Checks for a stored token, not full Zustand auth state — the store is
 * empty on a hard refresh until something re-hydrates it, but the token in
 * sessionStorage already survives the refresh (spec 6: "a page refresh must
 * preserve deep links"). httpClient will still 401 -> redirect if the token
 * turns out to be invalid/expired.
 */
export function ProtectedRoute() {
  const token = getAuthToken();
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}
