import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRelocation, type RelocationExisting } from './gatewayRelocation.js';
import type { PlanMeter } from './gatewayPlacement.js';
import { haversineM } from './networkLogic.js';

// Positions are built in metres east / north of a point in Bhubaneswar.
const LAT0 = 20.3;
const LNG0 = 85.8;
const KX = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const at = (eastM: number, northM: number) => ({ lat: LAT0 + northM / 111_320, lng: LNG0 + eastM / KX });

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
let nextId = 0;
function cluster(n: number, eastM: number, northM: number, spreadM: number, seed = 1): PlanMeter[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    const a = r() * 2 * Math.PI;
    const d = Math.sqrt(r()) * spreadM;
    return { id: `m${nextId++}`, ...at(eastM + d * Math.cos(a), northM + d * Math.sin(a)) };
  });
}
const gw = (id: string, eastM: number, northM: number, working = true, locked = false): RelocationExisting => ({ id, ...at(eastM, northM), working, locked });
const byId = (r: ReturnType<typeof planRelocation>, id: string) => r.items.find((i) => i.id === id)!;

test('no meters / no gateways: nothing to do, said so', () => {
  assert.equal(planRelocation({ meters: [], existing: [gw('a', 0, 0)], radiusM: 500 }).stopReason, 'no-meters');
  const r = planRelocation({ meters: cluster(100, 0, 0, 200), existing: [], radiusM: 500 });
  assert.equal(r.stopReason, 'nothing-movable');
  assert.equal(r.items.length, 0);
});

test('a gateway that stands where the meters are is kept', () => {
  const r = planRelocation({ meters: cluster(300, 0, 0, 250), existing: [gw('a', 0, 0)], radiusM: 500 });
  assert.equal(byId(r, 'a').verdict, 'keep');
  assert.equal(r.moves, 0);
  assert.equal(r.coveredAfter, r.coveredBefore);
});

test('a gateway far from every meter is moved to the meters', () => {
  const r = planRelocation({ meters: cluster(400, 0, 0, 250), existing: [gw('a', 6000, 0)], radiusM: 500 });
  const a = byId(r, 'a');
  assert.equal(a.verdict, 'move');
  assert.ok(a.moveTo && a.moveTo.distanceM > 5000);
  assert.equal(a.newlyReached, 400);
  assert.equal(a.lost, 0);
  assert.equal(r.coverageBeforePercent, 0);
  assert.equal(r.coverageAfterPercent, 100);
  // and the new place really does reach every meter
  const moved = a.moveTo!;
  assert.ok(cluster(400, 0, 0, 250).every((m) => haversineM(m.lat, m.lng, moved.lat, moved.lng) <= 520));
});

test('two gateways on the same spot: one is moved to the uncovered group', () => {
  const meters = [...cluster(300, 0, 0, 200, 1), ...cluster(200, 4000, 0, 200, 2)];
  const r = planRelocation({ meters, existing: [gw('a', 0, 0), gw('b', 20, 10)], radiusM: 500 });
  assert.equal(r.moves, 1);
  assert.equal(r.coverageAfterPercent, 100);
  const movedItem = r.items.find((i) => i.verdict === 'move')!;
  assert.ok(movedItem.moveTo!.distanceM > 3000);
  assert.equal(movedItem.lost, 0);
});

test('a gateway that is not working is the one to move, and costs nothing', () => {
  const meters = [...cluster(300, 0, 0, 200, 1), ...cluster(200, 4000, 0, 200, 2)];
  const r = planRelocation({ meters, existing: [gw('a', 0, 0, true), gw('dead', 0, 30, false)], radiusM: 500 });
  assert.equal(byId(r, 'dead').verdict, 'move');
  assert.equal(byId(r, 'dead').lost, 0);
  assert.equal(byId(r, 'a').verdict, 'keep');
  assert.equal(r.coverageBeforePercent, 60);
  assert.equal(r.coverageAfterPercent, 100);
});

test('"all" counts a gateway that is not working as reaching, so nothing needs moving', () => {
  const meters = cluster(300, 0, 0, 200, 1);
  const r = planRelocation({ meters, existing: [gw('dead', 0, 30, false)], radiusM: 500, existingMode: 'all' });
  assert.equal(r.coverageBeforePercent, 100);
  assert.equal(r.moves, 0);
  assert.equal(byId(r, 'dead').verdict, 'keep');
});

