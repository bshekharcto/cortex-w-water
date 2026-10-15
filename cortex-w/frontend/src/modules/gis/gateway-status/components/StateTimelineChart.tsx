import { useEffect, useRef, useState } from 'react';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import type { GatewayTimeline } from '@/services/api/gatewayStatusApi';
import {
  axisTicks,
  clampView,
  dataExtent,
  fmtDateTime,
  fmtDuration,
  reasonLabel,
  tickLabel,
  zoomAnchor,
  zoomView,
  type View,
} from '../gatewayStatusModel';

interface StateTimelineChartProps {
  timeline: GatewayTimeline;
  view: View;
  full: View;
  onViewChange: (view: View) => void;
}

const BAR_TOP = 8;
const BAR_HEIGHT = 120;
const AXIS_HEIGHT = 26;
const MIN_DRAG_PX = 6;
const MIN_OFFLINE_PX = 2; // an outage of a couple of minutes in a day would otherwise vanish

/** Width of an element, kept current as it resizes. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

const GLIDE_MS = 340;
const INTRO_MS = 1100;
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Follows `target` with an eased glide, so a zoom or a jump to a period slides instead of snapping. */
function useGlidingView(target: View): View {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (from.from === target.from && from.to === target.to) return;
    if (reducedMotion()) {
      current.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / GLIDE_MS);
      const e = 1 - Math.pow(1 - p, 3); // ease-out
      const next = { from: from.from + (target.from - from.from) * e, to: from.to + (target.to - from.to) * e };
      current.current = next;
      setShown(next);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target.from, target.to]); // eslint-disable-line react-hooks/exhaustive-deps
  return shown;
}

/**
 * The state timeline: green while the gateway was online, red while offline, blank where nothing is known (the time
 * after the last report, or before the history begins). Drag across it to zoom in; the buttons zoom around the middle.
 */
export function StateTimelineChart({ timeline, view: target, full, onViewChange }: StateTimelineChartProps) {
  const { ref, width } = useWidth();
  // What is drawn glides toward the wanted window; the buttons build on the wanted one, so quick clicks add up.
  const view = useGlidingView(target);
  // The bars grow in once, when the chart first appears; later they only move with the window.
  const [intro, setIntro] = useState(!reducedMotion());
  useEffect(() => {
    const t = window.setTimeout(() => setIntro(false), INTRO_MS);
    return () => window.clearTimeout(t);
  }, []);
  const [drag, setDrag] = useState<{ x0: number; x1: number } | null>(null);
  const tz = timeline.range.timeZone;
  const span = view.to - view.from;
  const x = (t: number) => ((t - view.from) / span) * width;
  const atX = (px: number) => view.from + (px / width) * span;
  const isFull = target.from <= full.from && target.to >= full.to;

  const { ticks, step } = axisTicks(view, tz);
  const height = BAR_TOP + BAR_HEIGHT + AXIS_HEIGHT;

  const localX = (e: React.PointerEvent<SVGSVGElement>) => Math.min(Math.max(e.clientX - e.currentTarget.getBoundingClientRect().left, 0), width);

  return (
    <div className="gs-chart">
      <div className="gs-chart-head">
        <div>
          <div className="gs-card-title">State Timeline</div>
          <div className="gs-card-sub">Drag across the chart to zoom in, use the +/− buttons, or click an offline period below to jump to it.</div>
        </div>
        <div className="gs-chart-tools">
          <span className="gs-legend"><i style={{ background: 'var(--cw-green)' }} />Online</span>
          <span className="gs-legend"><i style={{ background: 'var(--cw-red)' }} />Offline</span>
          <span className="gs-legend"><i className="gs-legend-none" />No data</span>
          <button className="cw-icon-btn gs-tool" onClick={() => onViewChange(zoomView(target, full, 0.5, zoomAnchor(target, dataExtent(timeline.segments))))} aria-label="Zoom in" title="Zoom in"><ZoomIn size={16} /></button>
          <button className="cw-icon-btn gs-tool" onClick={() => onViewChange(zoomView(target, full, 2))} disabled={isFull} aria-label="Zoom out" title="Zoom out"><ZoomOut size={16} /></button>
          <button className="cw-button-secondary gs-tool-text" onClick={() => onViewChange(full)} disabled={isFull}>
            <Maximize2 size={13} /> Show full range
          </button>
        </div>
      </div>

      <div ref={ref} className="gs-chart-box">
        {width > 0 && (
          <svg
            width={width}
            height={height}
            className="gs-chart-svg"
            role="img"
            aria-label="Online and offline periods of the gateway"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              const px = localX(e);
              setDrag({ x0: px, x1: px });
            }}
            onPointerMove={(e) => drag && setDrag({ ...drag, x1: localX(e) })}
            onPointerUp={() => {
              if (drag && Math.abs(drag.x1 - drag.x0) >= MIN_DRAG_PX) {
                onViewChange(clampView({ from: atX(Math.min(drag.x0, drag.x1)), to: atX(Math.max(drag.x0, drag.x1)) }, full));
              }
              setDrag(null);
            }}
            onPointerCancel={() => setDrag(null)}
          >
            <rect x={0} y={BAR_TOP} width={width} height={BAR_HEIGHT} className="gs-chart-bg" />
            {ticks.map((t) => (
              <line key={t} x1={x(t)} x2={x(t)} y1={BAR_TOP} y2={BAR_TOP + BAR_HEIGHT + 4} className="gs-chart-grid" />
            ))}
            {timeline.segments.map((s, i) => {
              const from = Date.parse(s.start);
              const to = Date.parse(s.end);
              if (to <= view.from || from >= view.to) return null;
              const x0 = Math.max(0, x(from));
              const w = Math.max(x(Math.min(to, view.to)) - x0, s.status === 'offline' ? MIN_OFFLINE_PX : 0.5);
              return (
                <rect
                  key={i}
                  x={x0}
                  y={BAR_TOP}
                  width={w}
                  height={BAR_HEIGHT}
                  fill={s.status === 'online' ? 'var(--cw-green)' : 'var(--cw-red)'}
                  className={intro ? 'gs-seg gs-seg--intro' : 'gs-seg'}
                  style={intro ? { animationDelay: `${Math.min(i * 7, 450)}ms` } : undefined}
                >
                  <title>
                    {`${s.status === 'online' ? 'Online' : 'Offline'}\n${fmtDateTime(s.start, tz)} → ${fmtDateTime(s.end, tz)}\n${fmtDuration(s.durationSeconds)}${
                      s.status === 'offline' && s.reason ? `\n${reasonLabel(s.reason)}` : ''
                    }`}
                  </title>
                </rect>
              );
            })}
            {ticks.map((t) => {
              const px = x(t);
              return (
                <text key={t} x={px} y={BAR_TOP + BAR_HEIGHT + 18} textAnchor={px < 20 ? 'start' : px > width - 20 ? 'end' : 'middle'} className="gs-chart-tick">
                  {tickLabel(t, step, span, tz)}
                </text>
              );
            })}
            {drag && <rect x={Math.min(drag.x0, drag.x1)} y={BAR_TOP} width={Math.abs(drag.x1 - drag.x0)} height={BAR_HEIGHT} className="gs-chart-select" />}
          </svg>
        )}
      </div>
    </div>
  );
}
