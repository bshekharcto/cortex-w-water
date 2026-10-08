// SQL-level tests for the Command Center read paths, run against a THROWAWAY local Postgres.
//
//   TEST_DB_URL=postgres://postgres@127.0.0.1:55999/cortex_test npm run test:integration
//
// Safety: this test TRUNCATES the telemetry and ownership tables, so it refuses any database that is not on
// localhost with "test" in its name. Never point it at the shared RDS/Neon database. Without TEST_DB_URL
// the whole file is skipped.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DB_URL = process.env.TEST_DB_URL;
const skip = !DB_URL;

if (DB_URL) {
  const u = new URL(DB_URL);
  if (!['localhost', '127.0.0.1', '::1'].includes(u.hostname) || !/test/i.test(u.pathname)) {
    console.error('Refusing to run: TEST_DB_URL must be a local database with "test" in its name.');
    process.exit(2);
  }
  process.env.DATABASE_URL = DB_URL;
  process.env.APP_DATA_MODE = 'seed'; // no upstream is ever called
}

const here = dirname(fileURLToPath(import.meta.url));
const migration = (f: string) => readFileSync(join(here, '../src/db/migrations', f), 'utf8');

// "Now" is fixed at 01:30 IST on 7 Oct, i.e. the UTC date is still 6 Oct: the case the old UTC bounds got wrong.
const NOW = new Date('2026-10-06T20:30:00.000Z');

const ctx = (key: string) => ({ key, clientIds: [Number(key)], token: '', sites: [], siteIds: new Set<number>(), unscoped: false });
const A = ctx('91');
const B = ctx('101');

let pool: any;
let run: <T>(c: ReturnType<typeof ctx>, fn: () => Promise<T>) => Promise<T>;
let svc: typeof import('../src/services/telemetryDbService.js');

// [meter, gateway, decoded_at, date_key (IST day), rssi, snr, fcnt, dr]
const PACKETS: Array<[string, string, string, string, number, number, number, number]> = [
  ['m1', 'g1', '2026-10-06T20:10:00Z', '2026-10-07', -70, 6, 1, 5],
  ['m1', 'g2', '2026-10-06T20:11:00Z', '2026-10-07', -97, -12, 1, 5], // same uplink heard by a second gateway
  ['m2', 'g1', '2026-10-06T10:00:00Z', '2026-10-06', -85, 2, 7, 3],
  ['m4', 'g2', '2026-10-03T10:00:00Z', '2026-10-03', -92, -3, 4, 0], // silent: last heard > 48h before NOW
  ['m3', 'g1', '2026-10-06T20:12:00Z', '2026-10-07', -60, 8, 2, 5], // another client's meter
];

before(async () => {
  if (skip) return;
  const pg = (await import('pg')).default;
  pool = new pg.Pool({ connectionString: DB_URL });
  for (const f of ['005_raw_telemetry.sql', '009_client_scoping.sql']) await pool.query(migration(f));
  await pool.query('TRUNCATE raw_telemetry_packets, client_meter_owner, client_inventory_snapshot, telemetry_aggregation_cache');

  const owner = [['91', 'm1'], ['91', 'm2'], ['91', 'm4'], ['101', 'm3']];
  for (const [k, m] of owner) {
    await pool.query('INSERT INTO client_meter_owner (client_key, meter_id, asset_id, site_id, run_id) VALUES ($1,$2,1,1,1)', [k, m]);
  }
  // A fresh, empty inventory snapshot per client, so nothing tries to load one from the upstream
  const empty = gzipSync(Buffer.from('[]')).toString('base64');
  for (const k of ['91', '101']) {
    await pool.query('INSERT INTO client_inventory_snapshot (client_key, completed_at, row_count, data_gz_b64) VALUES ($1, NOW(), 0, $2)', [k, empty]);
  }
  for (const [m, g, at, dk, rssi, snr, fcnt, dr] of PACKETS) {
    await pool.query(
      `INSERT INTO raw_telemetry_packets (meter_id, gateway_id, dev_eui, decoded_at, date_key, rssi, snr, fcnt, dr, frequency, confirmed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,865062500,false)`,
      [m, g, `eui-${m}`, at, dk, rssi, snr, fcnt, dr]
    );
  }

  const cc = await import('../src/services/clientContext.js');
  run = (c, fn) => cc.runWithClient(c as any, fn);
  svc = await import('../src/services/telemetryDbService.js');
});

after(async () => {
  if (skip) return;
  await pool.end();
  const { pool: appPool } = await import('../src/db/pool.js');
  await appPool.end();
});

const win = (req: Parameters<typeof import('../src/services/telemetry/windows.js').resolveWindow>[0]) =>
  import('../src/services/telemetry/windows.js').then((m) => m.resolveWindow(req, NOW));

test('1H window at 01:30 IST still sees frames carrying the new IST date_key', { skip }, async () => {
  const w = await win({ hours: 1 });
  assert.equal(w.toDate, '2026-10-07');
  const page = await run(A, () => svc.getFleetFrames(w, 'ALL', 100, 0));
  assert.equal(page.total, 2); // m1 via g1 and g2; m3 belongs to the other client
});

