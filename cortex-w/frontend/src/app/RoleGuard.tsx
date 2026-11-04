import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { canAccessPath } from '@/modules/auth/access';

/** Sends a user to the Dashboard when their role has no access to the page they opened (e.g. a typed address). */
export function RoleGuard() {
  const user = useAuth((s) => s.user);
  const { pathname } = useLocation();
  if (!canAccessPath(user, pathname)) return <Navigate to="/app/dashboard" replace />;
  return <Outlet />;
}
