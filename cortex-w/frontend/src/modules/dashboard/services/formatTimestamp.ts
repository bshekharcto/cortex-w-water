import { formatTimestamp } from '@/utils/date';

/**
 * Date AND time for a timestamp column ("06 Oct 2026, 08:30"), so a stale or
 * disconnected meter can't look current by showing only an HH:MM. Returns
 * `fallback` for a missing or unparseable value instead of throwing.
 */
export function formatDateTimeCell(iso: string | null | undefined, fallback = '—'): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? fallback : formatTimestamp(d.toISOString());
}
