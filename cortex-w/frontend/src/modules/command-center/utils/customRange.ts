/** Mirrors the backend limit so a bad range is explained before any request is sent. */
export const MAX_RANGE_DAYS = 90;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns a user-facing reason the custom range can't be used, or null when it is valid. */
export function validateCustomRange(range: { from: string; to: string }): string | null {
  if (!range.from || !range.to) return 'Choose both a start and an end date';
  if (!DATE_RE.test(range.from) || !DATE_RE.test(range.to)) return 'Dates must be valid';
  if (range.from > range.to) return 'Start date must be on or before the end date';
  const days = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86400000) + 1;
  if (days > MAX_RANGE_DAYS) return `Range cannot exceed ${MAX_RANGE_DAYS} days (you chose ${days})`;
  return null;
}
