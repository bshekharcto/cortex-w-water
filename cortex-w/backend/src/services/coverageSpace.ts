/**
 * The geometry both gateway planners work on (gatewayPlacement.ts: where to add gateways; gatewayRelocation.ts: which
 * existing gateways to keep, move or remove).
 *
 * Meters are merged where they share a spot (a block of flats is one weighted point), put on flat coordinates in
 * metres, and indexed on a grid so "every meter within R of here" only looks at a handful of cells. `cov[i]` says how
 * many gateways currently reach point i and `covered` is the number of meters reached by at least one: placing or lifting
 * a gateway updates both, so the planners can try a layout, read the coverage and undo it cheaply.
 *
 * Candidate positions are the middle of the meters in each occupied cell of a fine grid (a quarter of the radius), so a
 * gateway is always put where meters are. A search may also add free positions between them (see addPosition).
 *
 * Pure: no I/O, deterministic (the input order does not matter).
 */

const M_PER_DEG = 111_320;
const CANDIDATE_CELLS_PER_RADIUS = 4;
/** At most this many (candidate, meter) pairs are remembered: about 30 MB. */
const MAX_CACHED_REACH = 8_000_000;

const SLIDE_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, 0.7071], [-0.7071, -0.7071]];

export interface SpaceMeter {
  lat: number;
  lng: number;
}

