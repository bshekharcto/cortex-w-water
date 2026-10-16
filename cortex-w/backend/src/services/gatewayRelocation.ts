import { haversineM } from './networkLogic.js';
import { buildSpace, cellKey, validPosition } from './coverageSpace.js';
import { autoMinNewMeters, type PlanExisting, type PlanMeter } from './gatewayPlacement.js';

/**
 * Optimise the network that is already there: which existing gateways to keep, which to move, which to remove.
 *
 * The number of gateways never grows. Each step takes ONE gateway out of where it stands and puts it where it reaches
 * the most meters nothing else reaches, and the step is worth doing only when
 *
 *     meters it newly reaches there  -  meters only it reached where it stood   >=   the minimum gain
 *
 * (the net gain; the minimum guards against truck rolls for a handful of meters). The best such step is applied, the
 * coverage is updated, and the next step is looked for, until no step is worth it or the allowed number of moves is used.
 * Then gateways that are still in place and that (almost) nothing depends on are reported as redundant: each removal may
 * cost at most a tenth of the minimum, and all removals together at most the minimum, so a network of weak gateways
 * (a small radius) is never told to remove most of itself. Gateways that are not working reach nothing
 * today, so they come first: moving one costs nothing and gains whatever the new place reaches.
 *
 * Gateways can be locked (never touched, but still counted as covering), and a gateway that does not belong to the
 * selected sites is locked by the caller. A moved gateway is counted as working again in its new place.
 *
 * Pure: no I/O, deterministic (same input, same answer, whatever the input order).
 */

export interface RelocationExisting extends PlanExisting {
  /** Never moved or removed; still counted as covering the meters around it. */
  locked?: boolean;
}

export interface RelocationInput {
  meters: PlanMeter[];
  existing: RelocationExisting[];
  radiusM: number;
  /** At most this many gateways are moved; null / undefined = no limit. */
  maxMoves?: number | null;
  /** A move must add at least this many meters net; null / undefined = worked out from the number of meters. */
  minGain?: number | null;
  /** A gateway is moved at most this far (metres); null / undefined = no limit. Moving far is a new site, not a move. */
  maxMoveDistanceM?: number | null;
  /** Report redundant gateways for removal (only when no worthwhile move is left for them: they would be moved instead). */
  allowRemove?: boolean;
  /** A removal may cost at most this many meters; null / undefined = a tenth of the minimum gain. */
  maxRemovalLoss?: number | null;
  /** 'working' (default): a gateway that is not working reaches nothing today. 'all': every gateway counts as reaching. */
  existingMode?: 'all' | 'working';
}

export type RelocationVerdict = 'keep' | 'move' | 'remove' | 'locked';

export interface RelocationItem {
  id: string;
  lat: number;
  lng: number;
  working: boolean;
  verdict: RelocationVerdict;
  /** Where to put it (verdict "move"). */
  moveTo: { lat: number; lng: number; distanceM: number } | null;
  /** Verdict "move": meters it newly reaches in the new place. */
  newlyReached: number | null;
  /** Verdict "move" or "remove": meters only this gateway reached where it stands (lost unless something else takes over). */
  lost: number | null;
  /** newlyReached - lost for a move; -lost for a removal. */
  net: number | null;
  /** The order the changes should be made in (1 = the most valuable); null for keep / locked. */
  order: number | null;
  /** Keep / locked: meters only this gateway reaches in the final layout (what the network would lose without it). */
  onlyThisOne: number | null;
}

export type RelocationStop =
  | 'no-meters'
  | 'nothing-movable'
  | 'already-covered' // every meter was reached before any change
  | 'all-covered' // the moves made reach every meter
  | 'no-worthwhile-move'
  | 'max-moves'
  | 'all-moved';

export interface RelocationStep {
  order: number;
  action: 'move' | 'remove';
  id: string;
  /** Coverage after this change and all before it. */
  covered: number;
  percent: number;
}

export interface RelocationResult {
  metersConsidered: number;
  invalidMeters: number;
  coveredBefore: number;
  coveredAfter: number;
  coverageBeforePercent: number | null;
  coverageAfterPercent: number | null;
  uncovered: number;
  existingCounted: number;
  movable: number;
  locked: number;
  moves: number;
  removals: number;
  /** Meters no longer reached because of the removals (all together; at most the minimum gain). */
  removalLoss: number;
  minGainUsed: number;
  stopReason: RelocationStop;
  /** The net gain of the best change that was NOT made (null: none left). */
  nextNet: number | null;
  items: RelocationItem[];
  steps: RelocationStep[];
}

