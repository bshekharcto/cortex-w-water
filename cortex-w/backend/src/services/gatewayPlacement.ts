import { haversineM } from './networkLogic.js';
import { buildSpace, cellKey, validPosition } from './coverageSpace.js';

export { validPosition };

/**
 * Gateway placement: where to put new gateways so that as many meters as possible are within reach of one.
 *
 * The question is "maximum coverage": pick at most K positions so that the number of meters within radius R of a
 * gateway (existing or new) is as large as possible. It has no fast exact answer, so this does what works well in
 * practice and can be explained:
 *
 *  1. Candidates. Meters are grouped on a fine grid (a quarter of the radius); each occupied cell offers one candidate
 *     position, the centre of its meters. A gateway is then always put where there are meters (a roof nearby), and the
 *     number of candidates stays small even for a large radius.
 *  2. Greedy. Repeatedly take the candidate that brings the most meters not yet in reach of anything ("lazy greedy":
 *     a candidate's value is only recomputed when it reaches the top). Greedy is guaranteed at least 63% of the best
 *     possible coverage, and usually gets within a few percent.
 *  3. Local search. Each chosen gateway is tried at every other candidate (pruned by an upper bound, so this stays
 *     fast) and slid in small steps; it moves when that reaches more meters. This repairs greedy's typical mistake (an early pick between two
 *     groups that later picks make half useless).
 *  4. Pair moves. A few times, the weakest gateway and its nearest neighbour are taken out and two are put back where
 *     they reach most; kept only when that reaches more (fixes the case where two gateways must move together).
 *  5. Pruning. A gateway that, in the final layout, alone reaches fewer than the minimum is dropped.
 *
 * K is an upper limit, not a target. Gateways are only added while they are worth it, so the run stops by itself when
 *  - every meter is in reach (or already was, through the existing gateways),
 *  - the target coverage is reached, or
 *  - the next gateway would newly reach fewer meters than the minimum (by default about 0.5% of the meters).
 * The answer says which of these stopped it, and a coverage curve says how many gateways other coverage levels need.
 *
 * Pure: no I/O, deterministic (same input, same answer, whatever the input order).
 */

export interface PlanMeter {
  id: string;
  lat: number;
  lng: number;
}

export interface PlanExisting {
  id: string;
  lat: number;
  lng: number;
  /** false when the gateway has stopped working (no traffic / stale): ignored when only working gateways count */
  working: boolean;
}

/** Which existing gateways are taken as already covering the meters around them. */
export type ExistingMode = 'all' | 'working' | 'none';

export interface PlanInput {
  meters: PlanMeter[];
  existing: PlanExisting[];
  /** At most this many new gateways (1..25 from the page). */
  maxGateways: number;
  radiusM: number;
  /** A new gateway must newly reach at least this many meters; null / undefined = worked out from the number of meters. */
  minNewMeters?: number | null;
  /** Stop once this share of the meters is in reach (1..100). */
  targetCoveragePercent?: number;
  existingMode?: ExistingMode;
  /** How far the coverage curve is followed (number of new gateways). */
  curveLimit?: number;
}

export type StopReason =
  | 'no-meters' // no meter with a usable position
  | 'already-covered' // the existing gateways already reach every meter
  | 'all-covered' // the new gateways reach every remaining meter
  | 'target-reached' // the target coverage was reached
  | 'low-gain' // one more gateway would not reach enough new meters
  | 'max-gateways'; // the limit was reached while more gateways would still be worth it

export interface PlannedGateway {
  /** 1 = the most valuable */
  rank: number;
  lat: number;
  lng: number;
  /** Meters it serves that no existing gateway reaches; each meter is counted for one gateway only (the nearest). */
  newlyCovered: number;
  /** What it adds on top of gateways 1 .. rank-1 (so building them in rank order gives these steps). */
  addedInOrder: number;
  /** Meters that no other gateway, new or existing, reaches: what would be lost without it. */
  onlyThisOne: number;
  /** Every meter within the radius, including those other gateways reach as well. */
  inRange: number;
  /** Over the meters it serves (newlyCovered); null when it serves none. */
  avgDistanceM: number | null;
  maxDistanceM: number | null;
  nearestExisting: { id: string; distanceM: number } | null;
}

