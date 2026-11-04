import { denyBillingForClient } from '../middleware/auth.js';
import { Router, type Request, type Response } from 'express';
import { proxyUpstream } from '../services/upstreamProxy.js';
import { getAuthToken } from './gis.js';
import { requireClient, rootSites } from '../services/clientContext.js';
import { resolveSiteScope } from '../services/networkService.js';
import {
  buildHouseholdQuery,
  buildSortBy,
  lookupQuery,
  buildMeterPhotos,
  pickReplacement,
  getHouseholdMeters,
  getMeterReadings,
  getLastFrame,
  siteNameOf,
  type HouseholdMeter,
} from '../services/householdService.js';

const router = Router();

// The household list, the 360 view and its parts. Who a household is, its bills and photographs come from the beta API
// with the caller's own token (so it only ever answers for the caller's own client); which meters it has and what they
// reported comes from Postgres. Nothing here is guessed: a value the sources do not have is null.

const intParam = (v: unknown, fallback: number, min: number, max: number) => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

async function upstreamHeaders(req: Request): Promise<Record<string, string>> {
  const token = await getAuthToken(req.headers.authorization);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = token;
  return headers;
}

/** The household with this numeric or consumer id, if it is one the caller's token can see; null otherwise. */
async function findOwnHousehold(idOrCustomId: string, headers: Record<string, string>): Promise<any | null> {
  const res = await proxyUpstream('POST', '/api/household/page', {
    // the lookup matches ids that merely contain the text, so ask for enough rows for the exact one to be among them
    body: { page: 0, size: 50, query: lookupQuery(idOrCustomId) },
    headers,
  }).catch(() => null);
  const rows: any[] = Array.isArray((res?.data as any)?.content) ? (res!.data as any).content : [];
  return rows.find((h) => String(h.id) === idOrCustomId || h.customId === idOrCustomId) ?? null;
}

/** The meter the 360 view is about: the active one that reported last (the list is already in that order). */
const primaryOf = (meters: HouseholdMeter[]): HouseholdMeter | null => meters[0] ?? null;

function consumerOf(h: any, meters: HouseholdMeter[]) {
  const siteId = h.siteId ?? primaryOf(meters)?.siteId ?? null;
  return {
    id: h.id ?? null,
    customId: h.customId ?? null,
    name: h.name ?? null,
    location: h.location ?? null,
    ward: h.ward ?? primaryOf(meters)?.ward ?? null,
    mobile: h.mobile ?? null,
    countryCode: h.countryCode ?? null,
    pinCode: h.pinCode ?? null,
    zone: h.zone ?? null,
    locality: h.locality ?? null,
    dma: h.dma ?? null,
    siteId,
    siteName: h.siteName ?? siteNameOf(siteId),
    status: h.status ?? null,
    registrationDate: h.registrationDate ?? null,
  };
}

// POST /api/households/page (also POST / and GET /): one page of the caller's households.
// body/query: page, size, search (consumer id, mobile or name), siteIds (a site and everything below it)
async function handleHouseholdPage(req: Request, res: Response) {
  try {
    const src: any = { ...(req.query ?? {}), ...(req.body ?? {}) };
    const page = intParam(src.page, 0, 0, 100000);
    const size = intParam(src.size, 25, 1, 100);

    // sites the caller may open, each with the sites below it; a site that is not theirs is refused, never ignored
    const requested = (Array.isArray(src.siteIds) ? src.siteIds : String(src.siteIds ?? '').split(',')).map((s: unknown) => String(s).trim()).filter(Boolean);
    let siteIds: number[] | undefined;
    if (requested.length > 0) {
      const scope = resolveSiteScope(requested.join(','));
      if (scope === undefined) return res.status(404).json({ error: 'Unknown site' });
      siteIds = scope ?? undefined;
    }

    const headers = await upstreamHeaders(req);
    const base = { page, size, query: buildHouseholdQuery(src.search), ...(siteIds ? { siteIds } : {}) };
    const sortBy = buildSortBy(src.sort, src.dir);
    let upstream = await proxyUpstream('POST', '/api/household/page', { body: sortBy ? { ...base, sortBy } : base, headers });
    // a sort the beta does not accept must not break the list: ask again unsorted
    if (sortBy && (upstream.status === 400 || upstream.status === 500)) {
      upstream = await proxyUpstream('POST', '/api/household/page', { body: base, headers });
    }
    if (upstream.status === 401) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    if (upstream.status !== 200 || !upstream.data) {
      return res.status(upstream.status >= 400 ? upstream.status : 502).json({ error: 'The household list could not be loaded' });
    }

    const d = upstream.data as any;
    const content = (Array.isArray(d.content) ? d.content : []).map((h: any) => ({ ...h, siteName: h.siteName ?? siteNameOf(h.siteId) }));
    const totalElements = d.totalElements ?? content.length;
    return res.json({
      content,
      totalElements,
      totalPages: d.totalPages ?? Math.ceil(totalElements / size),
      number: d.number ?? page,
      size: d.size ?? size,
      first: d.first ?? page === 0,
      last: d.last ?? false,
    });
  } catch (err: any) {
    console.error('[households] Error fetching household page:', err.message);
    res.status(500).json({ error: 'Failed to fetch households' });
  }
}

