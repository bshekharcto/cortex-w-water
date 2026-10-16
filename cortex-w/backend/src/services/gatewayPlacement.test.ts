import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoMinNewMeters, planGateways, type PlanExisting, type PlanMeter } from './gatewayPlacement.js';

// Positions are built in metres east / north of a point in Bhubaneswar.
const LAT0 = 20.3;
const LNG0 = 85.8;
const KX = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const at = (eastM: number, northM: number) => ({ lat: LAT0 + northM / 111_320, lng: LNG0 + eastM / KX });

/** A deterministic random generator, so every run of the tests sees the same "random" meters. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

let nextId = 0;
/** n meters spread over a disc of `spreadM` around (east, north). */
function cluster(n: number, eastM: number, northM: number, spreadM: number, seed = 1): PlanMeter[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    const a = r() * 2 * Math.PI;
    const d = Math.sqrt(r()) * spreadM;
    return { id: `m${nextId++}`, ...at(eastM + d * Math.cos(a), northM + d * Math.sin(a)) };
  });
}
const gw = (id: string, eastM: number, northM: number, working = true): PlanExisting => ({ id, ...at(eastM, northM), working });

test('no meters: nothing to place, said so', () => {
  const r = planGateways({ meters: [], existing: [], maxGateways: 5, radiusM: 500 });
  assert.equal(r.stopReason, 'no-meters');
  assert.equal(r.gateways.length, 0);
});

test('meters without a usable position are left out and counted', () => {
  const meters = [...cluster(50, 0, 0, 100), { id: 'z', lat: 0, lng: 0 }, { id: 'n', lat: NaN, lng: 85 }, { id: 'o', lat: 95, lng: 85 }];
  const r = planGateways({ meters, existing: [], maxGateways: 5, radiusM: 500 });
  assert.equal(r.invalidMeters, 3);
  assert.equal(r.metersConsidered, 50);
});

test('the limit is a maximum: 5 allowed, 2 groups -> 2 gateways', () => {
  const meters = [...cluster(300, 0, 0, 250, 1), ...cluster(200, 5000, 0, 250, 2)];
  const r = planGateways({ meters, existing: [], maxGateways: 5, radiusM: 500 });
  assert.equal(r.gateways.length, 2);
  assert.equal(r.stopReason, 'all-covered');
  assert.equal(r.totalCovered, 500);
  assert.equal(r.nextGain, null);
  // most valuable first
  assert.deepEqual(r.gateways.map((g) => g.newlyCovered), [300, 200]);
});

test('one group inside one radius -> one gateway, however many are allowed', () => {
  const r = planGateways({ meters: cluster(400, 0, 0, 300), existing: [], maxGateways: 25, radiusM: 500 });
  assert.equal(r.gateways.length, 1);
  assert.equal(r.coverageAfterPercent, 100);
});

test('stray meters do not get a gateway each: stops when the next one would add too little', () => {
  const meters = [...cluster(1000, 0, 0, 300), ...cluster(1, 8000, 0, 0, 3), ...cluster(2, 0, 9000, 10, 4)];
  const r = planGateways({ meters, existing: [], maxGateways: 5, radiusM: 500 });
  assert.equal(r.gateways.length, 1);
  assert.equal(r.stopReason, 'low-gain');
  assert.equal(r.uncovered, 3);
  assert.equal(r.nextGain, 2);
  assert.equal(r.minNewMetersUsed, autoMinNewMeters(1003));
  // and the curve still says what full coverage would take
  assert.equal(r.gatewaysFor['100'], 3);
});

test('a chosen minimum of 1 does give the strays their gateways', () => {
  const meters = [...cluster(1000, 0, 0, 300), ...cluster(1, 8000, 0, 0, 3), ...cluster(2, 0, 9000, 10, 4)];
  const r = planGateways({ meters, existing: [], maxGateways: 5, radiusM: 500, minNewMeters: 1 });
  assert.equal(r.gateways.length, 3);
  assert.equal(r.stopReason, 'all-covered');
});

