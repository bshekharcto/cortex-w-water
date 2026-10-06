import { useCallback, useEffect, useState } from 'react';
import { describeError } from '../services/dashboardDataService';

interface Settled<T> {
  key: string;
  data: T;
  error: string | null;
}

/**
 * Fetches `fetcher(key)` whenever `key` changes, and only ever exposes a
 * result that belongs to the CURRENT key:
 *  - a response that arrives after the key has changed (slow request for a
 *    node the user already left) is discarded, never applied;
 *  - on the render where the key changes, the previous key's data is not
 *    returned — `isLoading` is true and `data` is `empty` — so callers can't
 *    briefly act on the wrong node's rows (e.g. mistake a parent for a leaf).
 * `enabled: false` skips fetching and reports not-loading with `empty`.
 */
export function useKeyedFetch<T>(
  key: string | null,
  fetcher: (key: string | null) => Promise<T>,
  empty: T,
  enabled: boolean,
  errorFallback: string
) {
  const keyString = key ?? '';
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      // Disabled means "no result": drop any old one so re-enabling the same
      // key starts a visible load instead of replaying stale data or errors.
      setSettled(null);
      return;
    }
    let stale = false;
    fetcher(key)
      .then((data) => {
        if (!stale) setSettled({ key: keyString, data, error: null });
      })
      .catch((err) => {
        console.error(`[dashboard] ${errorFallback}:`, err);
        // Never keep a previous result alongside a failure.
        if (!stale) setSettled({ key: keyString, data: empty, error: describeError(err, errorFallback) });
      });
    return () => {
      stale = true;
    };
    // fetcher/empty/errorFallback are stable per call site; the key, the
    // enabled flag and an explicit retry are what should re-run the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyString, enabled, attempt]);

  const current = enabled && settled && settled.key === keyString ? settled : null;

  const refetch = useCallback(() => {
    setSettled(null);
    setAttempt((n) => n + 1);
  }, []);

  return {
    data: current ? current.data : empty,
    error: current ? current.error : null,
    isLoading: enabled && current === null,
    refetch,
  };
}
