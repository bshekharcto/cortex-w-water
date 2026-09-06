import type { GisMeter } from './gisData';

export type RecencyBucket = 'last72h' | 'last10d' | 'last30d' | 'never';

export interface MeterColorInfo {
  color: string;           // Dot fill color (100% based on recency)
  strokeColor: string;     // Border color (shows decibel link quality: White/Green, Yellow, Red, Slate)
  strokeWeight: number;    // Border thickness for high visibility
  bucket: RecencyBucket;
  label: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  rssiLabel: string;
}

export const RECENCY_BASE_COLORS: Record<RecencyBucket, {
  color: string;
  label: string;
  description: string;
  badgeBg: string;
  badgeText: string;
}> = {
  last72h: {
    color: '#047857', // Deep Green - received in last 72 Hours
    label: 'Last 72 Hours',
    description: 'Data received in last 72 hours (Deep Green)',
    badgeBg: 'rgba(4, 120, 87, 0.12)',
    badgeText: '#047857',
  },
  last10d: {
    color: '#10B981', // Mid Green - received in last 10 days
    label: 'Last 10 Days',
    description: 'Data received in last 10 days (Mid Green)',
    badgeBg: 'rgba(16, 185, 129, 0.12)',
    badgeText: '#059669',
  },
  last30d: {
    color: '#86EFAC', // Light Green - received in last 30 days
    label: 'Last 30 Days',
    description: 'Data received in last 30 days (Light Green)',
    badgeBg: 'rgba(134, 239, 172, 0.25)',
    badgeText: '#047857',
  },
  never: {
    color: '#CBD5E1', // Light Gray - never received or > 30 days
    label: 'Never Received',
    description: 'Never received or > 30 days inactive (Light Gray)',
    badgeBg: 'rgba(203, 213, 225, 0.3)',
    badgeText: '#475569',
  },
};

/**
 * Computes decibel (RSSI) signal border color:
 * - Strong (> -95 dBm): Crisp White / Green border (#FFFFFF / #059669)
 * - Marginal (-95 to -105 dBm): Bright Yellow border (#EAB308)
 * - Critical (< -105 dBm): Red border (#EF4444)
 * - Never / Unknown: Slate border (#94A3B8)
 */
export function getDecibelBorder(rssi?: number): { strokeColor: string; strokeWeight: number; rssiLabel: string } {
  if (typeof rssi !== 'number' || isNaN(rssi) || rssi === 0) {
    return { strokeColor: '#94A3B8', strokeWeight: 2, rssiLabel: 'No Decibel Data' };
  }

  if (rssi >= -95) {
    return { strokeColor: '#FFFFFF', strokeWeight: 2.2, rssiLabel: `Strong (${rssi} dBm)` };
  } else if (rssi >= -105) {
    return { strokeColor: '#EAB308', strokeWeight: 2.5, rssiLabel: `Marginal (${rssi} dBm - Yellow Border)` };
  } else {
    return { strokeColor: '#EF4444', strokeWeight: 2.5, rssiLabel: `Weak (${rssi} dBm - Red Border)` };
  }
}

/**
 * Determines meter pin styling:
 * - Dot Fill: Recency (Deep Green, Mid Green, Light Green, Light Gray - NO ORANGE DOTS)
 * - Dot Border: Decibel Signal (White/Green for strong, Yellow for marginal, Red for weak, Slate for never)
 */
export function getMeterColorInfo(meter: GisMeter, referenceTimeMs = Date.now()): MeterColorInfo {
  let bucket: RecencyBucket = 'never';

  // If already tagged on meter
  if ((meter as any).recencyBucket && RECENCY_BASE_COLORS[(meter as any).recencyBucket as RecencyBucket]) {
    bucket = (meter as any).recencyBucket as RecencyBucket;
  } else {
    const rawDate = (meter as any).decodedAt || (meter as any).lastSeenDate || meter.lastSeen;

    if (!rawDate || rawDate === 'Never' || rawDate === 'never' || rawDate === 'Unknown' || rawDate === 'null') {
      bucket = 'never';
    } else {
      const str = String(rawDate).trim().toLowerCase();

      // 1. Relative text checks
      if (
        str.includes('sec') ||
        str.includes('min') ||
        str.includes('hour') ||
        str === 'recent' ||
        str === 'today' ||
        str === 'yesterday' ||
        str.includes('just now')
      ) {
        bucket = 'last72h';
      } else {
        const daysMatch = str.match(/(\d+)\s*day/);
        if (daysMatch) {
          const days = parseInt(daysMatch[1], 10);
          if (days <= 3) bucket = 'last72h';
          else if (days <= 10) bucket = 'last10d';
          else if (days <= 30) bucket = 'last30d';
          else bucket = 'never';
        } else {
          // 2. Absolute ISO timestamp or date string
          const timestamp = new Date(rawDate).getTime();
          if (isNaN(timestamp) || timestamp <= 0) {
            bucket = 'never';
          } else {
            const ageMs = Math.max(0, referenceTimeMs - timestamp);
            const ageHours = ageMs / (1000 * 60 * 60);
            const ageDays = ageHours / 24;

            if (ageHours <= 72) {
              bucket = 'last72h';
            } else if (ageDays <= 10) {
              bucket = 'last10d';
            } else if (ageDays <= 30) {
              bucket = 'last30d';
            } else {
              bucket = 'never';
            }
          }
        }
      }
    }
  }

  const base = RECENCY_BASE_COLORS[bucket];
  const decibel = getDecibelBorder(meter.rssi);

  return {
    color: base.color,
    strokeColor: decibel.strokeColor,
    strokeWeight: decibel.strokeWeight,
    bucket,
    label: base.label,
    description: base.description,
    badgeBg: base.badgeBg,
    badgeText: base.badgeText,
    rssiLabel: decibel.rssiLabel,
  };
}
