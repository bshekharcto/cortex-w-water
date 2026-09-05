/**
 * Spec 17.3 — every seed dataset must declare its provenance so raw
 * telemetry is never mixed with synthetic demo data without awareness.
 */
export type SeedProvenance =
  | 'RAW_EXPORT_2026_09_04'
  | 'EXISTING_UI_REFERENCE'
  | 'SYNTHETIC_DEMO';
