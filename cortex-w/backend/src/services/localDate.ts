import { config } from '../config/env.js';

/**
 * Calendar date (YYYY-MM-DD) in the telemetry timezone (TELEMETRY_TIMEZONE,
 * Asia/Kolkata by default), `offsetDays` from today.
 *
 * Why not UTC: upstream groups readings into days by the site's local day, so
 * `date_key` on raw_telemetry_packets and `summary_date` on the rollup tables
 * are local-day keys (verified: 1, 5 and 6 Oct are 100% inside the IST day).
 * Anything that asks "what is today/yesterday/this month" against those keys
 * must use the same clock, or it is off by up to 5.5h around midnight.
 */
export function localDate(offsetDays = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: config.TELEMETRY_TIMEZONE }).format(new Date());
  if (offsetDays === 0) return today;
  // Shift the calendar date itself (not a timestamp), so it is DST-safe.
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}