export interface CurvePoint {
  newGateways: number;
  covered: number;
  percent: number;
}

export interface PlanResult {
  metersConsidered: number;
  /** Meters left out because their position is not usable (missing, 0/0, out of range). */
  invalidMeters: number;
  coveredByExisting: number;
  newlyCovered: number;
  totalCovered: number;
  uncovered: number;
  coverageBeforePercent: number | null;
  coverageAfterPercent: number | null;
  existingCounted: number;
  minNewMetersUsed: number;
  targetCoveragePercent: number;
  stopReason: StopReason;
  /** What one more gateway would newly reach (null when nothing is left to reach). */
  nextGain: number | null;
  gateways: PlannedGateway[];
  /** Coverage with 0, 1, 2 ... new gateways: the plan's own gateways first, then greedy estimates beyond them. */
  curve: CurvePoint[];
  /** The curve reached every meter within its limit. */
  curveComplete: boolean;
  /** Fewest new gateways for these coverage levels (null: more than the curve follows). */
  gatewaysFor: Record<'90' | '95' | '99' | '100', number | null>;
}

const MAX_REFINE_PASSES = 4;
const MAX_ROUNDS = 4;
const PAIR_MOVE_TRIES = 8;
const DEFAULT_CURVE_LIMIT = 100;

const round1 = (n: number) => Math.round(n * 10) / 10;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** About 0.5% of the meters (at most 100), but never below 5 for a site of a few hundred, and never more than there are. */
export function autoMinNewMeters(meterCount: number): number {
  if (meterCount <= 0) return 1;
  const share = Math.min(100, Math.ceil(meterCount * 0.005));
  const floor = Math.min(5, Math.ceil(meterCount * 0.02));
  return Math.max(1, share, floor);
}

