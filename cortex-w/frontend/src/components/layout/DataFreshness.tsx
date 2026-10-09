import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { runtimeConfig } from '@/config/runtimeConfig';
import { fetchDataFreshness } from '@/services/api/freshnessApi';
import { nextFreshness, type FreshnessState } from './freshnessLogic';

const POLL_MS = 60 * 1000;

const FreshnessContext = createContext<FreshnessState>({ localTime: null, updatedAt: null, version: 0 });

/**
 * Asks once a minute (while the tab is open and visible, and again when it comes back) when the numbers were last
 * updated. The scheduler updates them every 15 minutes; when a newer update shows up the version changes and the pages
 * quietly reload their values, so nobody has to press a refresh button.
 */
export function DataFreshnessProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FreshnessState>({ localTime: null, updatedAt: null, version: 0 });

  const check = useCallback(async () => {
    try {
      const f = await fetchDataFreshness();
      setState((prev) => nextFreshness(prev, f));
    } catch {
      // keep what is shown; the next minute asks again
    }
  }, []);

  useEffect(() => {
    if (runtimeConfig.APP_DATA_MODE === 'seed') return;
    check();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') check();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  return <FreshnessContext.Provider value={state}>{children}</FreshnessContext.Provider>;
}

export function useDataFreshness(): FreshnessState {
  return useContext(FreshnessContext);
}