test('locked gateways are never moved or removed, but still count', () => {
  const meters = cluster(400, 0, 0, 250);
  const r = planRelocation({ meters, existing: [gw('far', 6000, 0, true, true)], radiusM: 500 });
  assert.equal(byId(r, 'far').verdict, 'locked');
  assert.equal(r.moves, 0);
  assert.equal(r.movable, 0);
  assert.equal(r.locked, 1);
  assert.equal(r.stopReason, 'nothing-movable');
  // a locked gateway that covers the meters keeps another one from being needed
  const r2 = planRelocation({ meters, existing: [gw('lockedHere', 0, 0, true, true), gw('spare', 30, 0)], radiusM: 500 });
  assert.equal(byId(r2, 'spare').verdict, 'remove');
  assert.equal(r2.coverageAfterPercent, 100);
});

test('a redundant gateway is reported for removal, and not when removals are off', () => {
  const meters = cluster(400, 0, 0, 250);
  const r = planRelocation({ meters, existing: [gw('a', 0, 0), gw('b', 40, 20)], radiusM: 500 });
  assert.equal(r.removals, 1);
  assert.equal(r.items.filter((i) => i.verdict === 'remove').length, 1);
  assert.equal(r.coverageAfterPercent, 100);
  const off = planRelocation({ meters, existing: [gw('a', 0, 0), gw('b', 40, 20)], radiusM: 500, allowRemove: false });
  assert.equal(off.removals, 0);
  assert.ok(off.items.every((i) => i.verdict === 'keep'));
});

test('two redundant gateways are not both removed when together they matter', () => {
  // Three gateways over one group of 400 meters: removing one or two is free, removing all three loses everything.
  const meters = cluster(400, 0, 0, 250);
  const r = planRelocation({ meters, existing: [gw('a', 0, 0), gw('b', 30, 0), gw('c', 0, 30)], radiusM: 500 });
  assert.equal(r.removals, 2);
  assert.equal(r.items.filter((i) => i.verdict === 'keep').length, 1);
  assert.equal(r.coverageAfterPercent, 100);
});

test('a move that is not worth the minimum is not proposed', () => {
  // an outlying pair of meters: moving a gateway there would gain 2, which is below the automatic minimum
  const meters = [...cluster(1000, 0, 0, 250, 1), ...cluster(2, 4000, 0, 5, 2)];
  const r = planRelocation({ meters, existing: [gw('a', 0, 0), gw('b', 20, 10)], radiusM: 500, allowRemove: false });
  assert.equal(r.moves, 0);
  assert.equal(r.stopReason, 'no-worthwhile-move');
  assert.equal(r.nextNet, 2);
  // with a minimum of 1 it is
  const r1 = planRelocation({ meters, existing: [gw('a', 0, 0), gw('b', 20, 10)], radiusM: 500, allowRemove: false, minGain: 1 });
  assert.equal(r1.moves, 1);
});

test('max moves: the most valuable moves come first and the rest is left, with what the next would give', () => {
  // three far-off gateways; three uncovered groups of different size
  const meters = [...cluster(100, 0, 0, 150, 1), ...cluster(300, 3000, 0, 150, 2), ...cluster(200, 0, 3000, 150, 3), ...cluster(50, 3000, 3000, 150, 4)];
  const existing = [gw('x', 9000, 0), gw('y', 9000, 500), gw('z', 9000, 1000)];
  const all = planRelocation({ meters, existing, radiusM: 400, allowRemove: false, minGain: 1 });
  assert.equal(all.moves, 3);
  const two = planRelocation({ meters, existing, radiusM: 400, allowRemove: false, minGain: 1, maxMoves: 2 });
  assert.equal(two.moves, 2);
  assert.equal(two.stopReason, 'max-moves');
  assert.equal(two.nextNet, 100);
  assert.deepEqual(two.steps.map((s) => s.covered), all.steps.slice(0, 2).map((s) => s.covered));
  assert.deepEqual(all.steps.map((s) => s.percent), [...all.steps.map((s) => s.percent)].sort((a, b) => a - b));
  // order 1 is the biggest group
  assert.equal(all.steps[0].covered, 300);
  const none = planRelocation({ meters, existing, radiusM: 400, allowRemove: false, minGain: 1, maxMoves: 0 });
  assert.equal(none.moves, 0);
});

test('removals wait while the move limit is the reason to stop: the gateways could still be moved', () => {
  const meters = [...cluster(300, 0, 0, 200, 1), ...cluster(250, 4000, 0, 200, 2), ...cluster(150, 0, 4000, 200, 3)];
  const existing = [gw('a', 0, 0), gw('b', 30, 0), gw('c', 0, 30)];
  const capped = planRelocation({ meters, existing, radiusM: 500, maxMoves: 1 });
  assert.equal(capped.stopReason, 'max-moves');
  assert.equal(capped.removals, 0);
  assert.equal(capped.moves, 1);
  const free = planRelocation({ meters, existing, radiusM: 500 });
  assert.equal(free.moves, 2);
  assert.equal(free.coverageAfterPercent, 100);
});

