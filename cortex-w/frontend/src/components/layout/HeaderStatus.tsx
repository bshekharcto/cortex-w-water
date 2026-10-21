import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { HeaderTakeover } from './headerStatusLogic';

interface Slot {
  takeover: HeaderTakeover | undefined;
  set: (v: HeaderTakeover | undefined) => void;
}

const HeaderStatusContext = createContext<Slot>({ takeover: undefined, set: () => undefined });

/** Holds what the current page wants the header's "Last updated" pill to show (nothing: the scheduler's time). */
export function HeaderStatusProvider({ children }: { children: ReactNode }) {
  const [takeover, set] = useState<HeaderTakeover | undefined>(undefined);
  const value = useMemo(() => ({ takeover, set }), [takeover]);
  return <HeaderStatusContext.Provider value={value}>{children}</HeaderStatusContext.Provider>;
}

/** The header reads this. */
export function useHeaderTakeover(): HeaderTakeover | undefined {
  return useContext(HeaderStatusContext).takeover;
}

/**
 * A page that reads live data calls this to show its own load time in the header's "Last updated" pill while it is open.
 * `text` null = nothing yet. The scheduler's time comes back when the page closes.
 */
export function useTakeOverHeaderLastUpdated(text: string | null, title?: string): void {
  const { set } = useContext(HeaderStatusContext);
  useEffect(() => {
    set({ text, title });
  }, [set, text, title]);
  useEffect(() => () => set(undefined), [set]);
}
