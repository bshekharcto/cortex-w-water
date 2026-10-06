import { useEffect, useMemo, useRef, useState } from 'react';
import { Info, Radio } from 'lucide-react';
import { RawFrameItem } from '../types/commandCenter.types';
import { fetchFleetFrames, windowKey, type WindowParams } from '@/services/api/commandCenterApi';
import { describeError, isAbortError } from '../utils/errors';
import { fmt, formatFrequency, formatLocalTime, localTzLabel, utcTitle } from '../utils/format';
import { useThresholds, isWeakRssi, isPoorSnr } from '../utils/thresholds';
import { useVirtualRows } from '../utils/useVirtualRows';
import { CopyCell } from './CopyCell';
import { TableSkeleton } from './TableSkeleton';

interface Props {
  /** The newest frames from the summary (first page of the feed). */
  frames: RawFrameItem[];
  onSelectMeter: (meterId: string) => void;
  onInspectFrame: (frame: RawFrameItem) => void;
  /** Unique meters seen in the selected window (from the summary KPIs). */
  meterCount?: number | null;
  /** gatewayId -> status, so the feed can filter frames by their gateway's freshness. */
  gatewayStatus?: Record<string, string>;
  /** Used to page further back than the summary's first page. */
  win: WindowParams;
  siteId: string;
}

type FeedFilter = 'ALL' | 'NORMAL' | 'WEAK' | 'POOR' | 'GW_PROBLEM' | 'MULTI_GW';
const PAGE = 100;

