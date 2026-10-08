import { waitUntil } from '@vercel/functions';

/**
 * Runs work that should outlive the response that triggered it. On Vercel a
 * function can be frozen the moment its response is sent, so a bare
 * fire-and-forget promise may never finish; waitUntil keeps the invocation
 * alive for it (still bounded by the function's maxDuration). Anywhere else
 * the process simply keeps running and this is a plain detached promise.
 * Never throws and never lets a failure escape as an unhandled rejection.
 */
export function runInBackground(work: Promise<unknown>): void {
  const safe = work.catch((err) => console.warn('[background] task failed:', err?.message || err));
  try {
    waitUntil(safe); // no-op outside Vercel
  } catch {
    // no request context: the promise still runs on its own
  }
}