router.post('/page', handleHouseholdPage);
router.post('/', handleHouseholdPage);
router.get('/', handleHouseholdPage);

// GET /api/households/summary: how many households the client has, in total and under each top-level site.
// The counts are asked of the beta (one small page each, only the total is read) and kept for 5 minutes per client.
const SUMMARY_TTL_MS = 5 * 60 * 1000;
const summaryCache = new Map<string, { at: number; value: unknown }>();

router.get('/summary', async (req, res) => {
  try {
    const ctx = requireClient();
    const hit = req.query.refresh === '1' ? undefined : summaryCache.get(ctx.key); // the Refresh button skips the kept copy
    if (hit && Date.now() - hit.at < SUMMARY_TTL_MS) return res.json(hit.value);

    const headers = await upstreamHeaders(req);
    const countOf = async (siteIds?: number[]): Promise<number | null> => {
      const r = await proxyUpstream('POST', '/api/household/page', { body: { page: 0, size: 1, ...(siteIds ? { siteIds } : {}) }, headers }).catch(() => null);
      const total = (r?.data as any)?.totalElements;
      return r?.status === 200 && Number.isFinite(Number(total)) ? Number(total) : null;
    };
    const tops = ctx.unscoped ? [] : rootSites(ctx);
    const [total, ...counts] = await Promise.all([countOf(), ...tops.map((s) => countOf(resolveSiteScope(String(s.id)) ?? undefined))]);
    const value = { total, sites: tops.map((s, i) => ({ id: s.id, name: String(s.name), count: counts[i] })).sort((a, b) => a.name.localeCompare(b.name)) };
    if (total != null) summaryCache.set(ctx.key, { at: Date.now(), value });
    return res.json(value);
  } catch (err: any) {
    console.error('[households] Error building the summary:', err.message);
    res.status(500).json({ error: 'Failed to load the household summary' });
  }
});

// GET /api/households/:id/core: who the household is, its meters and the primary meter's readings. Fast: one beta lookup
// and database reads only. The bill, the radio details and the photographs are asked for separately (see below).
router.get('/:id/core', async (req, res) => {
  try {
    const household = await findOwnHousehold(req.params.id, await upstreamHeaders(req));
    if (!household) return res.status(404).json({ error: 'Household not found' });
    const meters = await getHouseholdMeters(household);
    const primary = primaryOf(meters);
    const r = primary ? await getMeterReadings(primary.meterId, primary.tz) : { readings: [], yesterdayM3: null, monthToDateM3: null };
    return res.json({
      consumer: consumerOf(household, meters),
      meters: meters.map(({ tz: _tz, ...m }) => m),
      primaryMeterId: primary?.meterId ?? null,
      readings: r.readings,
      yesterdayM3: r.yesterdayM3,
      monthToDateM3: r.monthToDateM3,
    });
  } catch (err: any) {
    console.error('[households] Error fetching household core:', err.message);
    res.status(500).json({ error: 'Failed to fetch household detail' });
  }
});