test('not enough gateways allowed: uses all of them and says more would help', () => {
  const meters = Array.from({ length: 8 }, (_, k) => cluster(100, k * 3000, 0, 200, 10 + k)).flat();
  const r = planGateways({ meters, existing: [], maxGateways: 3, radiusM: 500 });
  assert.equal(r.gateways.length, 3);
  assert.equal(r.stopReason, 'max-gateways');
  assert.equal(r.nextGain, 100);
  assert.equal(r.gatewaysFor['100'], 8);
});

test('target coverage: stops once it is reached', () => {
  const meters = [...cluster(900, 0, 0, 300, 1), ...cluster(50, 5000, 0, 100, 2), ...cluster(50, 0, 5000, 100, 3)];
  const r = planGateways({ meters, existing: [], maxGateways: 5, radiusM: 500, targetCoveragePercent: 90 });
  assert.equal(r.gateways.length, 1);
  assert.equal(r.stopReason, 'target-reached');
});

test('existing gateways: what they reach needs no new gateway', () => {
  const meters = [...cluster(300, 0, 0, 250, 1), ...cluster(200, 5000, 0, 250, 2)];
  const r = planGateways({ meters, existing: [gw('a', 0, 0)], maxGateways: 5, radiusM: 500 });
  assert.equal(r.coveredByExisting, 300);
  assert.equal(r.gateways.length, 1);
  assert.equal(r.gateways[0].newlyCovered, 200);
  assert.equal(r.coverageBeforePercent, 60);
  assert.equal(r.coverageAfterPercent, 100);
  assert.equal(r.gateways[0].nearestExisting?.id, 'a');
});

test('every meter already in reach of an existing gateway -> no new gateway', () => {
  const r = planGateways({ meters: cluster(300, 0, 0, 250), existing: [gw('a', 0, 0)], maxGateways: 5, radiusM: 500 });
  assert.equal(r.gateways.length, 0);
  assert.equal(r.stopReason, 'already-covered');
});

test('existing gateways that stopped working count only when asked to', () => {
  const meters = cluster(300, 0, 0, 250);
  const dead = [gw('a', 0, 0, false)];
  assert.equal(planGateways({ meters, existing: dead, maxGateways: 5, radiusM: 500, existingMode: 'all' }).gateways.length, 0);
  assert.equal(planGateways({ meters, existing: dead, maxGateways: 5, radiusM: 500, existingMode: 'working' }).gateways.length, 1);
  assert.equal(planGateways({ meters, existing: dead, maxGateways: 5, radiusM: 500, existingMode: 'none' }).gateways.length, 1);
});

test('meters at the very same spot (a block of flats) count one by one', () => {
  const spot = at(0, 0);
  const meters = Array.from({ length: 120 }, (_, i) => ({ id: `f${i}`, ...spot }));
  const r = planGateways({ meters, existing: [], maxGateways: 5, radiusM: 300 });
  assert.equal(r.gateways.length, 1);
  assert.equal(r.gateways[0].newlyCovered, 120);
  assert.equal(r.gateways[0].maxDistanceM, 0);
});

test('a radius that covers the whole area -> one gateway', () => {
  const meters = Array.from({ length: 5 }, (_, k) => cluster(50, k * 800, 0, 100, k)).flat();
  const r = planGateways({ meters, existing: [], maxGateways: 10, radiusM: 3000 });
  assert.equal(r.gateways.length, 1);
  assert.equal(r.coverageAfterPercent, 100);
});

test('the answer does not depend on the order of the meters', () => {
  const meters = Array.from({ length: 6 }, (_, k) => cluster(80 + k * 10, (k % 3) * 1400, Math.floor(k / 3) * 1400, 400, 30 + k)).flat();
  const shuffled = [...meters].sort((a, b) => (a.id < b.id ? 1 : -1));
  const a = planGateways({ meters, existing: [], maxGateways: 4, radiusM: 500 });
  const b = planGateways({ meters: shuffled, existing: [], maxGateways: 4, radiusM: 500 });
  assert.deepEqual(a.gateways, b.gateways);
});

