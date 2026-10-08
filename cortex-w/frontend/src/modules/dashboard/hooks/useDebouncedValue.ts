import { useEffect, useState } from 'react';

/**
 * `value`, delayed by `ms` after it stops changing — for a search box, so each
 * keystroke doesn't fire a request. When `resetKey` changes (the user moved to
 * another node) the new value is used immediately: a stale search from the
 * previous screen must never be sent for the new one.
 */
export function useDebouncedValue<T>(value: T, ms: number, resetKey: string | null): T {
  const [state, setState] = useState({ key: resetKey, value });

  useEffect(() => {
    if (state.key !== resetKey) {
      setState({ key: resetKey, value });
      return;
    }
    const t = setTimeout(() => setState({ key: resetKey, value }), ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, resetKey, ms]);

  return state.key === resetKey ? state.value : value;
}
