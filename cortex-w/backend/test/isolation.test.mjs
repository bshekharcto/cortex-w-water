// Two-client isolation test. Run against a locally running backend that talks to the
// REAL upstream:   npm run test:isolation
//
// Credentials come from backend/.env (never printed):
//   TEST_CLIENT_A_USER / TEST_CLIENT_A_PASS   a login of one client
//   TEST_CLIENT_B_USER / TEST_CLIENT_B_PASS   a login of a DIFFERENT client
// Optional, enables the checks that read the ownership tables directly:
//   TEST_DB_URL            Postgres URL of the database the running backend uses
//   TEST_CLIENT_A_KEY      client key of A (e.g. 91), TEST_CLIENT_B_KEY (e.g. 101)
//   TEST_BASE_URL          default http://localhost:4000
//
// TEST_DB_URL must be a throwaway database: this test triggers ingestion and the
// first (multi-minute) inventory load for each client. Never use a shared or
// production database.
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:4000';
const DB_URL = process.env.TEST_DB_URL;
const KEY_A = process.env.TEST_CLIENT_A_KEY;
const KEY_B = process.env.TEST_CLIENT_B_KEY;
for (const v of ['TEST_CLIENT_A_USER', 'TEST_CLIENT_A_PASS', 'TEST_CLIENT_B_USER', 'TEST_CLIENT_B_PASS']) {
  if (!process.env[v]) {
    console.error(`Missing ${v} (set it in backend/.env)`);
    process.exit(2);
  }
}
if (DB_URL && !(KEY_A && KEY_B)) {
  console.error('TEST_DB_URL also needs TEST_CLIENT_A_KEY and TEST_CLIENT_B_KEY');
  process.exit(2);
}
const db = DB_URL ? new pg.Pool({ connectionString: DB_URL }) : null;

let pass = 0, fail = 0, skipped = 0;
const check = (name, ok, extra = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
const skip = (name) => { skipped++; console.log(`SKIP  ${name}  — needs TEST_DB_URL`); };

async function call(token, method, path, body, raw) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
    signal: AbortSignal.timeout(900_000),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text };
}
async function login(k) {
  const r = await call(null, 'POST', '/api/auth/login', { username: process.env[`TEST_CLIENT_${k}_USER`], password: process.env[`TEST_CLIENT_${k}_PASS`] });
  if (r.status !== 200) throw new Error(`login ${k} failed: ${r.status}`);
  return r.json.token;
}
const intersect = (a, b) => [...a].filter((x) => b.has(x));

// ---- 1. unauthenticated / forged / expired ---------------------------------
const protectedPaths = ['/api/sites', '/api/dashboard/view', '/api/gis/meters', '/api/gis/gateways', '/api/command-center/summary',
  '/api/command-center/feed', '/api/households', '/api/billing', '/api/alarms', '/api/command-center/executive-summary'];
