import type { AuthenticatedUser } from './types/auth.types';

/** Parts of the app an Operator does not get: hidden from the menu and refused if the address is typed in. */
const OPERATOR_BLOCKED_PATHS = [
  '/app/settings',
  '/app/ai/hydraulic',
  '/app/consumer/billing',
  '/app/gis/gateway-status',
];

const BILLING_PATH = '/app/consumer/billing';

/** Whether bills, tariffs and the Billing page are shown to this user (not for a client that has billing switched off). */
export function canSeeBilling(user: AuthenticatedUser | null | undefined): boolean {
  return user?.hideBilling !== true;
}

export function isOperator(user: AuthenticatedUser | null | undefined): boolean {
  if (!user) return false;
  return [user.role, ...(user.roles ?? [])].some((r) => r.toLowerCase() === 'operator');
}

/** Whether the user may open this address. */
export function canAccessPath(user: AuthenticatedUser | null | undefined, pathname: string): boolean {
  if (!canSeeBilling(user) && (pathname === BILLING_PATH || pathname.startsWith(`${BILLING_PATH}/`))) return false;
  if (!isOperator(user)) return true;
  return !OPERATOR_BLOCKED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
