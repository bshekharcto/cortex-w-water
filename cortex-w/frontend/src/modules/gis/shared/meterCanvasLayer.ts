/**
 * Draws many points on a Google map with ONE canvas instead of one map marker (and several page elements) per point.
 *
 * Why: with a marker per meter, 19,000 meters meant tens of thousands of page elements once the map was zoomed in, and
 * every pan or zoom took seconds. A canvas keeps the page at a constant size (about a thousand elements) at any zoom:
 * only the points in view are drawn, grouped into numbered bubbles when they would overlap.
 *
 * Smoothness, in three parts:
 *  - Groups are cut on a grid fixed to the map (not to the screen), so panning never re-groups anything, and the groups
 *    of one zoom level nest inside the groups of the level above.
 *  - While the map animates a zoom, the groups move with the map (they keep their size) on a canvas fixed to the map's
 *    frame, anchored where the user zoomed.
 *  - When the groups change (after a zoom, a filter change, clustering switched on/off) every group glides from where
 *    its meters were to where they are now: a bubble splits into its children, or several bubbles gather into one.
 *
 * Clicks and pointer-cursor feedback are resolved against what was drawn (no per-point listeners).
 */

export interface LayerItem<T = unknown> {
  id: string;
  lat: number;
  lng: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  /** Whatever the caller wants back when the point is clicked. */
  ref: T;
}

export type LayerHit<T = unknown> =
  | { kind: 'point'; item: LayerItem<T> }
  | {
      kind: 'cluster';
      count: number;
      bounds: { north: number; south: number; east: number; west: number };
      /** Every member sits at the very same position: zooming in will not pull them apart. */
      sameSpot: boolean;
    };

export interface MeterLayer<T = unknown> {
  setItems(items: LayerItem<T>[]): void;
  /** Group nearby points into bubbles (true) or always draw every point (false). */
  setClustering(on: boolean): void;
  setSelected(id: string | null): void;
  destroy(): void;
}

const CELL_PX = 56; // the size of one group's catchment, in screen pixels
const CLUSTER_MAX_ZOOM = 17; // beyond this every point is drawn on its own
const POINT_RADIUS = 6.5;
const PAD = 0.25; // extra canvas around the view, so a drag does not reveal an undrawn edge
const MAX_DPR = 2;
const REGROUP_MS = 360; // groups gliding to new places when nothing zooms (filters, clustering on/off)
const ZOOM_WATCHDOG_MS = 1500; // finish a zoom even if the map never reported its end

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Web-mercator world coordinates at zoom 0 (a 256 x 256 world). */
function toWorld(lat: number, lng: number): [number, number] {
  const s = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return [((lng + 180) / 360) * 256, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256];
}

const bubbleRadius = (n: number) => (n > 1000 ? 26 : n > 100 ? 22 : n > 10 ? 18 : 15);
const bubbleColor = (n: number) => (n > 1000 ? '#1D4ED8' : n > 100 ? '#0284C7' : '#059669');