class MaxHeap {
  private gain: number[] = [];
  private cand: number[] = [];
  private stamp: number[] = [];
  get size() {
    return this.gain.length;
  }
  /** higher gain first; on a tie the lower candidate index (deterministic) */
  private above(i: number, j: number) {
    return this.gain[i] > this.gain[j] || (this.gain[i] === this.gain[j] && this.cand[i] < this.cand[j]);
  }
  private swap(i: number, j: number) {
    [this.gain[i], this.gain[j]] = [this.gain[j], this.gain[i]];
    [this.cand[i], this.cand[j]] = [this.cand[j], this.cand[i]];
    [this.stamp[i], this.stamp[j]] = [this.stamp[j], this.stamp[i]];
  }
  push(gain: number, cand: number, stamp: number) {
    this.gain.push(gain);
    this.cand.push(cand);
    this.stamp.push(stamp);
    let i = this.gain.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.above(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): { gain: number; cand: number; stamp: number } | null {
    if (this.gain.length === 0) return null;
    const top = { gain: this.gain[0], cand: this.cand[0], stamp: this.stamp[0] };
    const last = this.gain.length - 1;
    this.swap(0, last);
    this.gain.pop();
    this.cand.pop();
    this.stamp.pop();
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < this.gain.length && this.above(l, m)) m = l;
      if (r < this.gain.length && this.above(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }
}

export function planGateways(input: PlanInput): PlanResult {
  // inputs that are not numbers fall back to safe values (the route validates; this keeps the planner safe on its own)
  const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
  const R = finite(input.radiusM) ? input.radiusM : 0;
  const K = finite(input.maxGateways) ? Math.max(0, Math.floor(input.maxGateways)) : 0;
  const target = finite(input.targetCoveragePercent) ? Math.min(100, Math.max(1, input.targetCoveragePercent)) : 100;
  const mode: ExistingMode = input.existingMode ?? 'all';

  const sp = buildSpace(input.meters, R);
  const { N, invalid } = sp;
  const minGain = Math.max(1, Math.floor(finite(input.minNewMeters) ? input.minNewMeters : autoMinNewMeters(N)));
  const targetCount = Math.ceil((target / 100) * N);
  const existingAll = input.existing.filter((e) => validPosition(e.lat, e.lng));
  const counted = mode === 'none' ? [] : existingAll.filter((e) => mode === 'all' || e.working);

  const empty = (reason: StopReason): PlanResult => ({
    metersConsidered: N,
    invalidMeters: invalid,
    coveredByExisting: 0,
    newlyCovered: 0,
    totalCovered: 0,
    uncovered: N,
    coverageBeforePercent: null,
    coverageAfterPercent: null,
    existingCounted: counted.length,
    minNewMetersUsed: minGain,
    targetCoveragePercent: target,
    stopReason: reason,
    nextGain: null,
    gateways: [],
    curve: [],
    curveComplete: true,
    gatewaysFor: { '90': null, '95': null, '99': null, '100': null },
  });
  if (N === 0 || !(R > 0)) return empty('no-meters');

  const { P, pts, px, py, w, cov, cx, cy, C, candGrid, R2, toX, toY, forEachInRange, forEachReached, freeGain, place, unplace } = sp;

  // ---- how many gateways reach each point: the existing ones counted first
  for (const e of counted) sp.coverPoint(toX(e.lng), toY(e.lat));
  const coveredByExisting = sp.covered;

  // What each candidate reaches with only the existing gateways placed. Coverage only grows from there, so this is an
  // upper bound on what the candidate can ever add: the local search walks the candidates from the strongest and stops
  // as soon as none left could beat the best move found (an exact search over all of them, at a fraction of the cost).
  const initialGain = new Int32Array(C);
  for (let j = 0; j < C; j++) initialGain[j] = freeGain(j);
  const byInitialGain = [...Array(C).keys()].sort((a, b) => initialGain[b] - initialGain[a] || a - b);

  /** Lazy greedy from the current coverage; adds to `chosen` while allowed. Returns the best next gain it saw. */
  const greedy = (chosen: number[], limit: number, minimum: number, stopAt: number): number | null => {
    const heap = new MaxHeap();
    let round = 0;
    for (let j = 0; j < C; j++) {
      const g = freeGain(j);
      if (g > 0) heap.push(g, j, round);
    }
    for (;;) {
      if (sp.covered >= N || sp.covered >= stopAt) return null;
      let top = heap.pop();
      while (top && top.stamp !== round) {
        const g = freeGain(top.cand);
        if (g > 0) heap.push(g, top.cand, round);
        top = heap.pop();
      }
      if (!top) return null;
      if (top.gain < minimum || chosen.length >= limit) return top.gain;
      chosen.push(top.cand);
      place(top.cand);
      round++;
    }
  };

  /**
   * Move each gateway where it reaches more: first to another candidate (near it, or among the strongest overall), then
   * by sliding it in small steps (halving from R/2 to R/32), so it can also stand between meters; finally it is pulled
   * towards the middle of the meters it serves as long as that reaches no fewer, which shortens the distances.
   */
  const refine = (chosen: number[], from = 0) => {
    for (let pass = 0; pass < MAX_REFINE_PASSES; pass++) {
      let improved = false;
      for (let t = from; t < chosen.length; t++) {
        const cur = chosen[t];
        unplace(cur);
        const startGain = freeGain(cur);
        let best = cur;
        let bestGain = startGain;
        const tryCand = (j: number) => {
          const g = freeGain(j);
          if (g > bestGain) {
            best = j;
            bestGain = g;
          }
        };
        // within 1.5 R of where it stands (cells of size R: look two cells around)
        const gx = Math.floor(cx[cur] / R);
        const gy = Math.floor(cy[cur] / R);
        const lim2 = 2.25 * R2;
        for (let dx = -2; dx <= 2; dx++) {
          for (let dy = -2; dy <= 2; dy++) {
            const list = candGrid.get(cellKey(gx + dx, gy + dy));
            if (!list) continue;
            for (const j of list) {
              const ddx = cx[j] - cx[cur];
              const ddy = cy[j] - cy[cur];
              if (ddx * ddx + ddy * ddy <= lim2) tryCand(j);
            }
          }
        }
        for (const j of byInitialGain) {
          if (initialGain[j] <= bestGain) break;
          tryCand(j);
        }

        // slide and centre
        const polished = sp.polish(cx[best], cy[best], bestGain);
        const x = polished.x;
        const y = polished.y;
        bestGain = polished.gain;
        if (x !== cx[best] || y !== cy[best]) best = sp.addPosition(x, y);
        chosen[t] = best;
        place(best);
        if (bestGain > startGain) improved = true;
      }
      if (!improved) break;
    }
  };

  /** Drop gateways that alone reach fewer than the minimum, weakest first. Returns whether any was dropped. */
  const prune = (chosen: number[]): boolean => {
    let dropped = false;
    for (;;) {
      let weakest = -1;
      let weakestGain = Infinity;
      for (let t = 0; t < chosen.length; t++) {
        let only = 0;
        forEachReached(chosen[t], (i) => {
          if (cov[i] === 1) only += w[i];
        });
        if (only < weakestGain || (only === weakestGain && chosen[t] < chosen[weakest])) {
          weakest = t;
          weakestGain = only;
        }
      }
      if (weakest < 0 || weakestGain >= minGain) return dropped;
      unplace(chosen[weakest]);
      chosen.splice(weakest, 1);
      dropped = true;
    }
  };

  /** What the best candidate not yet chosen would newly reach (null when nothing is left to reach). */
  const peekGain = (): number | null => {
    if (sp.covered >= N) return null;
    let best = 0;
    for (let j = 0; j < C; j++) {
      const g = freeGain(j);
      if (g > best) best = g;
    }
    return best > 0 ? best : null;
  };

  /** The candidate that newly reaches the most meters right now, found with the same upper bound as the local search. */
  const bestCandidate = (): { j: number; gain: number } | null => {
    let best = -1;
    let bestGain = 0;
    for (const j of byInitialGain) {
      if (initialGain[j] <= bestGain) break;
      const g = freeGain(j);
      if (g > bestGain) {
        best = j;
        bestGain = g;
      }
    }
    return best < 0 ? null : { j: best, gain: bestGain };
  };

  /**
   * Moving one gateway at a time gets stuck when two gateways would have to move together (both sit between the same
   * groups). Try that a fixed number of times: take out the weakest gateway and its nearest neighbour, put two back where
   * they reach most, polish, and keep the change only when more meters are reached in total.
   */
  const pairMoves = (chosen: number[]) => {
    let improved = false;
    const tries = Math.min(chosen.length, PAIR_MOVE_TRIES);
    for (let attempt = 0; attempt < tries && chosen.length >= 2; attempt++) {
      // the attempt-th weakest gateway (by what only it reaches)
      const onlyOf = chosen.map((j) => {
        let only = 0;
        forEachReached(j, (i) => {
          if (cov[i] === 1) only += w[i];
        });
        return only;
      });
      const order = chosen.map((_, t) => t).sort((a, b) => onlyOf[a] - onlyOf[b] || chosen[a] - chosen[b]);
      const a = order[attempt];
      let b = -1;
      let bd = Infinity;
      chosen.forEach((j, t) => {
        if (t === a) return;
        const d = (cx[j] - cx[chosen[a]]) ** 2 + (cy[j] - cy[chosen[a]]) ** 2;
        if (d < bd) {
          bd = d;
          b = t;
        }
      });
      const saved = [...chosen];
      const before = sp.covered;
      const out = [chosen[a], chosen[b]];
      out.forEach(unplace);
      const kept = chosen.filter((_, t) => t !== a && t !== b);
      for (let k = 0; k < 2; k++) {
        const c = bestCandidate();
        if (!c) break;
        kept.push(c.j);
        place(c.j);
      }
      refine(kept, kept.length - 2); // only the two new ones: a full polish per try costs 3x for little more
      if (sp.covered > before) {
        chosen.splice(0, chosen.length, ...kept);
        improved = true;
      } else {
        kept.forEach(unplace);
        saved.forEach(place);
        chosen.splice(0, chosen.length, ...saved);
      }
    }
    if (improved) refine(chosen);
  };

  // ---- the plan: greedy, local search, pruning; again while that changes something (the local search can free room
  // for a gateway that is worth adding after all)
  const chosen: number[] = [];
  for (let r = 0; r < MAX_ROUNDS; r++) {
    const before = chosen.length;
    const coveredBefore = sp.covered;
    greedy(chosen, K, minGain, targetCount);
    refine(chosen);
    pairMoves(chosen);
    prune(chosen);
    if (chosen.length === before && sp.covered === coveredBefore) break;
  }
  const nextGain = peekGain();

  let stopReason: StopReason;
  if (coveredByExisting >= N) stopReason = 'already-covered';
  else if (sp.covered >= N) stopReason = 'all-covered';
  else if (sp.covered >= targetCount) stopReason = 'target-reached';
  else if (nextGain != null && nextGain >= minGain && chosen.length >= K) stopReason = 'max-gateways';
  else stopReason = 'low-gain';

  // ---- report positions as 6-decimal coordinates: move each gateway onto exactly that point, so the numbers below are
  // true for the coordinates people are given
  for (let t = 0; t < chosen.length; t++) {
    const j = chosen[t];
    const at = sp.snap(cx[j], cy[j]);
    if (at.x === cx[j] && at.y === cy[j]) continue;
    unplace(j);
    chosen[t] = sp.addPosition(at.x, at.y);
    place(chosen[t]);
  }

  // ---- rank: most valuable first; "addedInOrder" is what each one adds after the ones before it
  const covExisting = new Int32Array(P);
  for (const e of counted) forEachInRange(toX(e.lng), toY(e.lat), (i) => covExisting[i]++);
  const ranked: number[] = [];
  const added: number[] = [];
  {
    const taken = Uint8Array.from(covExisting, (v) => (v > 0 ? 1 : 0));
    const left = [...chosen];
    while (left.length) {
      let bi = 0;
      let bg = -1;
      for (let t = 0; t < left.length; t++) {
        let g = 0;
        forEachReached(left[t], (i) => {
          if (!taken[i]) g += w[i];
        });
        if (g > bg || (g === bg && left[t] < left[bi])) {
          bg = g;
          bi = t;
        }
      }
      const j = left.splice(bi, 1)[0];
      forEachReached(j, (i) => {
        taken[i] = 1;
      });
      ranked.push(j);
      added.push(bg);
    }
  }

  // ---- per gateway: who it serves (meters no existing gateway reaches, each given to its nearest new gateway)
  const { toLat, toLng } = sp;
  const G = ranked.length;
  const served = new Float64Array(G);
  const distSum = new Float64Array(G);
  const distMax = new Float64Array(G);
  const only = new Float64Array(G);
  const inRange = new Float64Array(G);
  const gLat = ranked.map((j) => round6(toLat(cy[j])));
  const gLng = ranked.map((j) => round6(toLng(cx[j])));
  const nearestNew = new Int32Array(P).fill(-1);
  const nearestD2 = new Float64Array(P).fill(Infinity);
  ranked.forEach((j, g) => {
    forEachReached(j, (i) => {
      inRange[g] += w[i];
      if (cov[i] === 1) only[g] += w[i];
      const ddx = px[i] - cx[j];
      const ddy = py[i] - cy[j];
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < nearestD2[i]) {
        nearestD2[i] = d2;
        nearestNew[i] = g;
      }
    });
  });
  let newlyCovered = 0;
  for (let i = 0; i < P; i++) {
    const g = nearestNew[i];
    if (g < 0 || covExisting[i] > 0) continue;
    const d = haversineM(gLat[g], gLng[g], pts[i].lat, pts[i].lng);
    served[g] += w[i];
    distSum[g] += d * w[i];
    if (d > distMax[g]) distMax[g] = d;
    newlyCovered += w[i];
  }

  const gateways: PlannedGateway[] = ranked.map((_, g) => {
    let nearest: { id: string; distanceM: number } | null = null;
    for (const e of existingAll) {
      const d = haversineM(gLat[g], gLng[g], e.lat, e.lng);
      if (!nearest || d < nearest.distanceM) nearest = { id: e.id, distanceM: d };
    }
    return {
      rank: g + 1,
      lat: gLat[g],
      lng: gLng[g],
      newlyCovered: served[g],
      addedInOrder: added[g],
      onlyThisOne: only[g],
      inRange: inRange[g],
      avgDistanceM: served[g] > 0 ? round1(distSum[g] / served[g]) : null,
      maxDistanceM: served[g] > 0 ? round1(distMax[g]) : null,
      nearestExisting: nearest ? { id: nearest.id, distanceM: round1(nearest.distanceM) } : null,
    };
  });

  // ---- coverage curve: the plan's gateways in rank order, then greedy estimates beyond them (no minimum, no target)
  const pct = (c: number) => round1((c / N) * 100);
  const curve: CurvePoint[] = [{ newGateways: 0, covered: coveredByExisting, percent: pct(coveredByExisting) }];
  let running = coveredByExisting;
  for (let g = 0; g < G; g++) {
    running += added[g];
    curve.push({ newGateways: g + 1, covered: running, percent: pct(running) });
  }
  const limit = Math.max(G, input.curveLimit ?? DEFAULT_CURVE_LIMIT);
  const extra: number[] = [];
  if (sp.covered < N && G < limit) {
    // greedy() places what it picks: replay the picks to read each step's gain, then take them all away again, so the
    // coverage stays the plan's
    const picks: number[] = [];
    greedy(picks, limit - G, 1, N);
    for (let t = picks.length - 1; t >= 0; t--) unplace(picks[t]);
    let last = sp.covered;
    for (const j of picks) {
      place(j);
      extra.push(sp.covered - last);
      last = sp.covered;
    }
    for (let t = picks.length - 1; t >= 0; t--) unplace(picks[t]);
  }
  for (const a of extra) {
    running += a;
    curve.push({ newGateways: curve.length, covered: running, percent: pct(running) });
  }
  const curveComplete = running >= N;
  const gatewaysFor = { '90': null, '95': null, '99': null, '100': null } as PlanResult['gatewaysFor'];
  for (const level of ['90', '95', '99', '100'] as const) {
    const need = Math.ceil((Number(level) / 100) * N);
    const hit = curve.find((c) => c.covered >= need);
    gatewaysFor[level] = hit ? hit.newGateways : null;
  }

  const totalCovered = coveredByExisting + newlyCovered;
  return {
    metersConsidered: N,
    invalidMeters: invalid,
    coveredByExisting,
    newlyCovered,
    totalCovered,
    uncovered: N - totalCovered,
    coverageBeforePercent: pct(coveredByExisting),
    coverageAfterPercent: pct(totalCovered),
    existingCounted: counted.length,
    minNewMetersUsed: minGain,
    targetCoveragePercent: target,
    stopReason,
    nextGain,
    gateways,
    curve,
    curveComplete,
    gatewaysFor,
  };
}
