import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { MeterTelemetryItem, RawFrameItem } from '../types/commandCenter.types';
import { fetchMeterFrames, type WindowParams } from '@/services/api/commandCenterApi';
import { fmt, formatFrequency, formatLocalTime, localTzLabel, utcTitle, yesNo } from '../utils/format';
import { useThresholds, isWeakRssi, isPoorSnr } from '../utils/thresholds';
import { TableSkeleton } from './TableSkeleton';
import { describeError, isAbortError } from '../utils/errors';

interface Props {
  meter: MeterTelemetryItem;
  win: WindowParams;
  onBack: () => void;
  onInspectFrame?: (frame: RawFrameItem) => void;
}

const PAGE_SIZE = 100;

/** Full frame history for one meter across every gateway that heard it, shown inside the Command Center. */
export function MeterFramesView({ meter, win, onBack, onInspectFrame }: Props) {
  const th = useThresholds();
  const [frames, setFrames] = useState<RawFrameItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const load = useCallback(
    async (offset: number) => {
      const id = ++seq.current;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      try {
        const page = await fetchMeterFrames(meter.meterId, win, { limit: PAGE_SIZE, offset, signal: ctrl.signal });
        if (id !== seq.current) return;
        setTotal(page.total);
        setFrames((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
      } catch (err) {
        if (isAbortError(err)) return;
        if (id === seq.current) setError(describeError(err, 'Failed to load frames'));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [meter.meterId, win]
  );

  useEffect(() => {
    setFrames([]);
    setTotal(0);
    load(0);
  }, [load]);

  return (
    <div className="cc-frames-view">
      <div className="cc-subfilter-bar">
        <button className="cw-button-secondary" onClick={onBack}>
          <ArrowLeft size={13} className="cc-icon-inline" />
          Back
        </button>
        <span className="cc-subfilter-label">All frames — Meter {meter.meterId}</span>
        <span className="cc-subfilter-count">
          ({frames.length.toLocaleString()} of {total.toLocaleString()} frames, newest first)
        </span>
      </div>

      <div className="cc-table-scroll-container cc-table-scroll-container--tall">
        <table className="cc-telemetry-table">
          <thead>
            <tr>
              <th>Received ({localTzLabel()})</th>
              <th>Meter timestamp</th>
              <th>Gateway</th>
              <th>FCnt</th>
              <th>FPort</th>
              <th>Freq (MHz)</th>
              <th>DR</th>
              <th>RSSI</th>
              <th>SNR</th>
              <th>Confirmed</th>
              <th>ADR</th>
              <th>Checksum</th>
            </tr>
          </thead>
          <tbody>
            {frames.length === 0 && loading && <TableSkeleton label="Loading frames…" />}
            {frames.length === 0 && !loading && (
              <tr>
                <td colSpan={99} className="cc-table-empty">
                  {error ? `Could not load frames (${error}).` : 'No frames from this meter in the selected window.'}
                </td>
              </tr>
            )}
            {frames.map((f) => (
              <tr
                key={f.id}
                className="cc-table-row"
                tabIndex={onInspectFrame ? 0 : undefined}
                onClick={() => onInspectFrame?.(f)}
                onKeyDown={(e) => {
                  if (onInspectFrame && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onInspectFrame(f);
                  }
                }}
                title={onInspectFrame ? 'Click for frame details' : undefined}
              >
                <td className="cc-mono" title={utcTitle(f.decodedAt)}>{formatLocalTime(f.decodedAt)}</td>
                <td className="cc-mono cc-cell-mute" title="As reported by the meter's own clock">{fmt(f.meterTimestamp)}</td>
                <td className="cc-cell-bold">{f.gatewayAlias}</td>
                <td className="cc-mono">{fmt(f.fCnt)}</td>
                <td className="cc-mono">{fmt(f.fPort)}</td>
                <td className="cc-mono">{formatFrequency(f.frequency)}</td>
                <td className="cc-mono">{f.dr == null ? '—' : `DR${f.dr}`}</td>
                <td className={`cc-mono ${isWeakRssi(th, f.rssi) ? 'cc-text-warn' : ''}`}>{fmt(f.rssi, ' dBm')}</td>
                <td className={`cc-mono ${isPoorSnr(th, f.snr) ? 'cc-text-danger' : ''}`}>{fmt(f.snr, ' dB')}</td>
                <td>{yesNo(f.confirmed)}</td>
                <td>{yesNo(f.adr)}</td>
                <td><span className={f.checksumStatus === 'OK' ? 'cc-tag-ok' : 'cc-text-danger'}>{fmt(f.checksumStatus)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {frames.length < total && (
        <button className="cw-button-secondary cc-load-more" disabled={loading} onClick={() => load(frames.length)}>
          {loading ? 'Loading…' : `Load more (${(total - frames.length).toLocaleString()} remaining)`}
        </button>
      )}
    </div>
  );
}
