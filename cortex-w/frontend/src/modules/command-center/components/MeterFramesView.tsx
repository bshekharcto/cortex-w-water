import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { MeterTelemetryItem, RawFrameItem } from '../types/commandCenter.types';
import { fetchMeterFrames, type WindowParams } from '@/services/api/commandCenterApi';
import { fmt, formatFrequency, formatLocalTime, localTzLabel, utcTitle } from '../utils/format';
import { useThresholds, isWeakRssi, isPoorSnr } from '../utils/thresholds';
import { describeError } from '../utils/errors';

interface Props {
  meter: MeterTelemetryItem;
  win: WindowParams;
  onBack: () => void;
}

const PAGE_SIZE = 100;

/** Full frame history for one meter across every gateway that heard it, shown inside the Command Center. */
export function MeterFramesView({ meter, win, onBack }: Props) {
  const th = useThresholds();
  const [frames, setFrames] = useState<RawFrameItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const id = ++seq.current;
      setLoading(true);
      setError(null);
      try {
        const page = await fetchMeterFrames(meter.meterId, win, { limit: PAGE_SIZE, offset });
        if (id !== seq.current) return;
        setTotal(page.total);
        setFrames((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
      } catch (err) {
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
          <ArrowLeft size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
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
            {frames.length === 0 && (
              <tr>
                <td colSpan={99} style={{ padding: 24, textAlign: 'center', opacity: 0.7 }}>
                  {loading ? 'Loading frames…' : error ? `Could not load frames (${error}).` : 'No frames from this meter in the selected window.'}
                </td>
              </tr>
            )}
            {frames.map((f) => (
              <tr key={f.id} className="cc-table-row">
                <td className="cc-mono" title={utcTitle(f.decodedAt)}>{formatLocalTime(f.decodedAt)}</td>
                <td className="cc-mono cc-cell-mute" title="As reported by the meter's own clock">{fmt(f.meterTimestamp)}</td>
                <td className="cc-cell-bold">{f.gatewayAlias}</td>
                <td className="cc-mono">{fmt(f.fCnt)}</td>
                <td className="cc-mono">{fmt(f.fPort)}</td>
                <td className="cc-mono">{formatFrequency(f.frequency)}</td>
                <td className="cc-mono">{f.dr == null ? '—' : `DR${f.dr}`}</td>
                <td className={`cc-mono ${isWeakRssi(th, f.rssi) ? 'cc-text-warn' : ''}`}>{fmt(f.rssi, ' dBm')}</td>
                <td className={`cc-mono ${isPoorSnr(th, f.snr) ? 'cc-text-danger' : ''}`}>{fmt(f.snr, ' dB')}</td>
                <td>{f.confirmed == null ? '—' : f.confirmed ? 'Yes' : 'No'}</td>
                <td>{f.adr == null ? '—' : f.adr ? 'Yes' : 'No'}</td>
                <td><span className="cc-tag-ok">{fmt(f.checksumStatus)}</span></td>
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