interface Slot {
  id: string;
  lat: number;
  lng: number;
  x: number;
  y: number;
  working: boolean;
  locked: boolean;
  /** Reaches meters today (working, or every gateway counts). */
  counted: boolean;
  /** Current position index when it has been moved (a free position), else null (it stands at x, y). */
  pos: number | null;
  verdict: RelocationVerdict;
  moveTo: { lat: number; lng: number; distanceM: number } | null;
  newlyReached: number | null;
  lost: number | null;
  order: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function planRelocation(input: RelocationInput): RelocationResult {
  // inputs that are not numbers fall back to safe values (the route validates; this keeps the planner safe on its own)
  const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
  const R = finite(input.radiusM) ? input.radiusM : 0;
  const sp = buildSpace(input.meters, R);
  const { N, invalid } = sp;
  const minGain = Math.max(1, Math.floor(finite(input.minGain) ? input.minGain : autoMinNewMeters(N)));
  const maxMoves = finite(input.maxMoves) ? Math.max(0, Math.floor(input.maxMoves)) : Infinity;
  const allowRemove = input.allowRemove ?? true;
  const maxDist = finite(input.maxMoveDistanceM) ? Math.max(0, input.maxMoveDistanceM) : Infinity;
  const mode = input.existingMode ?? 'working';

  // one entry per gateway id (a duplicate row would otherwise be planned twice), sorted so the order does not matter
  const seen = new Set<string>();
  const valid = input.existing
    .filter((e) => validPosition(e.lat, e.lng))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.lat - b.lat || a.lng - b.lng))
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  const slots: Slot[] = valid.map((e) => ({
    id: e.id,
    lat: e.lat,
    lng: e.lng,
    x: sp.toX(e.lng),
    y: sp.toY(e.lat),
    working: e.working,
    locked: !!e.locked,
    counted: mode === 'all' || e.working,
    pos: null,
    verdict: e.locked ? 'locked' : 'keep',
    moveTo: null,
    newlyReached: null,
    lost: null,
    order: null,
  }));
  const movable = slots.filter((s) => !s.locked);
  const countedAtStart = slots.filter((s) => s.counted).length;

  const base = (reason: RelocationStop): RelocationResult => ({
    metersConsidered: N,
    invalidMeters: invalid,
    coveredBefore: 0,
    coveredAfter: 0,
    coverageBeforePercent: null,
    coverageAfterPercent: null,
    uncovered: N,
    existingCounted: countedAtStart,
    movable: movable.length,
    locked: slots.length - movable.length,
    moves: 0,
    removals: 0,
    removalLoss: 0,
    minGainUsed: minGain,
    stopReason: reason,
    nextNet: null,
    items: slots.map(toItem),
    steps: [],
  });
  function toItem(s: Slot): RelocationItem {
    return {
      id: s.id,
      lat: s.lat,
      lng: s.lng,
      working: s.working,
      verdict: s.verdict,
      moveTo: s.moveTo,
      newlyReached: s.newlyReached,
      lost: s.lost,
      net: s.verdict === 'move' ? (s.newlyReached ?? 0) - (s.lost ?? 0) : s.verdict === 'remove' ? -(s.lost ?? 0) : null,
      order: s.order,
      onlyThisOne: null,
    };
  }
  if (!sp.usable) return base('no-meters');

  // ---- the layout today
  for (const s of slots) if (s.counted) sp.coverPoint(s.x, s.y);
  const coveredBefore = sp.covered;
  const { C, cx, cy, forEachInRange, cov, w } = sp;

  const liftOne = (s: Slot) => {
    if (!s.counted) return;
    if (s.pos == null) sp.uncoverPoint(s.x, s.y);
    else sp.unplace(s.pos);
  };
  const putBack = (s: Slot) => {
    if (!s.counted) return;
    if (s.pos == null) sp.coverPoint(s.x, s.y);
    else sp.place(s.pos);
  };
  /** Meters only this gateway reaches right now (it must be in place). */
  const onlyReach = (s: Slot): number => {
    if (!s.counted) return 0;
    let only = 0;
    const visit = (i: number) => {
      if (cov[i] === 1) only += w[i];
    };
    if (s.pos == null) forEachInRange(s.x, s.y, visit);
    else sp.forEachReached(s.pos, visit);
    return only;
  };

  // Candidates from the one that reaches the most meters at all: the most a spot can ever add is what it reaches, so the
  // search stops as soon as no spot left could beat the best one found (an exact search at a fraction of the cost).
  const reachW = new Int32Array(C);
  for (let j = 0; j < C; j++) reachW[j] = sp.reachWeight(j);
  const byReach = [...Array(C).keys()].sort((a, b) => reachW[b] - reachW[a] || a - b);

  const maxDist2 = maxDist * maxDist;
  const { candGrid } = sp;

  /** The candidate that newly reaches the most, over all of them (exact: stops once no candidate left could beat it). */
  const globalBest = (): { j: number; gain: number } | null => {
    let best = -1;
    let bestGain = 0;
    for (const j of byReach) {
      if (reachW[j] <= bestGain) break;
      const g = sp.freeGain(j);
      if (g > bestGain) {
        best = j;
        bestGain = g;
      }
    }
    return best < 0 ? null : { j: best, gain: bestGain };
  };
  /** The candidate within `limit` metres of (x, y) that newly reaches the most (walks the grid cells around it). */
  const nearBest = (x: number, y: number, limit: number): { j: number; gain: number } | null => {
    const cells = Math.ceil(limit / R);
    const gx = Math.floor(x / R);
    const gy = Math.floor(y / R);
    const lim2 = limit * limit;
    let best = -1;
    let bestGain = 0;
    for (let dx = -cells; dx <= cells; dx++) {
      for (let dy = -cells; dy <= cells; dy++) {
        const list = candGrid.get(cellKey(gx + dx, gy + dy));
        if (!list) continue;
        for (const j of list) {
          if ((cx[j] - x) ** 2 + (cy[j] - y) ** 2 > lim2 || reachW[j] <= bestGain) continue;
          const g = sp.freeGain(j);
          if (g > bestGain || (g === bestGain && best >= 0 && j < best)) {
            best = j;
            bestGain = g;
          }
        }
      }
    }
    return best < 0 ? null : { j: best, gain: bestGain };
  };
  /** The candidate within the allowed distance of (x, y) that newly reaches the most, over all of them. */
  const boundedBest = (x: number, y: number): { j: number; gain: number } | null => {
    let best = -1;
    let bestGain = 0;
    for (const j of byReach) {
      if (reachW[j] <= bestGain) break;
      if ((cx[j] - x) ** 2 + (cy[j] - y) ** 2 > maxDist2) continue;
      const g = sp.freeGain(j);
      if (g > bestGain) {
        best = j;
        bestGain = g;
      }
    }
    return best < 0 ? null : { j: best, gain: bestGain };
  };
  // with a distance limit, a small one is searched cell by cell, a large one like the unlimited case
  const limitCells = maxDist === Infinity ? Infinity : (2 * Math.ceil(maxDist / R) + 1) ** 2;
  const searchByCells = limitCells <= candGrid.size;

  // where a gateway stands now (a moved one stands at its new place)
  const standsAt = (s: Slot) => (s.pos == null ? { x: s.x, y: s.y } : { x: cx[s.pos], y: cy[s.pos] });

  const steps: RelocationStep[] = [];
  const pct = (c: number) => round1((c / N) * 100);
  let order = 0;
  let moves = 0;
  let removals = 0;
  let stop: RelocationStop = 'no-worthwhile-move';
  let nextNet: number | null = null;

  // ---- moves: the best net gain first, while it is worth it
  if (movable.length === 0) stop = 'nothing-movable';
  else if (coveredBefore >= N) stop = 'already-covered';
  else {
    const movedIds = new Set<string>();
    for (;;) {
      if (sp.covered >= N) {
        stop = moves > 0 ? 'all-covered' : 'already-covered';
        break;
      }
      // Where each gateway could go, with it lifted. Lifting a gateway only frees the meters it reaches, so only the
      // candidates within 2R of it can change: everything further away keeps the value it has with every gateway in
      // place, and the best of those is worked out once per step. (Exact, and far cheaper than searching all candidates
      // for every gateway.)
      const everywhere = maxDist === Infinity ? globalBest() : null;
      let best: { s: Slot; j: number; gain: number; lost: number; net: number } | null = null;
      for (const s of movable) {
        if (movedIds.has(s.id)) continue;
        const lost = onlyReach(s);
        const at = standsAt(s);
        liftOne(s);
        let spot: { j: number; gain: number } | null;
        if (maxDist === Infinity) {
          const near = nearBest(at.x, at.y, 2 * R);
          spot = near && (!everywhere || near.gain >= everywhere.gain) ? near : everywhere;
        } else {
          spot = searchByCells ? nearBest(at.x, at.y, maxDist) : boundedBest(at.x, at.y);
        }
        putBack(s);
        if (!spot) continue;
        const net = spot.gain - lost;
        if (!best || net > best.net || (net === best.net && spot.gain > best.gain)) best = { s, j: spot.j, gain: spot.gain, lost, net };
      }
      if (!best) {
        stop = movedIds.size === movable.length ? 'all-moved' : 'no-worthwhile-move';
        nextNet = null;
        break;
      }
      if (best.net < minGain) {
        stop = 'no-worthwhile-move';
        nextNet = best.net;
        break;
      }
      if (moves >= maxMoves) {
        // there is a worthwhile move, but the allowed number is used up
        stop = 'max-moves';
        nextNet = best.net;
        break;
      }
      // apply: polish the chosen spot (slide / centre; never past the allowed distance), then move the gateway there
      const { s, lost } = best;
      const from = standsAt(s);
      liftOne(s);
      let spot = sp.polish(cx[best.j], cy[best.j], best.gain);
      if (maxDist !== Infinity && (spot.x - from.x) ** 2 + (spot.y - from.y) ** 2 > maxDist2) spot = { x: cx[best.j], y: cy[best.j], gain: best.gain };
      // the reported 6-decimal coordinates are where it goes, so its numbers are true for them
      const snapped = sp.snap(spot.x, spot.y);
      spot = { x: snapped.x, y: snapped.y, gain: sp.gainAt(snapped.x, snapped.y) };
      s.pos = sp.addPosition(spot.x, spot.y);
      s.counted = true;
      sp.place(s.pos);
      movedIds.add(s.id);
      moves++;
      order++;
      const { lat, lng } = snapped;
      s.verdict = 'move';
      s.moveTo = { lat, lng, distanceM: round1(haversineM(s.lat, s.lng, lat, lng)) };
      s.newlyReached = spot.gain;
      s.lost = lost;
      s.order = order;
      steps.push({ order, action: 'move', id: s.id, covered: sp.covered, percent: pct(sp.covered) });
      if (movedIds.size === movable.length) {
        stop = sp.covered >= N ? 'all-covered' : 'all-moved';
        break;
      }
    }
  }

  // ---- removals: what is still in place and (almost) nothing depends on, weakest first, re-checked after each one.
  // Each may cost at most a tenth of the minimum, all together at most the minimum. Not while the allowed number of moves
  // is the limit: those gateways could still be moved to somewhere useful instead.
  let removalLoss = 0;
  if (allowRemove && stop !== 'max-moves') {
    const perRemoval = Math.max(0, Math.floor(input.maxRemovalLoss ?? minGain / 10));
    for (;;) {
      let weakest: { s: Slot; lost: number } | null = null;
      for (const s of movable) {
        if (s.verdict !== 'keep') continue;
        const lost = onlyReach(s);
        if (lost > perRemoval || removalLoss + lost > minGain) continue;
        if (!weakest || lost < weakest.lost) weakest = { s, lost };
      }
      if (!weakest) break;
      removalLoss += weakest.lost;
      liftOne(weakest.s);
      weakest.s.counted = false;
      weakest.s.verdict = 'remove';
      weakest.s.lost = weakest.lost;
      removals++;
      order++;
      weakest.s.order = order;
      steps.push({ order, action: 'remove', id: weakest.s.id, covered: sp.covered, percent: pct(sp.covered) });
    }
  }

  const items = slots.map(toItem);
  // what each gateway still in place would take with it: read on the final layout
  slots.forEach((s, k) => {
    if (s.verdict === 'keep' || s.verdict === 'locked') items[k].onlyThisOne = onlyReach(s);
  });
  // nextNet only means something while the search stopped for lack of a worthwhile move
  if (stop !== 'no-worthwhile-move' && stop !== 'max-moves') nextNet = null;

  return {
    metersConsidered: N,
    invalidMeters: invalid,
    coveredBefore,
    coveredAfter: sp.covered,
    coverageBeforePercent: pct(coveredBefore),
    coverageAfterPercent: pct(sp.covered),
    uncovered: N - sp.covered,
    existingCounted: countedAtStart,
    movable: movable.length,
    locked: slots.length - movable.length,
    moves,
    removals,
    removalLoss,
    minGainUsed: minGain,
    stopReason: stop,
    nextNet,
    items,
    steps,
  };
}
