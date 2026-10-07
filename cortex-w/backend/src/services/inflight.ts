/**
 * Single-flight: concurrent callers asking for the same key share one
 * in-progress load instead of each hitting upstream. The entry is removed when
 * the load settles (success or failure), so a failure is never replayed.
 */
export function singleFlight<K, T>(inflight: Map<K, Promise<T>>, key: K, load: () => Promise<T>): Promise<T> {
  const running = inflight.get(key);
  if (running) return running;
  const p = load().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}