test('a client never sees another client\'s meters, frames or searches', { skip }, async () => {
  const w = await win({ hours: 24 });
  const g1 = await run(A, () => svc.getGatewayMeters('g1', w));
  assert.deepEqual(g1.map((m) => m.meterId).sort(), ['m1', 'm2']);
  assert.equal(await run(A, () => svc.getMeter('m3', w)), null);
  assert.equal((await run(A, () => svc.getMeterFrames('m3', w, 20, 0))).total, 0);
  assert.equal((await run(A, () => svc.getGatewayFrames('g1', w, 100, 0))).total, 2);
  assert.deepEqual(await run(A, () => svc.searchMeters('m3', w)), []);
  const b = await run(B, () => svc.getMeter('m3', w));
  assert.equal(b?.meter.meterId, 'm3');
});

test('getMeter: exact match with every gateway that heard it, newest first', { skip }, async () => {
  const w = await win({ hours: 24 });
  const hit = await run(A, () => svc.getMeter('m1', w));
  assert.ok(hit);
  assert.equal(hit.gatewayId, 'g2'); // the later frame
  assert.equal(hit.meter.otherGatewaysCount, 1);
  assert.deepEqual(hit.meter.gatewaysHeard.map((g) => g.gatewayId), ['g2', 'g1']);
  assert.ok(hit.meter.diagnostics.includes('multi-gw'));
  assert.ok(hit.meter.diagnostics.includes('weak-rssi')); // latest frame is -97 dBm
  assert.equal((await run(A, () => svc.getMeter('eui-m2', w)))?.meter.meterId, 'm2'); // DevEUI works too
  assert.equal(await run(A, () => svc.getMeter('m', w)), null); // exact, not a substring
});

test('meter frames: newest first and flagged multi-gateway', { skip }, async () => {
  const w = await win({ hours: 24 });
  const page = await run(A, () => svc.getMeterFrames('m1', w, 20, 0));
  assert.equal(page.total, 2);
  assert.deepEqual(page.items.map((f) => f.gatewayId), ['g2', 'g1']);
  assert.ok(page.items.every((f) => f.multiGateway));
});

test('fleet meters: freshness status filter, totals and facets', { skip }, async () => {
  const w = await win({ days: 7 });
  const base = { win: w, siteId: 'ALL', limit: 100, offset: 0 };
  const all = await run(A, () => svc.listFleetMeters(base));
  assert.equal(all.total, 3);
  assert.deepEqual(all.items.map((m) => m.meterId), ['m1', 'm2', 'm4']); // newest frame first
  assert.deepEqual(all.facets.dr, [0, 3, 5]);
  const silent = await run(A, () => svc.listFleetMeters({ ...base, status: 'silent' }));
  assert.deepEqual(silent.items.map((m) => m.meterId), ['m4']);
  const live = await run(A, () => svc.listFleetMeters({ ...base, status: 'live' }));
  assert.deepEqual(live.items.map((m) => m.meterId), ['m1', 'm2']);
  const dr3 = await run(A, () => svc.listFleetMeters({ ...base, dr: 3 }));
  assert.deepEqual(dr3.items.map((m) => m.meterId), ['m2']);
  const page2 = await run(A, () => svc.listFleetMeters({ ...base, limit: 2, offset: 2 }));
  assert.equal(page2.total, 3);
  assert.deepEqual(page2.items.map((m) => m.meterId), ['m4']);
});

test('search: substring on meter id and DevEUI, capped, own client only', { skip }, async () => {
  const w = await win({ days: 7 });
  const hits = await run(A, () => svc.searchMeters('m', w));
  assert.deepEqual(hits.map((h) => h.meter.meterId), ['m1', 'm2', 'm4']);
  assert.equal((await run(A, () => svc.searchMeters('eui-m4', w)))[0].gatewayId, 'g2');
});

test('radio health: bands and weak-link counts come from the stored frames', { skip }, async () => {
  const w = await win({ hours: 1 });
  const r = await run(A, () => svc.getRadioHealth({ win: w }));
  assert.equal(r.totals.frames, 2);
  assert.equal(r.totals.meters, 1);
  assert.equal(r.rssiBuckets.strong, 1); // -70
  assert.equal(r.rssiBuckets.weak, 1); // -97
  assert.equal(r.snrBuckets.excellent, 1); // 6
  assert.equal(r.snrBuckets.poor, 1); // -12
  assert.equal(r.weakLinkMeters, 1); // m1's latest frame is -97 dBm / -12 dB
  const gw = await run(A, () => svc.getRadioHealth({ win: w, gatewayId: 'g1' }));
  assert.equal(gw.totals.frames, 1);
});

test('traffic: zero-filled buckets, totals match, previous period is aligned', { skip }, async () => {
  const w = await win({ hours: 1 });
  const t = await run(A, () => svc.getTraffic({ win: w }));
  assert.equal(t.bucket, '5m');
  assert.equal(t.totals.frames, 2);
  assert.equal(t.totals.meters, 1);
  assert.equal(t.current.reduce((s, p) => s + p.frames, 0), 2);
  assert.equal(t.previous.length, t.current.length);
  assert.ok(t.current.length >= 12 && t.current.length <= 13);
  const w7 = await win({ days: 7 });
  const d7 = await run(A, () => svc.getTraffic({ win: w7 }));
  assert.equal(d7.bucket, '1d');
  assert.equal(d7.totals.frames, 4); // m1 x2, m2, m4 — never m3
});
