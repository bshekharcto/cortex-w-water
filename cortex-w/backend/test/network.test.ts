// Network Explorer API test, against the REAL upstream and the database in DATABASE_URL:   npm run test:network
//
// Starts the auth middleware + the /api/network router in-process (no server startup, so NO migrations run) and calls
// it over HTTP with two real logins of two different clients (TEST_CLIENT_A_* / TEST_CLIENT_B_* in backend/.env, never
// printed). The routes only SELECT, so this is safe against a shared database; it never writes.
import express from 'express';
import compression from 'compression';
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import zlib from 'node:zlib';
import http from 'node:http';

if (existsSync('.env')) process.loadEnvFile('.env');

for (const v of ['TEST_CLIENT_A_USER', 'TEST_CLIENT_A_PASS', 'TEST_CLIENT_B_USER', 'TEST_CLIENT_B_PASS']) {
  if (!process.env[v]) {
    console.error(`Missing ${v} (set it in backend/.env)`);
    process.exit(2);
  }
}

const { authMiddleware, requireAuth } = await import('../src/middleware/auth.js');
const { default: networkRoutes } = await import('../src/routes/network.js');
const { default: gisRoutes } = await import('../src/routes/gis.js');
const { pool } = await import('../src/db/pool.js');
const { config } = await import('../src/config/env.js');

const app = express();
app.use(compression());
app.use(express.json());
app.use(authMiddleware);
app.use(requireAuth);
app.use('/api/network', networkRoutes);
app.use('/api/gis', gisRoutes);
const server = app.listen(0);
const BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

async function login(user: string, pass_: string): Promise<{ token: string; sites: any[] }> {
  const base = config.COGNECTO_API_URL ?? config.UPSTREAM_API_BASE_URL;
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass_ }),
  });
  const { token } = (await r.json()) as { token: string };
  const s = await fetch(`${config.UPSTREAM_API_BASE_URL}/api/site/?allSites=false`, { headers: { Authorization: `Bearer ${token}` } });
  return { token, sites: (await s.json()) as any[] };
}

