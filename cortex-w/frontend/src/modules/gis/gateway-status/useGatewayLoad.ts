import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isUnauthorized } from '../shared/meterDetailModel';

export interface Loaded<T> {
  data: T | null;
  /** First load of this request (a quiet refresh does not set it). */
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads something for the page and keeps it fresh. A new `key` starts a new request (the old answer is dropped, so a
 * stale range is never shown); `refreshMs` re-asks quietly and keeps the last good answer on screen if that fails.
 * An expired session sends the user to the login page. With `enabled` false nothing is requested and nothing is loading.
 */
export function useGatewayLoad<T>(key: string, load: (signal: AbortSignal) => Promise<T>, refreshMs?: number, enabled = true): Loaded<T> {
  const navigate = useNavigate();
  const loadRef = useRef(load);
  loadRef.current = load;
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({ key, data: null, error: null });
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const ctl = new AbortController();
    const run = () => {
      setRefreshing(true);
      loadRef
        .current(ctl.signal)
        .then((data) => !ctl.signal.aborted && setState({ key, data, error: null }))
        .catch((e) => {
          if (ctl.signal.aborted) return;
          if (isUnauthorized(e)) return navigate('/login', { replace: true });
          const message = (e as { operatorMessage?: string })?.operatorMessage || 'Could not load the data.';
          setState((prev) => ({ key, data: prev.key === key ? prev.data : null, error: message }));
        })
        .finally(() => !ctl.signal.aborted && setRefreshing(false));
    };
    run();
    const timer = refreshMs ? window.setInterval(run, refreshMs) : undefined;
    return () => {
      ctl.abort();
      if (timer) window.clearInterval(timer);
    };
  }, [key, nonce, refreshMs, navigate, enabled]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const current = state.key === key;
  return {
    data: enabled && current ? state.data : null,
    loading: enabled && (!current || (state.data === null && state.error === null)),
    refreshing: enabled && refreshing,
    error: enabled && current ? state.error : null,
    reload,
  };
}