/** The household and its primary meter, or the answer to send when there is none. */
async function withPrimary(req: Request, res: Response) {
  const headers = await upstreamHeaders(req);
  const household = await findOwnHousehold(req.params.id as string, headers);
  if (!household) {
    res.status(404).json({ error: 'Household not found' });
    return null;
  }
  return { headers, household, primary: primaryOf(await getHouseholdMeters(household)) };
}

// GET /api/households/:id/bills: the latest bill of the household's meter (the same beta call Meter 360 uses) and the
// tariff slabs of the household's site (what the beta bills by)
router.get('/:id/bills', denyBillingForClient, async (req, res) => {
  try {
    const ctx = await withPrimary(req, res);
    if (!ctx) return;
    const unavailable: string[] = [];
    const ask = async (name: string, path: string, query?: Record<string, string>) => {
      try {
        const r = await proxyUpstream('GET', path, { headers: ctx.headers, query });
        if (r.status >= 500) unavailable.push(name);
        return r.status >= 200 && r.status < 300 ? r.data ?? null : null;
      } catch {
        unavailable.push(name);
        return null;
      }
    };
    const siteId = ctx.household.siteId ?? ctx.primary?.siteId ?? null;
    const [latestBill, slabs] = await Promise.all([
      ctx.primary ? ask('bill', `/api/billing/latest-bill/${ctx.primary.assetId}`) : Promise.resolve(null),
      siteId != null ? ask('tariff', '/api/billing/slabs', { siteIds: String(siteId) }) : Promise.resolve(null),
    ]);
    return res.json({ latestBill, slabs: Array.isArray(slabs) ? slabs : [], unavailable });
  } catch (err: any) {
    console.error('[households] Error fetching bills:', err.message);
    res.status(500).json({ error: 'Failed to fetch the bill' });
  }
});

// GET /api/households/:id/hardware: the primary meter's identity and radio link, from the database
router.get('/:id/hardware', async (req, res) => {
  try {
    const ctx = await withPrimary(req, res);
    if (!ctx) return;
    const p = ctx.primary;
    if (!p) return res.json({ meter: null });
    const { tz: _tz, ...meter } = p;
    return res.json({ meter, lastFrame: await getLastFrame(p.meterId) });
  } catch (err: any) {
    console.error('[households] Error fetching hardware:', err.message);
    res.status(500).json({ error: 'Failed to fetch the meter hardware' });
  }
});

// GET /api/households/:id/documents: photographs and the replacement history of the primary meter (slow beta calls)
router.get('/:id/documents', async (req, res) => {
  try {
    const ctx = await withPrimary(req, res);
    if (!ctx) return;
    if (!ctx.primary) return res.json({ photos: [], replacement: null, unavailable: [] });
    const unavailable: string[] = [];
    const ask = async (name: string, path: string, query?: Record<string, string>) => {
      try {
        const r = await proxyUpstream('GET', path, { headers: ctx.headers, query });
        if (r.status >= 500) unavailable.push(name);
        return r.status >= 200 && r.status < 300 ? r.data : null;
      } catch {
        unavailable.push(name);
        return null;
      }
    };
    const assetId = ctx.primary.assetId;
    const [imei, images] = await Promise.all([
      ask('replacement history', '/api/household/imei-history', { assetId: String(assetId) }),
      ask('photos', `/api/water/meter-image/${assetId}`),
    ]);
    return res.json({ photos: buildMeterPhotos(images, imei), replacement: pickReplacement(imei), unavailable });
  } catch (err: any) {
    console.error('[households] Error fetching documents:', err.message);
    res.status(500).json({ error: 'Failed to fetch the meter documents' });
  }
});

// GET /api/households/:id: one household
router.get('/:id', async (req, res) => {
  try {
    const household = await findOwnHousehold(req.params.id, await upstreamHeaders(req));
    if (!household) return res.status(404).json({ error: 'Household not found' });
    return res.json({ ...household, siteName: household.siteName ?? siteNameOf(household.siteId) });
  } catch (err: any) {
    console.error('[households] Error getting household by ID:', err.message);
    res.status(500).json({ error: 'Failed to fetch household' });
  }
});

export default router;
