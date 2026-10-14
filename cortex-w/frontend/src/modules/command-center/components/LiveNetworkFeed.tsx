import { useCallback, useEffect, useRef, useState } from 'react';
import { Radio, RefreshCw } from 'lucide-react';
import { RawFrameItem } from '../types/commandCenter.types';
import { isPoorSnr, isWeakRssi, useThresholds } from '../utils/thresholds';
import { describeError, isAbortError } from '../utils/errors';
import { fetchFleetFrames, windowKey, type WindowParams } from '@/services/api/commandCenterApi';
import { useDataFreshness } from '@/components/layout/DataFreshness';

interface Props {
  /** The window and site the feed covers. */
  win: WindowParams;
  /** What the page already has (the summary's newest frames): shown until the feed's own first load arrives. */
  initialFrames: RawFrameItem[];
  metersReporting: number; // the meters that sent a frame in the chosen window
  onSelectMeter: (meterId: string) => void;
}

const FEED_SIZE = 100;

const clock = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * The live feed refreshes by itself, apart from the rest of the page: when a newer data update shows up (the same signal
 * the Dashboard follows), when the window or site changes, and on the Refresh button. While it loads only this panel
 * says so (a progress bar, the rows dimmed in place) and then the new rows replace the old ones.
 */
export function LiveNetworkFeed({ win, initialFrames, metersReporting, onSelectMeter }: Props) {
  const thresholds = useThresholds();
  const { version } = useDataFreshness();
  const [frames, setFrames] = useState<RawFrameItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const seq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const winRef = useRef(win);
  winRef.current = win;
  const key = windowKey(win);

  const load = useCallback(async () => {
    const id = ++seq.current;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRefreshing(true);
    try {
      const w = winRef.current;
      const page = await fetchFleetFrames(w, w.siteId ?? 'ALL', { limit: FEED_SIZE, signal: ctrl.signal });
      if (id !== seq.current) return;
      setFrames(page.items);
      setUpdatedAt(new Date());
      setError(null);
    } catch (err) {
      if (isAbortError(err) || id !== seq.current) return;
      setError(describeError(err, 'Could not refresh the feed'));
    } finally {
      if (id === seq.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  // first load, and a changed window or site: the rows on screen stay (dimmed, marked "Refreshing…") until the new ones arrive
  useEffect(() => {
    load();
  }, [key, load]);

  // new data has arrived: reload just the feed
  useEffect(() => {
    if (version > 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const rows = frames ?? initialFrames; // before the feed's own first answer: what the page already has
  const dim = refreshing && rows.length > 0;

  return (
    <div className={`cc-live-feed-panel ${refreshing ? 'cc-live-feed-panel--refreshing' : ''}`} aria-busy={refreshing}>
      <div className="cc-feed-header-bar">
        <div className="cc-feed-title-wrap">
          <Radio size={14} className="cc-live-pulse-icon" />
          <span className="cc-feed-title">LIVE NETWORK TELEMETRY FEED</span>
          <span className="cc-feed-status-tag">{metersReporting.toLocaleString()} meters reporting</span>
        </div>
        <div className="cc-feed-refresh">
          {refreshing ? (
            <span className="cc-feed-refresh-state" role="status">
              <RefreshCw size={12} className="cc-spin" /> Refreshing…
            </span>
          ) : (
            updatedAt && <span className="cc-feed-refresh-state">Updated {clock(updatedAt)}</span>
          )}
          <button className="cc-subfilter-chip" onClick={load} disabled={refreshing} title="Reload the feed">
            Refresh
          </button>
        </div>
      </div>

      {refreshing && (
        <div className="cc-progress" aria-hidden>
          <span className="cc-progress-bar" />
        </div>
      )}
      {error && (
        <div className="cc-feed-error" role="alert">
          {error}{rows.length > 0 ? ' — showing the last data received.' : ''}
        </div>
      )}

      <div className={`cc-feed-stream-container ${dim ? 'cc-feed-stream-container--dim' : ''}`}>
        <table className="cc-telemetry-table cc-feed-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Gateway</th>
              <th>Meter ID</th>
              <th>DevEUI</th>
              <th>FCnt</th>
              <th>Freq</th>
              <th>DR</th>
              <th>RSSI</th>
              <th>SNR</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !refreshing && (
              <tr>
                <td colSpan={9} className="cc-cell-mute">No frames in this window.</td>
              </tr>
            )}
            {rows.map((frame) => {
              const isWeak = isWeakRssi(thresholds, frame.rssi);
              const isPoor = isPoorSnr(thresholds, frame.snr);

              return (
                <tr
                  key={frame.id}
                  className="cc-table-row cc-feed-row"
                  onClick={() => onSelectMeter(frame.meterId)}
                  title={`Click to inspect Meter ${frame.meterId}`}
                >
                  <td className="cc-mono cc-cell-time">{frame.localTime ?? frame.decodedAt}</td>
                  <td className="cc-cell-bold">{frame.gatewayAlias}</td>
                  <td className="cc-mono cc-cell-bold">{frame.meterId}</td>
                  <td className="cc-mono cc-cell-mute">{frame.devEui}</td>
                  <td className="cc-mono">{frame.fCnt}</td>
                  <td className="cc-mono">{frame.frequency ?? '—'}</td>
                  <td className="cc-mono">{frame.dr == null ? '—' : `DR${frame.dr}`}</td>
                  <td className={`cc-mono ${isWeak ? 'cc-text-warn' : ''}`}>
                    {frame.rssi == null ? '—' : `${frame.rssi} dBm`}
                  </td>
                  <td className={`cc-mono ${isPoor ? 'cc-text-danger' : ''}`}>
                    {frame.snr == null ? '—' : `${frame.snr} dB`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
