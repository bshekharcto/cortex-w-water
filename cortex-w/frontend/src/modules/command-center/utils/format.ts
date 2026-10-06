/** Render a possibly-missing numeric/text value; missing data shows as an em dash, never a made-up number. */
export function fmt(value: number | string | null | undefined, suffix = ''): string {
  return value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;
}

/** "↑ 12%" / "↓ 38%" / "→ 0%"; empty when the trend isn't comparable. */
export function formatTrend(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return '';
  return `${pct > 0 ? '↑' : pct < 0 ? '↓' : '→'} ${Math.abs(pct)}%`;
}

/**
 * LoRa frequency for display. Upstream sends Hz (e.g. 865062500); shown as MHz (865.0625).
 * A value that is already small (< 10,000) is assumed to be MHz.
 */
export function formatFrequency(value: number | null | undefined, withUnit = false): string {
  if (value === null || value === undefined) return '—';
  const mhz = value >= 10000 ? value / 1e6 : value;
  return `${Number(mhz.toFixed(4))}${withUnit ? ' MHz' : ''}`;
}

/** Short label for the viewer's timezone, e.g. "GMT+5:30" or "UTC", used in column headers. */
export function localTzLabel(): string {
  try {
    const part = new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName');
    return part?.value ?? 'local';
  } catch {
    return 'local';
  }
}

/**
 * Local-time rendering of an ISO timestamp: "14:32:07" for today, "04 Oct 14:32:07" otherwise
 * (24-hour). Returns "—" for missing/invalid input. The raw UTC value is available via utcTitle().
 */
export function formatLocalTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const time = d.toLocaleTimeString('en-GB', { hour12: false });
  if (d.toDateString() === now.toDateString()) return time;
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return `${date} ${time}`;
}

/** Tooltip text with the exact UTC instant. */
export function utcTitle(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : `${d.toISOString().replace('T', ' ').slice(0, 23)} UTC`;
}

/** Yes / No / — for a flag that can be unknown (never shows "No" for a value we simply don't have). */
export function yesNo(v: boolean | null | undefined): string {
  return v === null || v === undefined ? '—' : v ? 'Yes' : 'No';
}

/** Status byte as hex plus decimal, e.g. "0xA8 (168)". */
export function formatStatusByte(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `0x${v.toString(16).toUpperCase().padStart(2, '0')} (${v})`;
}