export function validPosition(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

/** A numeric key for a grid cell (cells stay well within +-2^20 for any real area). */
export const cellKey = (cx: number, cy: number) => (cx + 1_048_576) * 2_097_152 + (cy + 1_048_576);

export interface CoverageSpace {
  radius: number;
  R2: number;
  /** Meters with a usable position (a block of flats counts every meter). */
  N: number;
  /** Meters left out: missing, 0/0 or out-of-range position. */
  invalid: number;
  /** false when there is nothing to plan on (no usable meter, or no usable radius). */
  usable: boolean;
  /** Distinct meter positions. */
  P: number;
  pts: Array<{ lat: number; lng: number; w: number }>;
  px: Float64Array;
  py: Float64Array;
  w: Int32Array;
  toX(lng: number): number;
  toY(lat: number): number;
  toLat(y: number): number;
  toLng(x: number): number;
  forEachInRange(x: number, y: number, fn: (i: number) => void): void;
  /** How many gateways reach each point right now. */
  cov: Int32Array;
  /** Meters reached by at least one gateway right now. */
  covered: number;
  /** Candidate positions 0..C-1, then any positions added with addPosition. */
  C: number;
  cx: number[];
  cy: number[];
  candGrid: Map<number, number[]>;
  addPosition(x: number, y: number): number;
  /**
   * The flat position of the latitude / longitude a position is reported as (6 decimals, about 0.1 m). Placing a gateway
   * there rather than at the exact search result keeps every reported number true for the coordinates people are given:
   * a meter right on the edge of the radius could otherwise drop out by rounding.
   */
  snap(x: number, y: number): { x: number; y: number; lat: number; lng: number };
  /** Count a gateway standing at (x, y) without giving it an index (an existing gateway that never moves). */
  coverPoint(x: number, y: number): void;
  uncoverPoint(x: number, y: number): void;
  /** The meters a gateway at (x, y) would newly reach: nothing else reaches them now. */
  gainAt(x: number, y: number): number;
  forEachReached(j: number, fn: (i: number) => void): void;
  freeGain(j: number): number;
  place(j: number): void;
  unplace(j: number): void;
  /** The weight of the meters within reach of position j, whatever else reaches them. */
  reachWeight(j: number): number;
  /**
   * Improve a position: slide it in small steps (halving from R/2 to R/32) while that newly reaches more meters, then pull
   * it towards the middle of the meters it newly reaches as long as that reaches no fewer, which shortens distances.
   * Call with the gateway lifted (unplaced), so "newly reaches" is measured without it.
   */
  polish(x: number, y: number, gain: number): { x: number; y: number; gain: number };
}

export function buildSpace(meters: ReadonlyArray<SpaceMeter>, R: number): CoverageSpace {
  // ---- drop unusable positions; merge meters at the very same spot
  let invalid = 0;
  const spots = new Map<string, { lat: number; lng: number; w: number }>();
  for (const m of meters) {
    if (!validPosition(m.lat, m.lng)) {
      invalid++;
      continue;
    }
    // the rounded position (about 0.1 m), so meters at one spot merge the same way whatever order they come in
    const lat = Number(m.lat.toFixed(6));
    const lng = Number(m.lng.toFixed(6));
    const key = `${lat},${lng}`;
    const s = spots.get(key);
    if (s) s.w++;
    else spots.set(key, { lat, lng, w: 1 });
  }
  // sorted, so the answer does not depend on the order the meters came in
  const pts = [...spots.values()].sort((a, b) => a.lat - b.lat || a.lng - b.lng);
  const P = pts.length;
  const N = pts.reduce((s, p) => s + p.w, 0);

  // ---- flat coordinates in metres around the middle of the meters (exact enough for distances of a few km)
  const lat0 = P ? pts[P >> 1].lat : 0;
  const lng0 = P ? pts.map((p) => p.lng).sort((a, b) => a - b)[P >> 1] : 0;
  const kx = M_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
  const toX = (lng: number) => (lng - lng0) * kx;
  const toY = (lat: number) => (lat - lat0) * M_PER_DEG;
  const px = new Float64Array(P);
  const py = new Float64Array(P);
  const w = new Int32Array(P);
  for (let i = 0; i < P; i++) {
    px[i] = toX(pts[i].lng);
    py[i] = toY(pts[i].lat);
    w[i] = pts[i].w;
  }
  const usable = N > 0 && R > 0;

  // ---- points on a grid of cell = R, so "everything within R" only looks at 3 x 3 cells
  const grid = new Map<number, number[]>();
  if (usable) {
    for (let i = 0; i < P; i++) {
      const k = cellKey(Math.floor(px[i] / R), Math.floor(py[i] / R));
      const list = grid.get(k);
      if (list) list.push(i);
      else grid.set(k, [i]);
    }
  }
  const R2 = R * R;
  const forEachInRange = (x: number, y: number, fn: (i: number) => void) => {
    const gx = Math.floor(x / R);
    const gy = Math.floor(y / R);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = grid.get(cellKey(gx + dx, gy + dy));
        if (!list) continue;
        for (const i of list) {
          const ddx = px[i] - x;
          const ddy = py[i] - y;
          if (ddx * ddx + ddy * ddy <= R2) fn(i);
        }
      }
    }
  };

  // ---- candidates: the centre of the meters in each occupied cell of a fine grid
  const cx: number[] = [];
  const cy: number[] = [];
  if (usable) {
    const s = R / CANDIDATE_CELLS_PER_RADIUS;
    const fine = new Map<number, { sx: number; sy: number; sw: number }>();
    for (let i = 0; i < P; i++) {
      const k = cellKey(Math.floor(px[i] / s), Math.floor(py[i] / s));
      const c = fine.get(k);
      if (c) {
        c.sx += px[i] * w[i];
        c.sy += py[i] * w[i];
        c.sw += w[i];
      } else fine.set(k, { sx: px[i] * w[i], sy: py[i] * w[i], sw: w[i] });
    }
    const cands = [...fine.values()].map((c) => ({ x: c.sx / c.sw, y: c.sy / c.sw })).sort((a, b) => a.y - b.y || a.x - b.x);
    for (const c of cands) {
      cx.push(c.x);
      cy.push(c.y);
    }
  }
  const C = cx.length;
  // candidates on a grid of cell = R too, for "the candidates near this gateway"
  const candGrid = new Map<number, number[]>();
  for (let j = 0; j < C; j++) {
    const k = cellKey(Math.floor(cx[j] / R), Math.floor(cy[j] / R));
    const list = candGrid.get(k);
    if (list) list.push(j);
    else candGrid.set(k, [j]);
  }

  const cov = new Int32Array(P);
  const sp: CoverageSpace = {
    radius: R,
    R2,
    N,
    invalid,
    usable,
    P,
    pts,
    px,
    py,
    w,
    toX,
    toY,
    toLat: (y) => lat0 + y / M_PER_DEG,
    toLng: (x) => lng0 + x / kx,
    forEachInRange,
    cov,
    covered: 0,
    C,
    cx,
    cy,
    candGrid,
    snap(x, y) {
      const lat = Math.round((lat0 + y / M_PER_DEG) * 1e6) / 1e6;
      const lng = Math.round((lng0 + x / kx) * 1e6) / 1e6;
      return { x: toX(lng), y: toY(lat), lat, lng };
    },
    addPosition(x, y) {
      cx.push(x);
      cy.push(y);
      return cx.length - 1;
    },
    coverPoint(x, y) {
      forEachInRange(x, y, (i) => {
        if (cov[i] === 0) sp.covered += w[i];
        cov[i]++;
      });
    },
    uncoverPoint(x, y) {
      forEachInRange(x, y, (i) => {
        cov[i]--;
        if (cov[i] === 0) sp.covered -= w[i];
      });
    },
    gainAt(x, y) {
      let g = 0;
      forEachInRange(x, y, (i) => {
        if (cov[i] === 0) g += w[i];
      });
      return g;
    },
    forEachReached(j, fn) {
      const list = reachOf(j);
      if (list) for (let k = 0; k < list.length; k++) fn(list[k]);
      else forEachInRange(cx[j], cy[j], fn);
    },
    freeGain(j) {
      const list = reachOf(j);
      if (!list) return sp.gainAt(cx[j], cy[j]);
      let g = 0;
      for (let k = 0; k < list.length; k++) if (cov[list[k]] === 0) g += w[list[k]];
      return g;
    },
    place(j) {
      sp.forEachReached(j, (i) => {
        if (cov[i] === 0) sp.covered += w[i];
        cov[i]++;
      });
    },
    unplace(j) {
      sp.forEachReached(j, (i) => {
        cov[i]--;
        if (cov[i] === 0) sp.covered -= w[i];
      });
    },
    reachWeight(j) {
      let total = 0;
      sp.forEachReached(j, (i) => {
        total += w[i];
      });
      return total;
    },
    polish(x0, y0, gain0) {
      let x = x0;
      let y = y0;
      let gain = gain0;
      // slide
      for (let step = R / 2; step >= R / 32; ) {
        let moved = false;
        for (const [dx, dy] of SLIDE_DIRS) {
          const g = sp.gainAt(x + dx * step, y + dy * step);
          if (g > gain) {
            x += dx * step;
            y += dy * step;
            gain = g;
            moved = true;
            break;
          }
        }
        if (!moved) step /= 2;
      }
      // centre on the meters it newly reaches, while that reaches no fewer
      for (let k = 0; k < 3; k++) {
        let sx = 0;
        let sy = 0;
        let sw = 0;
        forEachInRange(x, y, (i) => {
          if (cov[i] === 0) {
            sx += px[i] * w[i];
            sy += py[i] * w[i];
            sw += w[i];
          }
        });
        if (sw === 0) break;
        const mx = sx / sw;
        const my = sy / sw;
        if ((mx - x) ** 2 + (my - y) ** 2 < 1 || sp.gainAt(mx, my) < gain) break;
        x = mx;
        y = my;
      }
      return { x, y, gain };
    },
  };

  // The meters in reach of each candidate, kept once worked out: the searches ask about the same candidates over and
  // over. Capped, so a huge radius over a dense city cannot use unbounded memory (beyond it, lists are recomputed).
  const reach: Array<Int32Array | undefined> = new Array(C);
  let cachedEntries = 0;
  function reachOf(j: number): Int32Array | null {
    if (j >= C) return null; // a free position added later: not cached
    let list = reach[j];
    if (list) return list;
    if (cachedEntries >= MAX_CACHED_REACH) return null;
    const tmp: number[] = [];
    forEachInRange(cx[j], cy[j], (i) => tmp.push(i));
    list = Int32Array.from(tmp);
    reach[j] = list;
    cachedEntries += list.length;
    return list;
  }

  return sp;
}