async function get(path: string, token?: string, headers: Record<string, string> = {}) {
  const t0 = performance.now();
  const r = await fetch(BASE + path, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Accept-Encoding': 'gzip', ...headers } });
  const buf = Buffer.from(await r.arrayBuffer());
  const ms = Math.round(performance.now() - t0);
  // fetch has already undone the gzip; compress again to report roughly what went over the wire
  let body: any = null;
  try { body = JSON.parse(buf.toString('utf8')); } catch { /* not JSON (304) */ }
  return { status: r.status, body, ms, wireBytes: zlib.gzipSync(buf).length, rawBytes: buf.length, etag: r.headers.get('etag'), headers: r.headers };
}

try {
  const A = await login(process.env.TEST_CLIENT_A_USER!, process.env.TEST_CLIENT_A_PASS!);
  const B = await login(process.env.TEST_CLIENT_B_USER!, process.env.TEST_CLIENT_B_PASS!);
  const aSites = new Set<number>(A.sites.map((s) => s.id));
  const bOnly = B.sites.find((s) => !aSites.has(s.id));
  const aClient = A.sites[0]?.clientId, bClient = B.sites[0]?.clientId;
  check('the two logins belong to different clients', aClient !== bClient, `A=${aClient} B=${bClient}`);

  // --- access control ---
  check('no token -> 401', (await get('/api/network/gateways')).status === 401);
  check('garbage token -> 401', (await get('/api/network/meters/map', 'not.a.token')).status === 401);

  // --- A: gateways ---
  const g = await get('/api/network/gateways?siteId=ALL', A.token);
  check('A gateways 200', g.status === 200, `${g.ms} ms`);
  const placed = g.body?.gateways ?? [], unplaced = g.body?.unplaced ?? [];
  check('A has placed gateways with real positions', placed.length > 0 && placed.every((x: any) => Number.isFinite(x.lat) && Number.isFinite(x.lng) && /^[0-9a-f]{16}$/.test(x.gatewayId)), `${placed.length} placed, ${unplaced.length} unplaced`);
  check('no gateway uses a made-up default position or radius', placed.every((x: any) => x.radiusM === null || x.radiusM > 0));
  check('gateway ids are unique', new Set(placed.map((x: any) => x.gatewayId)).size === placed.length);
  check('unplaced gateways say why', unplaced.every((x: any) => x.reason === 'no-geofence' || x.reason === 'no-coordinates'));
  check('gateway statuses are the rail labels', [...placed, ...unplaced].every((x: any) => ['reporting', 'degraded', 'stale', 'no-traffic'].includes(x.status)));

  // --- A: map payload ---
  const m1 = await get('/api/network/meters/map?siteId=ALL', A.token);
  check('A map 200', m1.status === 200, `cold ${m1.ms} ms`);
  const map = m1.body;
  const s = map?.summary;
  check('summary adds up: statuses = total', s && s.connected + s.disconnected + s.never === s.total, JSON.stringify(s));
  check('summary adds up: with + without coordinates = total', s && s.withCoordinates + s.withoutCoordinates === s.total);
  check('rows = meters with coordinates', map?.rows?.length === s?.withCoordinates);
  check('coordinates came from upstream', map?.coordinates?.status === 'fresh', map?.coordinates?.status);
  check('every row is drawable and well-formed', map.rows.every((r: any[]) => r.length === map.columns.length && Math.abs(r[2]) <= 90 && Math.abs(r[3]) <= 180 && !(r[2] === 0 && r[3] === 0) && r[4] >= 0 && r[4] < 3 && r[5] >= -1 && r[5] < map.gatewayIds.length));
  console.log(`      payload: ${(m1.rawBytes / 1024).toFixed(0)} KB raw, ${(m1.wireBytes / 1024).toFixed(0)} KB gzipped, ${s?.total} meters, ${map?.rows?.length} drawn`);
  const m2 = await get('/api/network/meters/map?siteId=ALL', A.token);
  check('warm map is fast (<300 ms)', m2.status === 200 && m2.ms < 300, `${m2.ms} ms`);
  // plain http: fetch adds "Cache-Control: no-cache" to a conditional request, which makes a server skip the 304
  const m3 = await new Promise<number>((resolve, reject) => {
    http.get(BASE + '/api/network/meters/map?siteId=ALL', { headers: { Authorization: `Bearer ${A.token}`, 'If-None-Match': m2.etag ?? '' } }, (r) => { r.resume(); resolve(r.statusCode ?? 0); }).on('error', reject);
  });
  check('unchanged data answers 304 (nothing re-sent)', m3 === 304, `status ${m3}`);

  // --- A: subtree scoping ---
  const rootId = A.sites.find((x) => !x.parentSite)?.id;
  const sub = await get(`/api/network/meters/map?siteId=${rootId}`, A.token);
  check('A can scope to one of its sites', sub.status === 200 && sub.body.summary.total > 0 && sub.body.summary.total <= s.total, `${sub.body?.summary?.total} of ${s?.total}`);

  // --- table page ---
  const p1 = await get('/api/network/meters?siteId=ALL&limit=25&offset=0', A.token);
  check('A table page 200', p1.status === 200, `${p1.ms} ms`);
  check('page returns the limit and a consistent total', p1.body.items.length === 25 && p1.body.total === s.total, `total ${p1.body?.total}`);
  const p2 = await get('/api/network/meters?siteId=ALL&limit=25&offset=25', A.token);
  check('pages do not overlap', !p2.body.items.some((i: any) => p1.body.items.some((j: any) => j.meterId === i.meterId)));
  const live = await get('/api/network/meters?siteId=ALL&status=connected&limit=5', A.token);
  check('status filter returns only that status', live.body.items.every((i: any) => i.status === 'connected') && live.body.total === s.connected, `connected ${live.body?.total}`);
  const never = await get('/api/network/meters?siteId=ALL&status=never&limit=5', A.token);
  check('"never seen" filter matches the summary', never.body.total === s.never && never.body.items.every((i: any) => i.lastSeen === null && i.rssi === null));
  const gwId = placed.find((x: any) => x.metersHeard > 0)?.gatewayId;
  const byGw = await get(`/api/network/meters?siteId=ALL&gatewayId=${gwId}&limit=200`, A.token);
  check('gateway filter returns only that gateway, with real distances', byGw.body.items.length > 0 && byGw.body.items.every((i: any) => i.gatewayId === gwId) && byGw.body.items.some((i: any) => i.distanceToGatewayM != null), `${byGw.body?.total} meters`);
  const sample = p1.body.items.find((i: any) => i.consumerName);
  const bySearch = await get(`/api/network/meters?siteId=ALL&search=${encodeURIComponent(sample.meterId)}`, A.token);
  check('search finds a meter by id', bySearch.body.items.some((i: any) => i.meterId === sample.meterId));
  const wild = await get('/api/network/meters?siteId=ALL&search=%25&limit=5', A.token);
  check('a "%" search is literal, not "match everything"', wild.status === 200 && wild.body.total < s.total, `${wild.body?.total}`);

  // --- validation ---
  check('limit=0 -> 400', (await get('/api/network/meters?limit=0', A.token)).status === 400);
  check('limit=1000 -> 400', (await get('/api/network/meters?limit=1000', A.token)).status === 400);
  check('offset=-1 -> 400', (await get('/api/network/meters?offset=-1', A.token)).status === 400);
  check('status=bogus -> 400', (await get('/api/network/meters?status=bogus', A.token)).status === 400);
  check('gatewayId=bad -> 400', (await get('/api/network/meters?gatewayId=xyz', A.token)).status === 400);
  check('siteId given twice -> 400', (await get('/api/network/meters/map?siteId=1&siteId=2', A.token)).status === 400);
  check('SQL-looking siteId -> 404', (await get("/api/network/gateways?siteId=1;DROP TABLE x", A.token)).status === 404);

  // --- isolation ---
  if (bOnly) {
    for (const path of ['gateways', 'meters/map', 'meters']) {
      check(`A asking for B's site on /${path} -> 404`, (await get(`/api/network/${path}?siteId=${bOnly.id}`, A.token)).status === 404);
    }
    check('A mixing own and B site -> 404', (await get(`/api/network/meters/map?siteId=${rootId},${bOnly.id}`, A.token)).status === 404);
  }
  const mb = await get('/api/network/meters/map?siteId=ALL', B.token);
  check('B map 200', mb.status === 200, `${mb.body?.summary?.total} meters`);
  const aIds = new Set(map.rows.map((r: any[]) => r[0]));
  check('A and B map no meter in common', mb.body.rows.every((r: any[]) => !aIds.has(r[0])));
  const gb = await get('/api/network/gateways?siteId=ALL', B.token);
  // A physical gateway can hear meters of both clients, so an id may appear for both; what must never cross is a position
  // (placed gateways come from each client's own geofences) or the other client's meter counts.
  const aPlaced = new Set(placed.map((x: any) => x.gatewayId));
  check('A and B place no gateway in common', gb.body.gateways.every((x: any) => !aPlaced.has(x.gatewayId)));
  const bHeard = new Map<string, number>([...gb.body.gateways, ...gb.body.unplaced].map((x: any) => [x.gatewayId, x.metersHeard]));
  const bTotalHeard = [...bHeard.values()].reduce((a, b) => a + b, 0);
  check("B's gateway stats count only B's meters", bTotalHeard <= mb.body.summary.total - mb.body.summary.never, `${bTotalHeard} <= ${mb.body.summary.total - mb.body.summary.never}`);
  const pb = await get('/api/network/meters?siteId=ALL&limit=200', B.token);
  check('B table contains none of A meters', pb.body.items.every((i: any) => !aIds.has(i.meterId)));

  // --- meter detail (the Meter 360 drawer) ---
  const liveRow = map.rows.find((r: any[]) => r[4] === 0) ?? map.rows.find((r: any[]) => r[4] === 1); // connected, else disconnected
  const d = await get(`/api/gis/meter-detail/${liveRow[1]}?meterId=${liveRow[0]}`, A.token);
  check('meter detail 200', d.status === 200, `${d.ms} ms`);
  const det = d.body;
  check('detail is for the asked meter', det?.meterId === liveRow[0] && det?.assetId === liveRow[1]);
  const days = det?.dailyReadings ?? [];
  check('days are real: at most 10, oldest first, nothing padded', days.length <= 10 && days.every((x: any, i: number) => x.date && (i === 0 || days[i - 1].date < x.date)), `${days.length} days`);
  check('no placeholder days (no zero rows without a date)', days.every((x: any) => /^\d{4}-\d{2}-\d{2}$/.test(x.date)));
  check('days carry only known fields (no invented flow, packets or flags)', days.every((x: any) => !('minFlowLph' in x) && !('uplinksReceived' in x) && !('flag' in x)));
  check('latest reading and time come from the database', det.latestReading != null && !!det.lastSeen, `reading ${det.latestReading}`);
  check('unknown values are null, not stand-ins', det.consumer.status === null || typeof det.consumer.status === 'string');
  check('upstream parts that failed are named, not hidden', Array.isArray(det.unavailable));
  const direct = await pool.query(`SELECT day::text AS day, used_kl FROM water_meter_daily WHERE meter_id = $1 ORDER BY day DESC LIMIT 10`, [liveRow[0]]);
  check('daily rows equal water_meter_daily (what the Dashboard reads)', days.length === direct.rows.length && days.every((x: any) => direct.rows.some((r: any) => r.day === x.date && Math.round(Number(r.used_kl) * 1000) === x.consumptionL)));
  const core = await get(`/api/gis/meter-detail/${liveRow[1]}?meterId=${liveRow[0]}&core=1`, A.token);
  check('core detail is database-only, flagged partial and fast (<1.5 s)', core.status === 200 && core.body.partial === true && core.body.photos.length === 0 && core.body.dailyReadings.length === days.length && core.ms < 1500, `${core.ms} ms`);
  const noMeter = await get(`/api/gis/meter-detail/${liveRow[1]}`, A.token);
  check('detail without meterId resolves from the database', noMeter.status === 200 && noMeter.body.meterId === liveRow[0]);
  const bRow = mb.body.rows[0];
  check("A asking for B's meter detail -> 404", (await get(`/api/gis/meter-detail/${bRow[1]}`, A.token)).status === 404);
  check("A's asset with B's meter id -> 404", (await get(`/api/gis/meter-detail/${liveRow[1]}?meterId=${bRow[0]}`, A.token)).status === 404);
  check('non-numeric asset id -> 404', (await get('/api/gis/meter-detail/abc', A.token)).status === 404);
  check('no token -> 401', (await get(`/api/gis/meter-detail/${liveRow[1]}`)).status === 401);

  // --- the older /api/gis routes now share the same data (Gateway Placement and the household / billing / alarm lookups) ---
  const gm = await get('/api/gis/meters?limit=all', A.token);
  check('/api/gis/meters 200', gm.status === 200, `${gm.ms} ms`);
  check('gis meters = the meters of the map that have a position', gm.body.meters.length === map.rows.length && gm.body.summary.totalMeters >= gm.body.meters.length, `${gm.body.meters.length}`);
  check('gis meters carry real values only (no guessed city, no made-up consumer text)', gm.body.meters.every((m: any) => !('city' in m) && (m.householdName === null || !/^Consumer \(/.test(m.householdName))));
  check('gis meter status uses the shared scale', gm.body.meters.every((m: any) => ['live', 'stale', 'silent', 'never'].includes(m.status)));
  const hh = gm.body.meters.find((m: any) => m.householdId);
  check('household lookup fields are filled from the mirror', !!hh && !!hh.householdShortId && hh.assetId === Number(hh.assetId));
  const withUse = gm.body.meters.filter((m: any) => m.yesterdayConsumptionL != null).length;
  check('daily figures come through for meters that have them', withUse > 0, `${withUse} meters`);
  const gg = await get('/api/gis/gateways?siteId=ALL', A.token);
  check('/api/gis/gateways 200 with the old field names', gg.status === 200 && gg.body.length === placed.length && gg.body.every((x: any) => x.gatewayId && x.alias && x.metersObserved != null), `${gg.body?.length}`);
  check("A asking /api/gis/meters for B's site -> 404", (await get(`/api/gis/meters?siteId=${bOnly?.id}`, A.token)).status === 404);
  const gmB = await get('/api/gis/meters?limit=all', B.token);
  const aMeterIds = new Set(gm.body.meters.map((m: any) => m.meterId));
  check('B /api/gis/meters shares no meter with A', gmB.status === 200 && gmB.body.meters.every((m: any) => !aMeterIds.has(m.meterId)), `${gmB.body?.meters?.length} meters`);

  // --- Gateway Placement: add gateways / optimise existing ones (computed here, from the same meters and gateways) ---
  const post = async (path: string, body: unknown, token?: string) => {
    const t0 = performance.now();
    const r = await fetch(BASE + path, { method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: (await r.json().catch(() => null)) as any, ms: Math.round(performance.now() - t0) };
  };
  const leafId = A.sites.find((x) => !A.sites.some((c) => c.parentSite === x.id))?.id;
  const pl = await post('/api/gis/gateway-placement/compute', { siteId: 'ALL', gatewayCount: 25, coverageRadiusM: 800 }, A.token);
  check('placement 200', pl.status === 200, `${pl.ms} ms (engine ${pl.body?.computeMs} ms)`);
  check('placement plans for the meters the map draws', pl.body?.totalMeters === map.rows.length, `${pl.body?.totalMeters} vs ${map.rows.length}`);
  check('placement: the count is a maximum and the stop reason says why', pl.body?.gateways.length <= 25 && ['all-covered', 'target-reached', 'low-gain', 'max-gateways', 'already-covered'].includes(pl.body?.stopReason), `${pl.body?.gateways.length} gateways, ${pl.body?.stopReason}`);
  check('placement numbers add up', pl.body && pl.body.coveredByExisting + pl.body.newlyCovered === pl.body.totalMetersCovered && pl.body.totalMetersCovered + pl.body.uncovered === pl.body.totalMeters
    && pl.body.gateways.reduce((n: number, g: any) => n + g.metersCoveredCount, 0) === pl.body.newlyCovered);
  check('placement: gateways ranked, every one worth its minimum', pl.body?.gateways.every((g: any, k: number) => g.gatewayNumber === k + 1 && g.onlyThisOne >= pl.body.minNewMetersUsed));
  const plLeaf = await post('/api/gis/gateway-placement/compute', { siteId: String(leafId), gatewayCount: 25, coverageRadiusM: 500 }, A.token);
  check('placement for a small site stops early on its own', plLeaf.status === 200 && plLeaf.body.gateways.length < 25, `${plLeaf.body?.gateways.length} gateways for site ${leafId} (${plLeaf.body?.stopReason})`);
  const again = await post('/api/gis/gateway-placement/compute', { siteId: 'ALL', gatewayCount: 25, coverageRadiusM: 800 }, A.token);
  check('the same request again is answered from the plan already worked out', again.status === 200 && JSON.stringify(again.body.gateways) === JSON.stringify(pl.body.gateways), `${again.ms} ms`);
  const rl = await post('/api/gis/gateway-placement/relocate', { siteId: 'ALL', coverageRadiusM: 800 }, A.token);
  check('relocation 200', rl.status === 200, `${rl.ms} ms (engine ${rl.body?.computeMs} ms)`);
  check('relocation never adds gateways and never lowers coverage beyond the removal budget', rl.body && rl.body.items.length === placed.length && rl.body.coveredAfter >= rl.body.coveredBefore - rl.body.removalLoss && rl.body.removalLoss <= rl.body.minGainUsed,
    `${rl.body?.coverageBeforePercent}% -> ${rl.body?.coverageAfterPercent}%, ${rl.body?.moves} moves, ${rl.body?.removals} removals`);
  check('relocation: every move is worth its minimum', rl.body?.items.every((i: any) => i.verdict !== 'move' || i.net >= rl.body.minGainUsed));
  const firstMove = rl.body?.items.find((i: any) => i.verdict === 'move');
  if (firstMove) {
    const rlLocked = await post('/api/gis/gateway-placement/relocate', { siteId: 'ALL', coverageRadiusM: 800, lockedGatewayIds: [firstMove.id] }, A.token);
    check('a locked gateway is never moved', rlLocked.status === 200 && rlLocked.body.items.find((i: any) => i.id === firstMove.id)?.verdict === 'locked');
  }
  check('placement / relocation validate their input', (await Promise.all([
    post('/api/gis/gateway-placement/compute', { siteId: 'ALL', gatewayCount: 0, coverageRadiusM: 800 }, A.token),
    post('/api/gis/gateway-placement/compute', { siteId: 'ALL', gatewayCount: 5, coverageRadiusM: 'x' }, A.token),
    post('/api/gis/gateway-placement/relocate', { siteId: 'ALL', coverageRadiusM: 800, existingMode: 'none' }, A.token),
    post('/api/gis/gateway-placement/relocate', { siteId: 'ALL', coverageRadiusM: 800, lockedGatewayIds: ['nope'] }, A.token),
  ])).every((x) => x.status === 400));
  check('placement without a sign-in -> 401', (await post('/api/gis/gateway-placement/compute', { siteId: 'ALL', gatewayCount: 5, coverageRadiusM: 800 })).status === 401);
  if (bOnly) {
    check("A planning on B's site -> 404", (await post('/api/gis/gateway-placement/compute', { siteId: String(bOnly.id), gatewayCount: 5, coverageRadiusM: 800 }, A.token)).status === 404);
    check("A optimising B's site -> 404", (await post('/api/gis/gateway-placement/relocate', { siteId: String(bOnly.id), coverageRadiusM: 800 }, A.token)).status === 404);
  }
  // a run on one site must not move or remove a gateway that also serves meters of other sites
  const scopedRoot = A.sites.find((x) => !x.parentSite && A.sites.some((c) => c.parentSite === x.id))?.id ?? rootId;
  const scopeIds = new Set<number>([scopedRoot]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const x of A.sites) if (x.parentSite && scopeIds.has(x.parentSite) && !scopeIds.has(x.id)) { scopeIds.add(x.id); grew = true; }
  }
  const servesOutside = new Set<string>();
  for (const r of map.rows) if (r[5] >= 0 && !scopeIds.has(r[8])) servesOutside.add(map.gatewayIds[r[5]]);
  const rlSite = await post('/api/gis/gateway-placement/relocate', { siteId: String(scopedRoot), coverageRadiusM: 800 }, A.token);
  const touched = (rlSite.body?.items ?? []).filter((i: any) => i.verdict === 'move' || i.verdict === 'remove');
  check('a one-site relocation never touches a gateway that also serves other sites', rlSite.status === 200 && touched.every((i: any) => !servesOutside.has(i.id)),
    `${touched.length} changes, ${rlSite.body?.items?.filter((i: any) => i.lockedReason === 'serves-other-sites').length} locked as serving other sites`);

  const rlB = await post('/api/gis/gateway-placement/relocate', { siteId: 'ALL', coverageRadiusM: 800 }, B.token);
  const aGatewayIds = new Set(placed.map((g: any) => g.gatewayId));
  check("B's relocation plan holds none of A's gateways", rlB.status === 200 && rlB.body.items.every((i: any) => !aGatewayIds.has(i.id)), `${rlB.body?.items?.length} gateways`);

  console.log(`\n${pass} passed, ${fail} failed`);
} catch (err) {
  console.error('Test crashed:', err);
  fail++;
} finally {
  server.close();
  await pool.end();
  process.exit(fail ? 1 : 0);
}
