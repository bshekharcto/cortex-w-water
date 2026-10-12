import type { MeterDayRow } from '@/services/api/mapApi';

export interface DaySummary {
  days: number;
  totalL: number;
  avgL: number;
  maxL: number | null;
  minL: number | null;
}

/** Totals over the days that exist. With no days every figure is null/0: there is no "Infinity" and no invented baseline. */
export function summarizeDays(days: ReadonlyArray<Pick<MeterDayRow, 'consumptionL'>>): DaySummary {
  if (days.length === 0) return { days: 0, totalL: 0, avgL: 0, maxL: null, minL: null };
  const values = days.map((d) => d.consumptionL || 0);
  const totalL = values.reduce((a, b) => a + b, 0);
  return { days: days.length, totalL, avgL: Math.round(totalL / days.length), maxL: Math.max(...values), minL: Math.min(...values) };
}

/** "865.2 MHz" from the frequency in Hz; a dash when unknown. */
export function formatMHz(hz: number | null | undefined): string {
  return hz == null || !Number.isFinite(hz) || hz <= 0 ? '—' : `${(hz / 1e6).toFixed(1)} MHz`;
}

/**
 * Header line under the meter id: only the parts that are known, never "Ward ()". While the details are still on their
 * way a missing name reads "Loading consumer…", not "not linked" (which would be a claim nobody has checked yet).
 */
export function consumerHeadline(p: { name: string | null; ward: string | null; id: string | null; loading?: boolean }): string {
  const parts = [p.name || (p.loading ? 'Loading consumer…' : 'Consumer not linked')];
  if (p.ward) parts.push(`Ward ${p.ward}`);
  if (p.id) parts.push(p.id);
  return parts.join(' · ');
}

export type ShownStatus = { label: string; cssKey: string };

/** The badge for a meter: the Network Explorer's live / stale / silent / never, or the older active / weak / silent. */
export function statusBadge(status: string | null | undefined): ShownStatus {
  const key = (status || '').toLowerCase();
  if (!key) return { label: '—', cssKey: 'never' };
  return { label: key === 'never' ? 'NEVER SEEN' : key.toUpperCase(), cssKey: key };
}

/** Short csv-safe text. */
export const csvCell = (v: unknown): string => {
  const t = v == null ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** True for an API error that means "your session is over" (the sign-in token is expired or no longer accepted). */
export const isUnauthorized = (e: unknown): boolean => (e as { status?: number } | null)?.status === 401;

/** "11 Oct, 14:32:07 GMT+5:30": the viewer's own clock with the zone named, so a time is never ambiguous. */
export function formatStamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour12: false });
  let zone = '';
  try {
    zone = new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' }).formatToParts(d).find((x) => x.type === 'timeZoneName')?.value ?? '';
  } catch {
    zone = '';
  }
  return `${date}, ${time}${zone ? ` ${zone}` : ''}`;
}