export function LiveNetworkFeed({ frames, onSelectMeter, onInspectFrame, meterCount, gatewayStatus, win, siteId }: Props) {
  const th = useThresholds();
  const [filter, setFilter] = useState<FeedFilter>('ALL');
  const [older, setOlder] = useState<RawFrameItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // The summary just delivered a fresh first page, so anything paged in earlier no longer lines up: start over
  useEffect(() => {
    setOlder([]);
    setTotal(null);
    setOlderError(null);
  }, [frames, win, siteId]);

  const all = useMemo(() => {
    const seen = new Set(frames.map((f) => f.id));
    return [...frames, ...older.filter((f) => !seen.has(f.id))];
  }, [frames, older]);

  const loadOlder = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoadingOlder(true);
    setOlderError(null);
    try {
      const page = await fetchFleetFrames(win, siteId, { limit: PAGE, offset: all.length, signal: ctrl.signal });
      setTotal(page.total);
      setOlder((prev) => [...prev, ...page.items]);
    } catch (err) {
      if (!isAbortError(err)) setOlderError(describeError(err, 'Failed to load older frames'));
    } finally {
      if (!ctrl.signal.aborted) setLoadingOlder(false);
    }
  };

  const filtered = useMemo(() => {
    if (filter === 'NORMAL') return all.filter((f) => f.statusEvent === 'FRAME_RECEIVED');
    if (filter === 'WEAK') return all.filter((f) => f.statusEvent === 'WEAK_RSSI');
    if (filter === 'POOR') return all.filter((f) => f.statusEvent === 'POOR_LINK');
    // A frame proves its gateway just heard something, so "stale gateway" frames can't exist; the useful
    // question is which frames came through a gateway that is currently unhealthy.
    if (filter === 'GW_PROBLEM') {
      return all.filter((f) => {
        const st = gatewayStatus?.[f.gatewayId];
        return st !== undefined && st !== 'reporting';
      });
    }
    if (filter === 'MULTI_GW') return all.filter((f) => f.multiGateway === true);
    return all;
  }, [all, filter, gatewayStatus]);

  const v = useVirtualRows(filtered.length, `${filter}|${windowKey(win)}|${siteId}`);
  const moreAvailable = total === null || all.length < total;

  return (
    <div className="cc-live-feed-panel">
      <div className="cc-feed-header-bar">
        <div className="cc-feed-title-wrap">
          <Radio size={14} className="cc-live-pulse-icon" />
          <span className="cc-feed-title">LIVE NETWORK TELEMETRY FEED</span>
          {meterCount != null && <span className="cc-feed-status-tag">{meterCount.toLocaleString()} unique meters seen</span>}
          <span className="cc-feed-status-tag">{filtered.length.toLocaleString()} frames{total !== null ? ` of ${total.toLocaleString()}` : ''}</span>
        </div>

        <div className="cc-feed-filters">
          {([
            { key: 'ALL', label: 'All' },
            { key: 'NORMAL', label: 'Normal' },
            { key: 'WEAK', label: 'Weak Signal' },
            { key: 'POOR', label: 'Poor Link' },
            { key: 'GW_PROBLEM', label: 'Problem Gateway' },
            { key: 'MULTI_GW', label: 'Multi-Gateway' },
          ] as Array<{ key: FeedFilter; label: string }>).map((f) => (
            <button
              key={f.key}
              aria-pressed={filter === f.key}
              className={`cc-feed-filter-btn ${filter === f.key ? 'cc-feed-filter-btn--active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cc-feed-stream-container" ref={v.containerRef} onScroll={v.onScroll}>
        <table className="cc-telemetry-table cc-telemetry-table--virtual cc-feed-table">
          <thead>
            <tr>
              <th>Time ({localTzLabel()})</th>
              <th>Gateway</th>
              <th>Meter ID</th>
              <th>DevEUI</th>
              <th>FCnt</th>
              <th>Freq (MHz)</th>
              <th>DR</th>
              <th>RSSI</th>
              <th>SNR</th>
              <th>Event Status</th>
              <th aria-label="Details" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && frames.length === 0 && <TableSkeleton label="Loading frames…" rows={4} />}
            {filtered.length === 0 && frames.length > 0 && (
              <tr>
                <td colSpan={99} className="cc-table-empty">
                  No frames to show.
                </td>
              </tr>
            )}
            {v.padTop > 0 && (
              <tr aria-hidden="true">
                <td colSpan={99} style={{ height: v.padTop, padding: 0, border: 0 }} />
              </tr>
            )}
            {filtered.slice(v.start, v.end).map((frame) => {
              const isWeak = isWeakRssi(th, frame.rssi);
              const isPoor = isPoorSnr(th, frame.snr);

              return (
                <tr
                  key={frame.id}
                  className="cc-table-row cc-feed-row"
                  onClick={() => onSelectMeter(frame.meterId)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectMeter(frame.meterId);
                    }
                  }}
                  title={`Click to inspect Meter ${frame.meterId}`}
                >
                  <td className="cc-mono cc-cell-time" title={utcTitle(frame.decodedAt)}>{formatLocalTime(frame.decodedAt)}</td>
                  <td className="cc-cell-bold">
                    {frame.gatewayAlias}
                    {frame.multiGateway && (
                      <span className="cc-pill-multi cc-pill-multi--inline" title="Heard by more than one gateway">
                        MULTI
                      </span>
                    )}
                  </td>
                  <td className="cc-mono cc-cell-bold"><CopyCell value={frame.meterId} label="meter ID" /></td>
                  <td className="cc-mono cc-cell-mute"><CopyCell value={frame.devEui} label="DevEUI" /></td>
                  <td className="cc-mono">{fmt(frame.fCnt)}</td>
                  <td className="cc-mono">{formatFrequency(frame.frequency)}</td>
                  <td className="cc-mono">{frame.dr == null ? '—' : `DR${frame.dr}`}</td>
                  <td className={`cc-mono ${isWeak ? 'cc-text-warn' : ''}`}>{fmt(frame.rssi, ' dBm')}</td>
                  <td className={`cc-mono ${isPoor ? 'cc-text-danger' : ''}`}>{fmt(frame.snr, ' dB')}</td>
                  <td>
                    <span className={`cc-event-badge cc-event-badge--${frame.statusEvent.toLowerCase()}`}>
                      {frame.statusEvent.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <button
                      className="cc-icon-btn cc-row-info"
                      aria-label={`Details for the frame from meter ${frame.meterId}`}
                      title="Frame details"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInspectFrame(frame);
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Info size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {v.padBottom > 0 && (
              <tr aria-hidden="true">
                <td colSpan={99} style={{ height: v.padBottom, padding: 0, border: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {frames.length > 0 && moreAvailable && (
        <div className="cc-feed-more">
          <button className="cw-button-secondary" disabled={loadingOlder} onClick={loadOlder}>
            {loadingOlder ? 'Loading…' : total === null ? 'Load older frames' : `Load older frames (${(total - all.length).toLocaleString()} remaining)`}
          </button>
          {olderError && <span className="cc-gap-note" role="alert">{olderError}</span>}
        </div>
      )}
    </div>
  );
}
