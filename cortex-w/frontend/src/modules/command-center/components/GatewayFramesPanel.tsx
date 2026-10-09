import { useCallback, useEffect, useRef, useState } from 'react';
import { RawFrameItem } from '../types/commandCenter.types';
import { fetchGatewayFrames, windowKey, type WindowParams } from '@/services/api/commandCenterApi';
import { describeError, isAbortError } from '../utils/errors';
import { GatewayFramesTable } from './GatewayFramesTable';

interface Props {
  gatewayId: string;
  gatewayAlias: string;
  win: WindowParams;
  /** Changes whenever the page refreshes its summary, so this list stays current with it. */
  refreshToken?: string;
  onSelectFrameMeter: (meterId: string) => void;
  onInspectFrame: (frame: RawFrameItem) => void;
  /** True while something is being inspected (the frame drawer is open): new frames wait for a click. */
  paused?: boolean;
}

const PAGE_SIZE = 100;
const HIGHLIGHT_MS = 4000;

/**
 * Latest Frames tab: the newest frames that actually came through the selected gateway.
 *
 * It follows the page's refresh, but never moves rows under the user: while they have scrolled away from the
 * top, are pointing at or focused on a row, or have the frame drawer open, new frames are held back and a
 * "N new frames" banner offers them. Otherwise new frames slide in at the top and flash briefly.
 */
export function GatewayFramesPanel({ gatewayId, gatewayAlias, win, refreshToken, onSelectFrameMeter, onInspectFrame, paused }: Props) {
  const [frames, setFrames] = useState<RawFrameItem[]>([]);
  const [pending, setPending] = useState<RawFrameItem[]>([]);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const framesRef = useRef<RawFrameItem[]>([]);
  framesRef.current = frames;
  const busy = useRef({ hover: false, scrolled: false, focus: false });
  const pausedRef = useRef(false);
  pausedRef.current = !!paused;
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scopeKey = `${gatewayId}|${windowKey(win)}`;
  const lastScope = useRef('');

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => () => { if (clearTimer.current) clearTimeout(clearTimer.current); }, []);

  const flash = useCallback((ids: string[]) => {
    setHighlight(new Set(ids));
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setHighlight(new Set()), HIGHLIGHT_MS);
  }, []);

  const isBusy = () => busy.current.hover || busy.current.scrolled || busy.current.focus || pausedRef.current;

  const load = useCallback(
    async (offset: number, mode: 'replace' | 'append' | 'refresh') => {
      const id = ++seq.current;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      try {
        const page = await fetchGatewayFrames(gatewayId, win, { limit: PAGE_SIZE, offset, signal: ctrl.signal });
        if (id !== seq.current) return;
        setTotal(page.total);
        if (mode === 'replace') {
          setFrames(page.items);
          setPending([]);
        } else if (mode === 'append') {
          setFrames((prev) => [...prev, ...page.items]);
        } else {
          // refresh: only the frames we don't have yet are new; keep everything already loaded in place
          const have = new Set(framesRef.current.map((f) => f.id));
          const fresh = page.items.filter((f) => !have.has(f.id));
          if (fresh.length === 0) {
            setPending([]);
          } else if (isBusy()) {
            setPending(fresh);
          } else {
            setFrames((prev) => [...fresh, ...prev]);
            setPending([]);
            flash(fresh.map((f) => f.id));
          }
        }
      } catch (err) {
        if (isAbortError(err)) return;
        if (id === seq.current) setError(describeError(err, 'Failed to load frames'));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [gatewayId, win, flash]
  );

  // A new gateway/window starts clean; a plain refresh adds only what is new
  useEffect(() => {
    if (lastScope.current !== scopeKey) {
      lastScope.current = scopeKey;
      setFrames([]);
      setPending([]);
      setTotal(0);
      load(0, 'replace');
    } else {
      load(0, 'refresh');
    }
  }, [load, scopeKey, refreshToken]);

  const showPending = () => {
    if (pending.length === 0) return;
    setFrames((prev) => {
      const have = new Set(prev.map((f) => f.id));
      return [...pending.filter((f) => !have.has(f.id)), ...prev];
    });
    flash(pending.map((f) => f.id));
    setPending([]);
  };

  return (
    <div
      onScrollCapture={(e) => {
        const el = e.target as HTMLElement;
        if (el.classList?.contains('cc-table-scroll-container')) busy.current.scrolled = el.scrollTop > 4;
      }}
      onMouseEnter={() => (busy.current.hover = true)}
      onMouseLeave={() => (busy.current.hover = false)}
      onFocusCapture={() => (busy.current.focus = true)}
      onBlurCapture={() => (busy.current.focus = false)}
    >
      {pending.length > 0 && (
        <div className="cc-new-banner" role="status">
          {pending.length} new {pending.length === 1 ? 'frame' : 'frames'} arrived
          <button className="cw-button-secondary" onClick={showPending}>
            Show
          </button>
        </div>
      )}
      <GatewayFramesTable
        frames={frames}
        total={total}
        loading={loading && frames.length === 0}
        error={error}
        gatewayAlias={gatewayAlias}
        onSelectFrameMeter={onSelectFrameMeter}
        onInspectFrame={onInspectFrame}
        highlightIds={highlight}
        onLoadMore={() => load(frames.length, 'append')}
      />
    </div>
  );
}
