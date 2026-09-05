import { thresholds } from '@/config/thresholds';

export type RssiBand = 'strong' | 'good' | 'weak' | 'veryWeak';
export type SnrBand = 'excellent' | 'good' | 'marginal' | 'poor';

const { rssiBandsDbm: rssi, snrBandsDb: snr } = thresholds;

export function classifyRssi(dbm: number): RssiBand {
  if (dbm >= rssi.strong) return 'strong';
  if (dbm >= rssi.good) return 'good';
  if (dbm >= rssi.weak) return 'weak';
  return 'veryWeak';
}

export function classifySnr(db: number): SnrBand {
  if (db >= snr.excellent) return 'excellent';
  if (db >= snr.good) return 'good';
  if (db >= snr.marginal) return 'marginal';
  return 'poor';
}

export function signalBandColor(band: RssiBand | SnrBand): string {
  switch (band) {
    case 'strong':
    case 'excellent':
      return 'var(--cw-green)';
    case 'good':
      return 'var(--cw-blue)';
    case 'weak':
    case 'marginal':
      return 'var(--cw-orange)';
    case 'veryWeak':
    case 'poor':
      return 'var(--cw-red)';
  }
}
