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
const { pool } = await import('../src/db/pool.js');
const { config } = await import('../src/config/env.js');

const app = express();
app.use(compression());
app.use(authMiddleware);
app.use(requireAuth);
app.use('/api/network', networkRoutes);
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
  check('summary adds up: statuses = total', s && s.live + s.stale + s.silent + s.never === s.total, JSON.stringify(s));
  check('summary adds up: with + without coordinates = total', s && s.withCoordinates + s.withoutCoordinates === s.total);
  check('rows = meters with coordinates', map?.rows?.length === s?.withCoordinates);
  check('coordinates came from upstream', map?.coordinates?.status === 'fresh', map?.coordinates?.status);
  check('every row is drawable and well-formed', map.rows.every((r: any[]) => r.length === map.columns.length && Math.abs(r[2]) <= 90 && Math.abs(r[3]) <= 180 && !(r[2] === 0 && r[3] === 0) && r[4] >= 0 && r[4] < 4 && r[5] >= -1 && r[5] < map.gatewayIds.length));
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
  const live = await get('/api/network/meters?siteId=ALL&status=live&limit=5', A.token);
  check('status filter returns only that status', live.body.items.every((i: any) => i.status === 'live') && live.body.total === s.live, `live ${live.body?.total}`);
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

  console.log(`\n${pass} passed, ${fail} failed`);
} catch (err) {
  console.error('Test crashed:', err);
  fail++;
} finally {
  server.close();
  await pool.end();
  process.exit(fail ? 1 : 0);
}