test('max move distance: a gateway is not sent further than that', () => {
  const meters = cluster(400, 0, 0, 250, 1);
  const far = planRelocation({ meters, existing: [gw('a', 3000, 0)], radiusM: 500, minGain: 1 });
  assert.equal(far.items[0].verdict, 'move');
  const near = planRelocation({ meters, existing: [gw('a', 3000, 0)], radiusM: 500, minGain: 1, maxMoveDistanceM: 1000, allowRemove: false });
  assert.equal(near.moves, 0); // nothing within 1 km reaches a single meter
  assert.equal(near.coveredAfter, near.coveredBefore);
  const mid = planRelocation({ meters, existing: [gw('a', 1200, 0)], radiusM: 500, minGain: 1, maxMoveDistanceM: 1000 });
  assert.equal(mid.items[0].verdict, 'move');
  assert.ok(mid.items[0].moveTo!.distanceM <= 1000.5);
});

test('when the moves reach every meter, the stop reason says the moves did it (not that nothing needed moving)', () => {
  const r = planRelocation({ meters: cluster(400, 0, 0, 250), existing: [gw('a', 6000, 0), gw('b', 6100, 0)], radiusM: 500 });
  assert.equal(r.moves, 1);
  assert.equal(r.coverageAfterPercent, 100);
  assert.equal(r.stopReason, 'all-covered');
});

test('the numbers are true for the coordinates reported (recounted from them)', () => {
  for (let seed = 0; seed < 60; seed++) {
    const r = rng(1200 + seed);
    const meters: PlanMeter[] = Array.from({ length: 40 + Math.floor(r() * 60) }, (_, i) => ({ id: `q${seed}-${i}`, ...at(r() * 3000, r() * 3000) }));
    const R = 150 + r() * 400;
    const existing = Array.from({ length: 3 }, (_, k) => gw(`g${k}`, r() * 6000, r() * 6000));
    const out = planRelocation({ meters, existing, radiusM: R, minGain: 1, allowRemove: false });
    const where = out.items.map((i) => i.moveTo ?? i);
    const reached = meters.filter((m) => where.some((g) => haversineM(g.lat, g.lng, m.lat, m.lng) <= R)).length;
    assert.equal(reached, out.coveredAfter, `seed ${seed}`);
  }
});

test('a gateway listed twice is planned once', () => {
  const r = planRelocation({ meters: cluster(300, 0, 0, 200), existing: [gw('a', 6000, 0), gw('a', 6000, 0)], radiusM: 500 });
  assert.equal(r.items.length, 1);
  assert.equal(r.moves, 1);
});

test('everything already reached: nothing to move', () => {
  const r = planRelocation({ meters: cluster(300, 0, 0, 200), existing: [gw('a', 0, 0)], radiusM: 500, allowRemove: false });
  assert.equal(r.stopReason, 'already-covered');
  assert.equal(r.moves, 0);
});

test('the number of gateways never grows; coverage never drops except by a removal below the minimum', () => {
  const r = rng(9);
  const meters = Array.from({ length: 6 }, (_, k) => cluster(80 + k * 20, (k % 3) * 2200, Math.floor(k / 3) * 2200, 300, 70 + k)).flat();
  const existing = Array.from({ length: 6 }, (_, k) => gw(`g${k}`, r() * 5000, r() * 3500, k !== 4));
  const out = planRelocation({ meters, existing, radiusM: 500 });
  assert.equal(out.items.length, 6);
  assert.ok(out.coveredAfter >= out.coveredBefore - out.removals * (out.minGainUsed - 1));
  assert.ok(out.coveredAfter >= out.coveredBefore);
  assert.equal(out.moves, out.items.filter((i) => i.verdict === 'move').length);
  assert.equal(out.removals, out.items.filter((i) => i.verdict === 'remove').length);
  for (const i of out.items) {
    if (i.verdict === 'move') assert.ok(i.net! >= out.minGainUsed);
    if (i.verdict === 'keep' || i.verdict === 'locked') assert.ok(i.onlyThisOne != null);
  }
  const orders = out.items.filter((i) => i.order != null).map((i) => i.order!).sort((a, b) => a - b);
  assert.deepEqual(orders, orders.map((_, k) => k + 1));
});

test('the answer does not depend on the order of the meters or gateways', () => {
  const meters = Array.from({ length: 6 }, (_, k) => cluster(80 + k * 10, (k % 3) * 1800, Math.floor(k / 3) * 1800, 300, 20 + k)).flat();
  const existing = [gw('a', 100, 100), gw('b', 4000, 3000), gw('c', 1800, 1700, false), gw('d', 3600, 0)];
  const a = planRelocation({ meters, existing, radiusM: 500 });
  const b = planRelocation({ meters: [...meters].reverse(), existing: [...existing].reverse(), radiusM: 500 });
  assert.deepEqual(a, b);
});