/** One thing on the map: a single meter or a group. Positions are world coordinates at zoom 0, so they survive zooms. */
interface El<T> {
  key: string;
  x: number;
  y: number;
  n: number;
  /** member indexes into the item list the element was built from */
  members: number[];
  item: LayerItem<T> | null;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface Drawn<T> {
  x: number;
  y: number;
  r: number;
  hit: LayerHit<T>;
}

interface Geometry {
  ctx: CanvasRenderingContext2D;
  scale: number;
  originX: number;
  originY: number;
  cw: number;
  ch: number;
  w: number;
  h: number;
  padX: number;
  padY: number;
  zoom: number;
}

export function createMeterLayer<T = unknown>(
  google: any,
  map: any,
  handlers: { onClick: (hit: LayerHit<T> | null) => void }
): MeterLayer<T> {
  let items: LayerItem<T>[] = [];
  let wx: Float64Array = new Float64Array(0);
  let wy: Float64Array = new Float64Array(0);
  let clustering = true;
  let selectedId: string | null = null;

  let current: El<T>[] = []; // what is on screen now
  let currentItems: LayerItem<T>[] = []; // the item list `current` refers to
  let drawn: Drawn<T>[] = [];
  let lastGeo: Geometry | null = null;
  let regroupNext = false; // the next drawing should animate from the current groups

  let frame = 0;
  let anim = 0; // a running animation (zoom or regroup); while it runs it owns the drawing
  let overCursor = false;

  // zoom-follow state
  let zooming = false;
  let zoomGhost: HTMLCanvasElement | null = null;
  let settleTimer = 0;
  let pointer: { x: number; y: number; t: number } | null = null;

  const Overlay = class extends google.maps.OverlayView {
    canvas: HTMLCanvasElement | null = null;
    onAdd() {
      this.canvas = document.createElement('canvas');
      this.canvas.style.position = 'absolute';
      this.canvas.style.pointerEvents = 'none';
      this.getPanes().overlayLayer.appendChild(this.canvas);
    }
    draw() {
      // Google calls this in the same frame it moves its layers (zoom end, tile swap): redraw right away so the
      // groups never sit one frame out of place. Drags redraw through bounds_changed instead.
      if (!zooming && !anim) {
        if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
        render();
      } else schedule();
    }
    onRemove() {
      this.canvas?.remove();
      this.canvas = null;
    }
  };
  const overlay = new Overlay();

  // ---------------------------------------------------------------------------------------------------------------
  // geometry and grouping
  // ---------------------------------------------------------------------------------------------------------------

  /** Places the canvas over the current view (plus padding) and returns how to turn world coordinates into its pixels. */
  function prepare(): Geometry | null {
    const canvas = overlay.canvas as HTMLCanvasElement | null;
    const proj = overlay.getProjection?.();
    const bounds = map.getBounds?.();
    const zoom = map.getZoom?.();
    if (!canvas || !proj || !bounds || zoom == null) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const div = map.getDiv() as HTMLElement;
    const w = div.clientWidth;
    const h = div.clientHeight;
    const padX = w * PAD;
    const padY = h * PAD;
    const cw = Math.round(w + 2 * padX);
    const ch = Math.round(h + 2 * padY);
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const tl = proj.fromLatLngToDivPixel(new google.maps.LatLng(ne.lat(), sw.lng()));
    if (!tl) return null;

    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
    }
    canvas.style.left = `${tl.x - padX}px`;
    canvas.style.top = `${tl.y - padY}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const scale = Math.pow(2, zoom);
    const [twx, twy] = toWorld(ne.lat(), sw.lng());
    return { ctx, scale, originX: twx * scale - padX, originY: twy * scale - padY, cw, ch, w, h, padX, padY, zoom };
  }

  /** The groups (and lone meters) in a view. The grid is fixed to the map, so it does not move when the map pans. */
  function group(g: Pick<Geometry, 'scale' | 'originX' | 'originY' | 'cw' | 'ch' | 'zoom'>): El<T>[] {
    const useGroups = clustering && g.zoom <= CLUSTER_MAX_ZOOM;
    const margin = 40;
    const x0 = g.originX - margin;
    const y0 = g.originY - margin;
    const x1 = g.originX + g.cw + margin;
    const y1 = g.originY + g.ch + margin;
    const cells = new Map<number, El<T> & { sx: number; sy: number }>();
    const out: El<T>[] = [];

    for (let i = 0; i < items.length; i++) {
      const px = wx[i] * g.scale;
      const py = wy[i] * g.scale;
      if (px < x0 || py < y0 || px > x1 || py > y1) continue;
      const it = items[i];
      if (!useGroups) {
        out.push({ key: it.id, x: wx[i], y: wy[i], n: 1, members: [i], item: it, minLat: it.lat, maxLat: it.lat, minLng: it.lng, maxLng: it.lng });
        continue;
      }
      const key = Math.floor(px / CELL_PX) * 1e7 + Math.floor(py / CELL_PX);
      const c = cells.get(key);
      if (!c) {
        cells.set(key, { key: '', x: 0, y: 0, n: 1, sx: wx[i], sy: wy[i], members: [i], item: it, minLat: it.lat, maxLat: it.lat, minLng: it.lng, maxLng: it.lng });
      } else {
        c.n++;
        c.sx += wx[i];
        c.sy += wy[i];
        c.members.push(i);
        if (it.lat < c.minLat) c.minLat = it.lat;
        if (it.lat > c.maxLat) c.maxLat = it.lat;
        if (it.lng < c.minLng) c.minLng = it.lng;
        if (it.lng > c.maxLng) c.maxLng = it.lng;
      }
    }
    for (const c of cells.values()) {
      if (c.n === 1) out.push({ ...c, key: c.item!.id, x: c.sx, y: c.sy });
      else out.push({ ...c, key: `g:${c.item!.id}:${c.n}`, x: c.sx / c.n, y: c.sy / c.n, item: null });
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // drawing
  // ---------------------------------------------------------------------------------------------------------------

  /** k scales the size: splitting children grow into place, merging bubbles shrink a little as they leave. */
  function drawEl(ctx: CanvasRenderingContext2D, el: El<T>, x: number, y: number, alpha: number, k = 1) {
    if (alpha <= 0.01) return;
    ctx.globalAlpha = alpha;
    if (el.item && el.n === 1) {
      ctx.beginPath();
      ctx.arc(x, y, POINT_RADIUS * k, 0, Math.PI * 2);
      ctx.fillStyle = el.item.fill;
      ctx.fill();
      ctx.lineWidth = el.item.strokeWidth;
      ctx.strokeStyle = el.item.stroke;
      ctx.stroke();
    } else {
      const r = bubbleRadius(el.n) * k;
      ctx.fillStyle = bubbleColor(el.n);
      ctx.globalAlpha = alpha * 0.3;
      ctx.beginPath();
      ctx.arc(x, y, r + 6 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha * 0.95;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 12px Inter, Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.n >= 1000 ? `${(el.n / 1000).toFixed(1)}k` : String(el.n), x, y);
    }
    ctx.globalAlpha = 1;
  }

  function drawSelection(ctx: CanvasRenderingContext2D, g: Geometry) {
    if (!selectedId) return;
    const el = current.find((e) => e.item && e.n === 1 && e.item.id === selectedId);
    if (!el) return;
    ctx.beginPath();
    ctx.arc(el.x * g.scale - g.originX, el.y * g.scale - g.originY, POINT_RADIUS + 5, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2563EB';
    ctx.stroke();
  }

  /** Draws the current groups where they are, and records them for clicks. */
  function drawStatic(g: Geometry) {
    drawn = [];
    for (const el of current) {
      const x = el.x * g.scale - g.originX;
      const y = el.y * g.scale - g.originY;
      drawEl(g.ctx, el, x, y, 1);
      if (el.item && el.n === 1) drawn.push({ x, y, r: POINT_RADIUS + 3, hit: { kind: 'point', item: el.item } });
      else
        drawn.push({
          x,
          y,
          r: bubbleRadius(el.n) + 4,
          hit: {
            kind: 'cluster',
            count: el.n,
            bounds: { north: el.maxLat, south: el.minLat, east: el.maxLng, west: el.minLng },
            sameSpot: el.minLat === el.maxLat && el.minLng === el.maxLng,
          },
        });
    }
    drawSelection(g.ctx, g);
  }

  function stopAnim() {
    if (anim) cancelAnimationFrame(anim);
    anim = 0;
  }

  interface Plan {
    incoming: Array<{ el: El<T>; sx: number; sy: number; stays: boolean; fresh: boolean }>;
    outgoing: Array<{ el: El<T>; tx: number; ty: number }>;
  }

  /**
   * How to get from one set of groups to another: each new element starts where its meters were drawn before (the
   * middle of their old groups) and each old element heads to where its meters are drawn now, fading out. Elements that
   * did not change just stay. Positions are world coordinates, so the plan holds while the map zooms.
   */
  function plan(from: El<T>[], fromItems: LayerItem<T>[], to: El<T>[]): Plan {
    const before = new Map<string, El<T>>();
    for (const el of from) for (const m of el.members) before.set(fromItems[m].id, el);
    const after = new Map<string, El<T>>();
    for (const el of to) for (const m of el.members) after.set(items[m].id, el);
    const toKeys = new Set(to.map((e) => e.key));
    const fromKeys = new Set(from.map((e) => e.key));

    // the middle of where (a sample of up to 64 of) the members are drawn on the other side
    const centre = (members: number[], list: LayerItem<T>[], where: Map<string, El<T>>, fallback: El<T>) => {
      const step = Math.max(1, Math.floor(members.length / 64));
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let k = 0; k < members.length; k += step) {
        const e = where.get(list[members[k]].id);
        if (!e) continue;
        sx += e.x;
        sy += e.y;
        n++;
      }
      return n ? { x: sx / n, y: sy / n, known: true } : { x: fallback.x, y: fallback.y, known: false };
    };

    return {
      incoming: to.map((el) => {
        if (fromKeys.has(el.key)) return { el, sx: el.x, sy: el.y, stays: true, fresh: false };
        const c = centre(el.members, items, before, el);
        return { el, sx: c.x, sy: c.y, stays: false, fresh: !c.known };
      }),
      outgoing: from
        .filter((el) => !toKeys.has(el.key))
        .map((el) => {
          const c = centre(el.members, fromItems, after, el);
          return { el, tx: c.x, ty: c.y };
        }),
    };
  }

  /** One frame of a plan at progress e (0..1); toScreen turns world coordinates into pixels of the canvas drawn on. */
  function drawPlan(ctx: CanvasRenderingContext2D, p: Plan, e: number, toScreen: (x: number, y: number) => [number, number], w: number, h: number) {
    const inView = (x: number, y: number) => x > -40 && y > -40 && x < w + 40 && y < h + 40;
    // the old ones leave quickly, so splits and merges read clearly instead of piling up
    const outAlpha = Math.max(0, 1 - e * 1.6);
    for (const o of p.outgoing) {
      const [x, y] = toScreen(lerp(o.el.x, o.tx, e), lerp(o.el.y, o.ty, e));
      if (inView(x, y)) drawEl(ctx, o.el, x, y, outAlpha, 1 - 0.25 * e);
    }
    const inAlpha = Math.min(1, 0.25 + e * 1.2);
    for (const i of p.incoming) {
      const [x, y] = i.stays ? toScreen(i.el.x, i.el.y) : toScreen(lerp(i.sx, i.el.x, e), lerp(i.sy, i.el.y, e));
      if (inView(x, y)) drawEl(ctx, i.el, x, y, i.stays ? 1 : i.fresh ? e : inAlpha, i.stays ? 1 : 0.55 + 0.45 * e);
    }
  }

  /** Regrouping without a zoom (filters, clustering on/off): the groups glide to their new places on the real canvas. */
  function regroup(from: El<T>[], fromItems: LayerItem<T>[], to: El<T>[]) {
    stopAnim();
    const p = plan(from, fromItems, to);
    current = to;
    currentItems = items;
    const start = performance.now();
    const step = () => {
      const g = prepare();
      if (!g) {
        anim = 0;
        return;
      }
      lastGeo = g;
      const t = Math.min(1, (performance.now() - start) / REGROUP_MS);
      drawPlan(g.ctx, p, easeInOut(t), (x, y) => [x * g.scale - g.originX, y * g.scale - g.originY], g.cw, g.ch);
      if (t < 1) {
        anim = requestAnimationFrame(step);
      } else {
        anim = 0;
        drawStatic(g);
      }
    };
    anim = requestAnimationFrame(step);
  }

  function render() {
    if (zooming) return;
    const g = prepare();
    if (!g) return;
    lastGeo = g;
    const next = group(g);
    if (regroupNext && current.length > 0) {
      regroupNext = false;
      regroup(current, currentItems, next);
      return;
    }
    regroupNext = false;
    if (anim) {
      // a regroup is still running and will draw the final state itself; just keep what it targets in step
      return;
    }
    current = next;
    currentItems = items;
    drawStatic(g);
  }

  function schedule() {
    if (frame || zooming) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // following the map's zoom animation
  // ---------------------------------------------------------------------------------------------------------------
  //
  // Google scales its tile layer with a CSS transform during a zoom (it waits ~200 ms after a wheel step, then animates
  // ~270 ms on its own curve). Rather than guess that timing, every frame reads where the tile layer actually is and
  // places each group with the same scale and offset, so groups and streets move as one. The split / gather progress is
  // the map's own zoom progress. The target groups are worked out as soon as the zoom starts; a zoom the map does not
  // animate (a big jump) ends in a normal glide instead.

  interface TileWatch {
    el: HTMLElement;
    s0: number;
    ox0: number;
    oy0: number;
  }
  let zoomBase: Geometry | null = null; // the view when the zoom began
  let zoomPlan: Plan | null = null;
  let zoomTarget: El<T>[] = [];
  let zoomTargetFactor = 1; // map scale at the end of the zoom, relative to the start
  let zoomLogFrom = 0; // log of the map scale when the current plan was made
  let tiles: TileWatch[] = [];
  let lockedTile: TileWatch | null = null;
  let sawMotion = false;
  let bestProgress = 0;

  const matrixScale = (el: HTMLElement): number | null => {
    const m = /matrix\(\s*([-\d.e]+)/.exec(el.style.transform || '');
    return m ? Number(m[1]) : null;
  };

  /** How the map is scaled right now relative to the start of the zoom: factor r and where local (0,0) of the tile layer is. */
  function mapMotion(): { r: number; ox: number; oy: number; ox0: number; oy0: number } | null {
    const divRect = mapDiv.getBoundingClientRect();
    let pick: TileWatch | null = lockedTile;
    let s = pick ? matrixScale(pick.el) : null;
    if (!pick || s == null) {
      let dev = 0.0005;
      pick = null;
      for (const t of tiles) {
        const v = matrixScale(t.el);
        if (v == null || !t.el.isConnected) continue;
        const d = Math.abs(Math.log(v / t.s0));
        if (d > dev) {
          dev = d;
          pick = t;
          s = v;
        }
      }
      if (pick) lockedTile = pick; // stay with the layer that started moving
    }
    if (!pick || s == null) return null;
    const rect = pick.el.getBoundingClientRect();
    return { r: s / pick.s0, ox: rect.left - divRect.left, oy: rect.top - divRect.top, ox0: pick.ox0, oy0: pick.oy0 };
  }

  /** The view the map will show after the zoom (only used to decide which groups to prepare, so it is generous). */
  function targetView(base: Geometry, factor: number, zoom: number) {
    const anchor = pointer && performance.now() - pointer.t < 800 ? pointer : { x: base.w / 2, y: base.h / 2 };
    const cx = anchor.x - (base.originX + base.padX + anchor.x) * factor;
    const cy = anchor.y - (base.originY + base.padY + anchor.y) * factor;
    const extraX = base.cw * 0.4;
    const extraY = base.ch * 0.4;
    return { scale: base.scale * factor, originX: -(cx + base.padX) - extraX, originY: -(cy + base.padY) - extraY, cw: base.cw + 2 * extraX, ch: base.ch + 2 * extraY, zoom };
  }

  function zoomStep() {
    const ghost = zoomGhost;
    const base = zoomBase;
    if (!ghost || !zooming || !base || !zoomPlan) {
      anim = 0;
      return;
    }
    const motion = mapMotion();
    let r = 1;
    let toScreen = (x: number, y: number): [number, number] => [x * base.scale - base.originX - base.padX, y * base.scale - base.originY - base.padY];
    if (motion && Math.abs(Math.log(motion.r)) > 1e-4) {
      sawMotion = true;
      r = motion.r;
      const { ox, oy, ox0, oy0 } = motion;
      toScreen = (x, y) => [
        (x * base.scale - base.originX - base.padX - ox0) * r + ox,
        (y * base.scale - base.originY - base.padY - oy0) * r + oy,
      ];
    }
    const logTarget = Math.log(zoomTargetFactor);
    const span = logTarget - zoomLogFrom;
    const progress = Math.abs(span) < 1e-6 ? 1 : Math.min(1, Math.max(0, (Math.log(r) - zoomLogFrom) / span));

    // The map has landed (or has already swapped in the new tiles, which resets its transform): hand over.
    if (sawMotion && (progress > 0.995 || (bestProgress > 0.85 && progress < 0.2))) {
      anim = 0;
      finishZoom();
      return;
    }
    bestProgress = Math.max(bestProgress, progress);

    const ctx = ghost.getContext('2d');
    if (ctx) {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = ghost.width / dpr;
      const h = ghost.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawPlan(ctx, zoomPlan, progress, toScreen, w, h);
    }
    anim = requestAnimationFrame(zoomStep);
  }

  /** The map started (or continued) a zoom. */
  function startZoom() {
    const canvas = overlay.canvas as HTMLCanvasElement | null;
    const z = map.getZoom?.();
    const g = lastGeo;
    if (!canvas || !g || z == null) return;

    if (!zooming) {
      if (z === g.zoom) return;
      zooming = true;
      stopAnim();
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      // every element of the map that carries a scale transform: one of them is the tile layer that will animate
      const divRect = mapDiv.getBoundingClientRect();
      tiles = [];
      for (const el of Array.from(mapDiv.querySelectorAll('div')) as HTMLElement[]) {
        const s0 = matrixScale(el);
        if (s0 == null || s0 === 0) continue;
        const rect = el.getBoundingClientRect();
        tiles.push({ el, s0, ox0: rect.left - divRect.left, oy0: rect.top - divRect.top });
      }
      lockedTile = null;
      sawMotion = false;
      bestProgress = 0;
      zoomLogFrom = 0;

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const ghost = document.createElement('canvas');
      ghost.width = Math.round(g.w * dpr);
      ghost.height = Math.round(g.h * dpr);
      Object.assign(ghost.style, { position: 'absolute', left: '0px', top: '0px', width: `${g.w}px`, height: `${g.h}px`, pointerEvents: 'none', zIndex: '1' });
      mapDiv.appendChild(ghost);
      zoomGhost = ghost;
      zoomBase = g;
      canvas.style.visibility = 'hidden';
      anim = requestAnimationFrame(zoomStep);
    } else {
      // a further step while zooming: the new plan starts from what is drawn now
      const m = mapMotion();
      zoomLogFrom = m ? Math.log(m.r) : 0;
      current = zoomTarget;
      currentItems = items;
      bestProgress = 0;
    }
    const base = zoomBase!;
    zoomTargetFactor = Math.pow(2, z - base.zoom);
    zoomTarget = group(targetView(base, zoomTargetFactor, z));
    zoomPlan = plan(current, currentItems, zoomTarget);
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(finishZoom, ZOOM_WATCHDOG_MS);
  }

  /** The zoom has ended: the real canvas takes over. */
  function finishZoom() {
    if (!zooming) return;
    zooming = false;
    stopAnim();
    window.clearTimeout(settleTimer);
    const animated = sawMotion;
    const canvas = overlay.canvas as HTMLCanvasElement | null;
    if (canvas) canvas.style.visibility = 'visible';
    if (animated) {
      // the ghost already shows the groups the zoom ended on, at their places: draw the same on the real canvas
      current = zoomTarget;
      currentItems = items;
      regroupNext = false;
    } else {
      regroupNext = true; // the map jumped without animating: glide the groups on the real canvas instead
    }
    render();
    zoomGhost?.remove();
    zoomGhost = null;
    zoomBase = null;
    zoomPlan = null;
    tiles = [];
    lockedTile = null;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // input
  // ---------------------------------------------------------------------------------------------------------------

  /** The newest-drawn thing under a map position, or null. */
  function hitAt(latLng: any): LayerHit<T> | null {
    const g = lastGeo;
    if (!latLng || !g || drawn.length === 0 || zooming || anim) return null;
    const [x0, y0] = toWorld(latLng.lat(), latLng.lng());
    const x = x0 * g.scale - g.originX;
    const y = y0 * g.scale - g.originY;
    let best: Drawn<T> | null = null;
    let bestD = Infinity;
    for (let i = drawn.length - 1; i >= 0; i--) {
      const d = drawn[i];
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist <= d.r && dist < bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best ? best.hit : null;
  }

  const rememberPointer = (e: Event) => {
    const me = e as MouseEvent;
    const rect = (map.getDiv() as HTMLElement).getBoundingClientRect();
    pointer = { x: me.clientX - rect.left, y: me.clientY - rect.top, t: performance.now() };
  };
  const mapDiv = map.getDiv() as HTMLElement;
  mapDiv.addEventListener('wheel', rememberPointer, { passive: true, capture: true });
  mapDiv.addEventListener('dblclick', rememberPointer, { capture: true });

  const listeners: any[] = [
    map.addListener('zoom_changed', startZoom),
    map.addListener('bounds_changed', schedule),
    map.addListener('idle', () => {
      if (zooming) {
        if (!sawMotion) finishZoom();
      } else schedule();
    }),
    map.addListener('click', (e: any) => handlers.onClick(hitAt(e.latLng))),
    map.addListener('mousemove', (e: any) => {
      const over = hitAt(e.latLng) !== null;
      if (over !== overCursor) {
        overCursor = over;
        map.setOptions({ draggableCursor: over ? 'pointer' : null });
      }
    }),
  ];
  overlay.setMap(map);

  return {
    setItems(next) {
      items = next;
      wx = new Float64Array(next.length);
      wy = new Float64Array(next.length);
      for (let i = 0; i < next.length; i++) {
        const [x, y] = toWorld(next[i].lat, next[i].lng);
        wx[i] = x;
        wy[i] = y;
      }
      regroupNext = current.length > 0;
      schedule();
    },
    setClustering(on) {
      if (on === clustering) return;
      clustering = on;
      regroupNext = true;
      schedule();
    },
    setSelected(id) {
      selectedId = id;
      schedule();
    },
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      stopAnim();
      window.clearTimeout(settleTimer);
      zoomGhost?.remove();
      mapDiv.removeEventListener('wheel', rememberPointer, { capture: true } as EventListenerOptions);
      mapDiv.removeEventListener('dblclick', rememberPointer, { capture: true } as EventListenerOptions);
      listeners.forEach((l) => google.maps.event.removeListener(l));
      overlay.setMap(null);
    },
  };
}
