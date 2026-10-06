import { config } from '../config/env.js';

/**
 * Proxy/adapter for the real upstream water backend. This is where every
 * documented API inconsistency from spec section 28 is absorbed:
 *
 * 28.1: Date parameter names (fromDate vs toDate vs endDate)
 * 28.2: siteIds encoding (comma-joined vs repeated params)
 * 28.3: Billing trailing slash (list = /api/billing, create = /api/billing/)
 * 28.4: Spring Data REST relation URLs (site/{id} vs sites/{id})
 * 28.5: 204 semantics (can mean "not found")
 * 28.6: Error body variants
 *
 * The frontend never sees these — it talks to a clean, consistent BFF contract.
 */
// A hung upstream must fail the request, not hang it. The slowest legitimate
// call (a 2,000-row asset/query page) takes ~10s, so 60s leaves ample margin.
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS) || 60_000;

/** An upstream call that failed (network error, timeout, or a non-2xx / malformed response). */
export class UpstreamError extends Error {
  constructor(
    public readonly path: string,
    public readonly upstreamStatus: number | null,
    detail: string
  ) {
    super(`Upstream ${path} failed: ${detail}`);
    this.name = 'UpstreamError';
  }
}

/**
 * Like proxyUpstream, but never lets a failure pass as data: a thrown fetch
 * (network/timeout) or a non-2xx status becomes an UpstreamError, so callers
 * can't mistake an outage for an empty result.
 */
export async function fetchUpstreamOrThrow(
  method: string,
  path: string,
  opts: Parameters<typeof proxyUpstream>[2] = {}
): Promise<unknown> {
  let res: Awaited<ReturnType<typeof proxyUpstream>>;
  try {
    res = await proxyUpstream(method, path, opts);
  } catch (err: any) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw new UpstreamError(path, null, timedOut ? `timed out after ${UPSTREAM_TIMEOUT_MS}ms` : err?.message || String(err));
  }
  if (res.status < 200 || res.status >= 300) {
    throw new UpstreamError(path, res.status, `HTTP ${res.status}`);
  }
  return res.data;
}

export async function proxyUpstream(
  method: string,
  path: string,
  opts: {
    body?: unknown;
    query?: Record<string, string | string[]>;
    headers?: Record<string, string>;
  } = {},
): Promise<{ status: number; data: unknown; headers: Headers }> {
  const base = path.startsWith('/households/') || path.startsWith('/bills/') || path.startsWith('/billingSlabs/')
    ? config.UPSTREAM_DATA_REST_URL
    : config.UPSTREAM_API_BASE_URL;

  const url = new URL(path, base);
  if (opts.query) {
    for (const [key, val] of Object.entries(opts.query)) {
      if (Array.isArray(val)) {
        val.forEach((v) => url.searchParams.append(key, v));
      } else {
        url.searchParams.set(key, val);
      }
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  if (res.status === 204) {
    return { status: 204, data: null, headers: res.headers };
  }

  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, data, headers: res.headers };
}