for (const p of protectedPaths) {
  const r = await call(null, 'GET', p);
  check(`no token -> 401  ${p}`, r.status === 401, `got ${r.status}`);
}
check('cron without secret -> 401', (await call(null, 'GET', '/api/command-center/sync-cron')).status === 401);
const wrongCron = await fetch(BASE + '/api/command-center/sync-cron', { headers: { Authorization: 'Bearer definitely-not-the-secret' } });
check('cron with wrong secret -> 401', wrongCron.status === 401, `got ${wrongCron.status}`);
const forged = jwt.sign({ sub: '1', userName: 'x', Roles: ['Root'] }, 'attacker-secret', { algorithm: 'HS512', expiresIn: '1h', issuer: 'Cognecto', audience: 'Cognecto Users' });
check('forged (well-formed, unexpired) token -> 401', (await call(forged, 'GET', '/api/sites')).status === 401);
const expired = jwt.sign({ sub: '1', Roles: ['Root'] }, 'x', { algorithm: 'HS512', expiresIn: -10 });
check('expired token -> 401', (await call(expired, 'GET', '/api/sites')).status === 401);
const noneAlg = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: '1', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.`;
check('alg=none token -> 401', (await call(noneAlg, 'GET', '/api/sites')).status === 401);

// ---- 2. lockout + error handling --------------------------------------------
const ghost = `nobody-${process.pid}-${Math.random().toString(36).slice(2)}`; // never a real account
let last = 0;
for (let i = 0; i < 11; i++) last = (await call(null, 'POST', '/api/auth/login', { username: ghost, password: 'x' })).status;
check('11th failed login in a row is rate limited (429)', last === 429, `got ${last}`);
const badJson = await call(null, 'POST', '/api/auth/login', undefined, '{"username": ');
check('malformed JSON -> 400 with a generic message', badJson.status === 400 && badJson.json?.error === 'Invalid JSON', `got ${badJson.status} ${badJson.text.slice(0, 60)}`);
const tooBig = await call(null, 'POST', '/api/auth/login', undefined, JSON.stringify({ username: 'x'.repeat(200_000), password: 'y' }));
check('oversized body -> 413', tooBig.status === 413, `got ${tooBig.status}`);

// ---- 3. login both clients ---------------------------------------------------
const tokA = await login('A');
const tokB = await login('B');
check('both clients can log in', !!tokA && !!tokB);
const unknown = await call(tokA, 'GET', '/api/does-not-exist');
check('unknown API path -> JSON 404, nothing leaked', unknown.status === 404 && unknown.json?.error === 'Not found', `got ${unknown.status}`);

// ---- 4. site lists ----------------------------------------------------------
const sitesA = (await call(tokA, 'GET', '/api/sites')).json ?? [];
const sitesB = (await call(tokB, 'GET', '/api/sites')).json ?? [];
const idsA = new Set(sitesA.map((s) => s.id).filter((i) => i !== 'ALL'));
const idsB = new Set(sitesB.map((s) => s.id).filter((i) => i !== 'ALL'));
check('A sees sites', idsA.size > 0, `${idsA.size} sites`);
check('B sees sites', idsB.size > 0, `${idsB.size} sites`);
check('site lists are disjoint', intersect(idsA, idsB).length === 0);

// ---- 5. cross-site access is 404 -------------------------------------------
const aSite = [...idsA][0], bSite = [...idsB][0];
for (const [who, tok, foreign, own] of [['A', tokA, bSite, aSite], ['B', tokB, aSite, bSite]]) {
  for (const p of [`/api/dashboard/view?nodeId=${foreign}`, `/api/gis/meters?siteId=${foreign}`, `/api/gis/gateways?siteId=${foreign}`,
    `/api/gis/geofences?siteIds=${foreign}`, `/api/gis/asset-locations?siteIds=${foreign}`, `/api/gis/performance?siteId=${foreign}`,
    `/api/command-center/summary?siteId=${foreign}`, `/api/command-center/meter-health?siteIds=${foreign}`,
    `/api/command-center/gateway-performance?siteIds=${foreign}&fromDate=2026-10-01&toDate=2026-10-06`]) {
    const r = await call(tok, 'GET', p);
    check(`${who} asking for other client's site -> 404  ${p.split('?')[0]}`, r.status === 404, `got ${r.status}`);
  }
  const mixed = await call(tok, 'GET', `/api/gis/meters?siteId=${foreign},${own}`);
  check(`${who} mixed own+foreign site list -> 404`, mixed.status === 404, `got ${mixed.status}`);
}

// ---- 6. dashboard: order A, B, A so any shared cache would bleed -------------
const viewA1 = await call(tokA, 'GET', '/api/dashboard/view');
const viewB = await call(tokB, 'GET', '/api/dashboard/view');
const viewA2 = await call(tokA, 'GET', '/api/dashboard/view');
check('dashboard root loads for A', viewA1.status === 200, `status ${viewA1.status}`);
check('dashboard root loads for B', viewB.status === 200, `status ${viewB.status}`);
const rootIds = (v) => new Set((v.json?.children ?? []).map((c) => String(c.id)));
check('dashboard roots disjoint', intersect(rootIds(viewA1), rootIds(viewB)).length === 0);
check('dashboard roots only own sites', [...rootIds(viewA1)].every((i) => idsA.has(i)) && [...rootIds(viewB)].every((i) => idsB.has(i)));
check('A unchanged after B warmed caches', JSON.stringify([...rootIds(viewA1)]) === JSON.stringify([...rootIds(viewA2)]));

