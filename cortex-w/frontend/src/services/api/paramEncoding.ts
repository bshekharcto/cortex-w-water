/**
 * Most upstream quirks (spec 28.1/28.2) are absorbed server-side by the
 * Cortex-W backend now, so the frontend mostly sends plain, consistent
 * params. This file stays for the handful of pass-through cases where a
 * page needs to build a filter payload shape the BFF forwards close to
 * verbatim (e.g. the asset query DSL used by billing meter search).
 */

/** siteIds as a comma-joined string, when a BFF endpoint documents that it forwards this way. */
export function encodeSiteIdsCsv(siteIds: number[]): string {
  return siteIds.join(',');
}

/** siteIds as repeated query params, when a BFF endpoint documents that it forwards this way. */
export function encodeSiteIdsRepeated(siteIds: number[]): Record<string, string> {
  // URLSearchParams supports repeated keys via append; callers should use
  // a URLSearchParams instance directly for this case rather than a plain
  // object. This helper documents the shape for reference/tests.
  return siteIds.reduce<Record<string, string>>((acc, id, i) => {
    acc[`siteIds[${i}]`] = String(id);
    return acc;
  }, {});
}
