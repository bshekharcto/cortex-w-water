import { createContext, useContext, type ReactNode } from 'react';
import type { NetworkHealthThresholds } from '../types/commandCenter.types';

// The same limits as backend/src/config/networkHealth.ts (one set of numbers on both sides): a frame or meter is
// flagged weak below -95 dBm RSSI and poor below -10 dB SNR.
export const DEFAULT_THRESHOLDS: NetworkHealthThresholds = {
  gatewayStaleMinutes: 24 * 60,
  gatewayCriticalMinutes: 48 * 60,
  meterStaleMinutes: 24 * 60,
  meterCriticalHours: 48,
  gatewayTrafficDropWarningPct: 30,
  gatewayTrafficDropCriticalPct: 60,
  rssiWeakDbm: -95,
  rssiCriticalDbm: -105,
  snrWeakDb: -10,
  snrCriticalDb: -18,
  trendMinPrevFrames: 20,
  trendsEnabled: false,
  rssiBands: { strong: -80, good: -90, weak: -100 },
  snrBands: { excellent: 5, good: 0, marginal: -10 },
};

const ThresholdsContext = createContext<NetworkHealthThresholds | null>(DEFAULT_THRESHOLDS);

export function ThresholdsProvider({ value, children }: { value: NetworkHealthThresholds | null; children: ReactNode }) {
  return <ThresholdsContext.Provider value={value}>{children}</ThresholdsContext.Provider>;
}

export function useThresholds(): NetworkHealthThresholds | null {
  return useContext(ThresholdsContext);
}

export const isWeakRssi = (t: NetworkHealthThresholds | null, v: number | null | undefined) =>
  !!t && v != null && v < t.rssiWeakDbm;
export const isPoorSnr = (t: NetworkHealthThresholds | null, v: number | null | undefined) =>
  !!t && v != null && v < t.snrWeakDb;

// Human label for the selected window ("6H", "today", "Custom range"), so headings never claim the wrong window when it isn't.
const WindowLabelContext = createContext<string>('selected window');

export function WindowLabelProvider({ value, children }: { value: string; children: ReactNode }) {
  return <WindowLabelContext.Provider value={value}>{children}</WindowLabelContext.Provider>;
}

export function useWindowLabel(): string {
  return useContext(WindowLabelContext);
}