// ---- 7. GIS ------------------------------------------------------------------
const gisA = await call(tokA, 'GET', '/api/gis/meters?limit=all');
const gisB = await call(tokB, 'GET', '/api/gis/meters?limit=all');
const mA = new Set((gisA.json?.meters ?? []).map((m) => m.meterId));
const mB = new Set((gisB.json?.meters ?? []).map((m) => m.meterId));
check('GIS meters returned for both', mA.size > 0 && mB.size > 0, `A=${mA.size} B=${mB.size}`);
check('GIS meter sets disjoint', intersect(mA, mB).length === 0);

// ---- 8. households / alarms / billing: ids of the OTHER client ---------------
const hhList = async (t) => (await call(t, 'GET', '/api/households?page=0&size=20')).json?.content ?? [];
const hA = await hhList(tokA), hB = await hhList(tokB);
check('household lists disjoint', intersect(new Set(hA.map((h) => h.customId)), new Set(hB.map((h) => h.customId))).length === 0);
if (hA.length && hB.length) {
  const own = await call(tokA, 'GET', `/api/households/${encodeURIComponent(hA[0].customId)}/detail`);
  check('A can open its own household detail', own.status === 200 && !!own.json?.consumer?.name, `got ${own.status}`);
  for (const [who, tok, victim] of [['B', tokB, hA[0]], ['A', tokA, hB[0]]]) {
    for (const id of [victim.customId, String(victim.id)]) {
      const r = await call(tok, 'GET', `/api/households/${encodeURIComponent(id)}/detail`);
      check(`${who} opening other client's household detail (${id === victim.customId ? 'customId' : 'numeric id'}) -> 404, no consumer data`,
        r.status === 404 && !r.json?.consumer, `got ${r.status}`);
    }
    const single = await call(tok, 'GET', `/api/households/${encodeURIComponent(victim.customId)}`);
    check(`${who} single household lookup of other client's household -> 404`, single.status === 404, `got ${single.status}`);
  }
} else {
  skip('household cross-client detail (a client has no households)');
}
const alarmsA = (await call(tokA, 'GET', '/api/alarms?page=0&size=5')).json?.content ?? [];
if (alarmsA.length) {
  const r1 = await call(tokB, 'GET', `/api/alarms/${alarmsA[0].id}`);
  const r2 = await call(tokB, 'GET', `/api/alarms/${alarmsA[0].id}/detail`);
  check("B reading A's alert -> not 200", r1.status !== 200, `got ${r1.status}`);
  check("B reading A's alert detail -> not 200", r2.status !== 200, `got ${r2.status}`);
  check('A can read its own alert', (await call(tokA, 'GET', `/api/alarms/${alarmsA[0].id}`)).status === 200);
  const listB = (await call(tokB, 'GET', '/api/alarms?page=0&size=50')).json?.content ?? [];
  check("B's alert list contains none of A's alerts", !listB.some((a) => alarmsA.some((x) => x.id === a.id)));
} else {
  skip('alert cross-client checks (A has no alerts)');
}
check("B reading a bill id from A's range -> not 200", (await call(tokB, 'GET', '/api/billing/12345/detail')).status !== 200);

