import { differenceInMinutes, differenceInHours, differenceInDays, format, parseISO } from 'date-fns';

/**
 * Spec 34 requires showing relative age + exact timestamp:
 *   "18 min ago"   tooltip: "04 Sep 2026, 23:45 IST"
 *
 * Use decoded/last-seen (arrival time) for freshness, not MeterTimestamp.
 */
export function relativeAge(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return 'Never';
  const ts = parseISO(isoTimestamp);
  const now = new Date();
  const mins = differenceInMinutes(now, ts);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = differenceInHours(now, ts);
  if (hrs < 48) return `${hrs}h ago`;
  return `${differenceInDays(now, ts)}d ago`;
}

export function formatTimestamp(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return '—';
  return format(parseISO(isoTimestamp), 'dd MMM yyyy, HH:mm');
}

export function formatDateParam(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}
