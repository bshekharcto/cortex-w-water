import { createContext, useContext, type ReactNode } from 'react';
import type { NetworkHealthThresholds } from '../types/commandCenter.types';

// The thresholds come from the backend summary (single source of truth); until it has loaded
// there are none, and the UI simply doesn't flag weak/poor links.
const ThresholdsContext = createContext<NetworkHealthThresholds | null>(null);

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

// Human label for the selected window ("6H", "7D", "Custom range"), so headings never claim 24H when it isn't.
const WindowLabelContext = createContext<string>('selected window');

export function WindowLabelProvider({ value, children }: { value: string; children: ReactNode }) {
  return <WindowLabelContext.Provider value={value}>{children}</WindowLabelContext.Provider>;
}

export function useWindowLabel(): string {
  return useContext(WindowLabelContext);
}