// ---- 9. ownership tables, command center, meter detail (need the DB) --------
if (db) {
  const owners = async (key) => new Set((await db.query('SELECT meter_id FROM client_meter_owner WHERE client_key=$1', [key])).rows.map((r) => r.meter_id));
  const oA = await owners(KEY_A), oB = await owners(KEY_B);
  check('ownership populated per client', oA.size > 0 && oB.size > 0, `${KEY_A}:${oA.size} ${KEY_B}:${oB.size}`);
  check('ownership sets disjoint', intersect(oA, oB).length === 0);
  const invSites = async (key) => new Set((await db.query('SELECT DISTINCT site_id FROM client_asset_inventory WHERE client_key=$1', [key])).rows.map((r) => String(r.site_id)));
  check('inventory A only in A sites', [...(await invSites(KEY_A))].every((i) => idsA.has(i)));
  check('inventory B only in B sites', [...(await invSites(KEY_B))].every((i) => idsB.has(i)));
  check('every GIS meter is an owned meter', [...mA].every((m) => oA.has(m)) && [...mB].every((m) => oB.has(m)));

  await call(tokA, 'GET', '/api/command-center/summary?refresh=true&days=1');
  await call(tokB, 'GET', '/api/command-center/summary?refresh=true&days=1');
  const ccA = (await call(tokA, 'GET', '/api/command-center/summary?days=7')).json;
  const ccB = (await call(tokB, 'GET', '/api/command-center/summary?days=7')).json;
  const ccMeters = (cc) => new Set(Object.values(cc?.metersByGateway ?? {}).flat().map((m) => m.meterId));
  const cmA = ccMeters(ccA), cmB = ccMeters(ccB);
  check('command-center summary served for both', !!ccA?.kpis && !!ccB?.kpis, `A meters=${cmA.size} B meters=${cmB.size}`);
  check('command-center meters disjoint', intersect(cmA, cmB).length === 0);
  check('command-center A meters all owned by A', [...cmA].every((m) => oA.has(m)));
  check('command-center B meters all owned by B', [...cmB].every((m) => oB.has(m)));
  const gA = new Set((ccA?.gateways ?? []).map((g) => g.gatewayId)), gB = new Set((ccB?.gateways ?? []).map((g) => g.gatewayId));
  check('command-center gateways disjoint', intersect(gA, gB).length === 0);
  const feedA = (await call(tokA, 'GET', '/api/command-center/feed?limit=500')).json ?? [];
  const feedB = (await call(tokB, 'GET', '/api/command-center/feed?limit=500')).json ?? [];
  check('live feed only own meters', feedA.every((f) => oA.has(f.meterId)) && feedB.every((f) => oB.has(f.meterId)), `A=${feedA.length} B=${feedB.length}`);
  const stray = await db.query(`SELECT count(*)::int n FROM raw_telemetry_packets p
    WHERE NOT EXISTS (SELECT 1 FROM client_meter_owner o WHERE o.meter_id = p.meter_id)`);
  check('no ingested frame belongs to a meter nobody owns', stray.rows[0].n === 0, `stray=${stray.rows[0].n}`);

  const pick = async (key) => (await db.query('SELECT asset_id, meter_id FROM client_meter_owner WHERE client_key=$1 LIMIT 1', [key])).rows[0];
  const a = await pick(KEY_A), b = await pick(KEY_B);
  const own = await call(tokA, 'GET', `/api/gis/meter-detail/${a.asset_id}?meterId=${encodeURIComponent(a.meter_id)}`);
  check('A can open its own meter detail', own.status === 200, `got ${own.status}`);
  check("A opening B's meter detail (asset id) -> 404", (await call(tokA, 'GET', `/api/gis/meter-detail/${b.asset_id}`)).status === 404);
  check("B opening A's meter detail (asset id) -> 404", (await call(tokB, 'GET', `/api/gis/meter-detail/${a.asset_id}`)).status === 404);
  const mixedDetail = await call(tokB, 'GET', `/api/gis/meter-detail/${b.asset_id}?meterId=${encodeURIComponent(a.meter_id)}`);
  check("B's own asset id with A's meterId -> 404 (no consumer details)", mixedDetail.status === 404 && !mixedDetail.json?.consumer, `got ${mixedDetail.status}`);
} else {
  for (const n of ['ownership tables', 'command-center scoping', 'meter-detail cross-client']) skip(n);
}

console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`);
await db?.end();
process.exit(fail ? 1 : 0);
