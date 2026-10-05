/** Render a possibly-missing numeric/text value; missing data shows as an em dash, never a made-up number. */
export function fmt(value: number | string | null | undefined, suffix = ''): string {
  return value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;
}

/** "↑ 12%" / "↓ 38%" / "→ 0%"; empty when the trend isn't comparable. */
export function formatTrend(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return '';
  return `${pct > 0 ? '↑' : pct < 0 ? '↓' : '→'} ${Math.abs(pct)}%`;
}
