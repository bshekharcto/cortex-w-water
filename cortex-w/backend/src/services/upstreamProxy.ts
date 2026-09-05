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
  });

  if (res.status === 204) {
    return { status: 204, data: null, headers: res.headers };
  }

  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, data, headers: res.headers };
}