test('gateways do not reach the same meters twice in the totals; every served meter is within the radius', () => {
  const meters = Array.from({ length: 9 }, (_, k) => cluster(60, (k % 3) * 700, Math.floor(k / 3) * 700, 350, 50 + k)).flat();
  const r = planGateways({ meters, existing: [], maxGateways: 6, radiusM: 500, minNewMeters: 1 });
  assert.equal(r.gateways.reduce((s, g) => s + g.newlyCovered, 0), r.newlyCovered);
  assert.equal(r.gateways.reduce((s, g) => s + g.addedInOrder, 0), r.newlyCovered);
  assert.ok(r.gateways.every((g) => g.maxDistanceM == null || g.maxDistanceM <= 500.5));
  // the curve rises and its plan part matches the plan
  for (let i = 1; i < r.curve.length; i++) assert.ok(r.curve[i].covered >= r.curve[i - 1].covered);
  assert.equal(r.curve[r.gateways.length].covered, r.totalCovered);
});

test('greedy trap: local search moves the first gateway off the middle', () => {
  // Two groups 900 m apart with a 500 m radius: one gateway at each group reaches everything. Plain greedy is tempted by
  // the spot in between, which reaches part of both groups; with two gateways allowed the plan must reach all meters.
  const meters = [...cluster(150, 0, 0, 200, 61), ...cluster(150, 900, 0, 200, 62)];
  const r = planGateways({ meters, existing: [], maxGateways: 2, radiusM: 500 });
  assert.equal(r.totalCovered, 300);
});

test('close to the best possible: brute force over a fine grid on small cases', (t) => {
  const R = 400;
  let sumRatio = 0;
  const runs = 25;
  for (let seed = 0; seed < runs; seed++) {
    const r = rng(100 + seed);
    const meters: PlanMeter[] = Array.from({ length: 40 }, (_, i) => ({ id: `b${seed}-${i}`, ...at(r() * 2000, r() * 2000) }));
    const plan = planGateways({ meters, existing: [], maxGateways: 2, radiusM: R, minNewMeters: 1 });
    // best pair of positions on a 100 m grid
    const xy = meters.map((m) => [(m.lng - LNG0) * KX, (m.lat - LAT0) * 111_320]);
    const spots: number[][] = [];
    for (let x = -200; x <= 2200; x += 100) for (let y = -200; y <= 2200; y += 100) spots.push([x, y]);
    const masks = spots.map(([x, y]) => xy.map(([a, b]) => (a - x) ** 2 + (b - y) ** 2 <= R * R));
    let best = 0;
    for (let i = 0; i < masks.length; i++) {
      for (let j = i; j < masks.length; j++) {
        let c = 0;
        for (let k = 0; k < xy.length; k++) if (masks[i][k] || masks[j][k]) c++;
        if (c > best) best = c;
      }
    }
    const ratio = plan.totalCovered / best;
    assert.ok(ratio >= 0.85, `seed ${seed}: ${plan.totalCovered} of best ${best}`);
    sumRatio += ratio;
  }
  t.diagnostic(`average: ${((sumRatio / runs) * 100).toFixed(1)}% of the brute-force best`);
  assert.ok(sumRatio / runs >= 0.95, `average ${(sumRatio / runs).toFixed(3)}`);
});

test('fast enough for a city: 20,000 meters', () => {
  const r = rng(7);
  const meters: PlanMeter[] = Array.from({ length: 20_000 }, (_, i) => {
    // denser in the middle, like a city
    const d = Math.abs(r() + r() + r() - 1.5) * 8000;
    const a = r() * 2 * Math.PI;
    return { id: `c${i}`, ...at(d * Math.cos(a), d * Math.sin(a)) };
  });
  for (const radiusM of [200, 500, 2000]) {
    const t = performance.now();
    const plan = planGateways({ meters, existing: [], maxGateways: 25, radiusM });
    const ms = performance.now() - t;
    assert.ok(ms < 5000, `radius ${radiusM}: ${ms.toFixed(0)} ms`);
    assert.ok(plan.gateways.length >= 1 && plan.gateways.length <= 25);
  }
});
