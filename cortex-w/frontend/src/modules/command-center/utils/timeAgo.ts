import { useSyncExternalStore } from 'react';

// One shared interval drives every "x ago" label on the page, so ages stay live between fetches
// without each row owning a timer.
const TICK_MS = 5000;
let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    now = Date.now(); // the shared clock was idle: don't show ages from when it last ticked
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Current time (ms), re-rendering the caller every few seconds. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now);
}

/** "12s ago" / "3m ago" / "2h ago" / "4d ago"; "n/a" when there is no timestamp. */
export function formatAgo(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return 'n/a';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'n/a';
  const sec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