test('gateways without a usable position are left out', () => {
  const r = planRelocation({ meters: cluster(100, 0, 0, 100), existing: [gw('a', 0, 0), { id: 'bad', lat: 0, lng: 0, working: true }], radiusM: 500 });
  assert.equal(r.items.length, 1);
});

test('close to the best possible: one gateway, brute force over a grid of positions', () => {
  const R = 400;
  let sumRatio = 0;
  const runs = 20;
  for (let seed = 0; seed < runs; seed++) {
    const r = rng(300 + seed);
    const meters: PlanMeter[] = Array.from({ length: 50 }, (_, i) => ({ id: `b${seed}-${i}`, ...at(r() * 2000, r() * 2000) }));
    // two gateways: one placed well, one far away and useless; the relocation must make good use of the second
    const keeper = gw('keep', 500, 500, true, true);
    const plan = planRelocation({ meters, existing: [keeper, gw('spare', 9000, 9000)], radiusM: R, minGain: 1, allowRemove: false });
    const xy = meters.map((m) => [(m.lng - LNG0) * KX, (m.lat - LAT0) * 111_320]);
    const reach = (x: number, y: number) => xy.map(([a, b]) => (a - x) ** 2 + (b - y) ** 2 <= R * R);
    const fixed = reach((keeper.lng - LNG0) * KX, (keeper.lat - LAT0) * 111_320);
    let best = 0;
    for (let x = -200; x <= 2200; x += 100) {
      for (let y = -200; y <= 2200; y += 100) {
        const m = reach(x, y);
        let c = 0;
        for (let k = 0; k < xy.length; k++) if (fixed[k] || m[k]) c++;
        if (c > best) best = c;
      }
    }
    const ratio = plan.coveredAfter / best;
    assert.ok(ratio >= 0.9, `seed ${seed}: ${plan.coveredAfter} of best ${best}`);
    sumRatio += ratio;
  }
  assert.ok(sumRatio / runs >= 0.97, `average ${(sumRatio / runs).toFixed(3)}`);
});

test('the fast search (only near a lifted gateway) finds exactly what searching every candidate finds', () => {
  // a distance limit far larger than the area makes the planner search every candidate for every gateway
  for (let seed = 0; seed < 8; seed++) {
    const r = rng(500 + seed);
    const meters = Array.from({ length: 7 }, (_, k) => cluster(40 + Math.floor(r() * 120), r() * 6000, r() * 6000, 400, 600 + seed * 10 + k)).flat();
    const existing = Array.from({ length: 6 }, (_, k) => gw(`g${k}`, r() * 6000, r() * 6000, r() > 0.2));
    const fast = planRelocation({ meters, existing, radiusM: 450, minGain: 1 });
    const full = planRelocation({ meters, existing, radiusM: 450, minGain: 1, maxMoveDistanceM: 1_000_000 });
    assert.deepEqual(fast, full, `seed ${seed}`);
  }
});

test('a network of weak gateways is not told to remove most of itself', () => {
  // every gateway reaches a few meters; none can be moved anywhere worth it; removals may cost a tenth of the minimum each
  // and the minimum in total
  const meters = Array.from({ length: 30 }, (_, k) => cluster(8, k * 900, 0, 30, 800 + k)).flat();
  const existing = Array.from({ length: 30 }, (_, k) => gw(`w${String(k).padStart(2, '0')}`, k * 900, 0));
  const r = planRelocation({ meters, existing, radiusM: 100, minGain: 50 });
  assert.equal(r.removals, 0);
  assert.equal(r.coveredAfter, r.coveredBefore);
  const loose = planRelocation({ meters, existing, radiusM: 100, minGain: 50, maxRemovalLoss: 8 });
  assert.ok(loose.removalLoss <= 50, `lost ${loose.removalLoss}`);
  assert.ok(loose.removals <= 6);
});

test('fast enough for a city: 20,000 meters, 40 gateways', () => {
  const r = rng(5);
  const meters: PlanMeter[] = Array.from({ length: 20_000 }, (_, i) => {
    const d = Math.abs(r() + r() + r() - 1.5) * 8000;
    const a = r() * 2 * Math.PI;
    return { id: `c${i}`, ...at(d * Math.cos(a), d * Math.sin(a)) };
  });
  const existing = Array.from({ length: 40 }, (_, k) => gw(`e${k}`, (r() - 0.5) * 16000, (r() - 0.5) * 16000, k % 7 !== 0));
  for (const radiusM of [300, 800]) {
    const t = performance.now();
    const out = planRelocation({ meters, existing, radiusM });
    const ms = performance.now() - t;
    assert.ok(ms < 2000, `radius ${radiusM}: ${ms.toFixed(0)} ms`);
    assert.ok(out.coveredAfter >= out.coveredBefore);
  }
});
