import { useState, useMemo } from 'react';
import { Radio } from 'lucide-react';
import { RawFrameItem } from '../types/commandCenter.types';
import { fmt, formatFrequency, formatLocalTime, localTzLabel, utcTitle } from '../utils/format';
import { useThresholds, isWeakRssi, isPoorSnr } from '../utils/thresholds';

interface Props {
  frames: RawFrameItem[];
  onSelectMeter: (meterId: string) => void;
  /** Unique meters seen in the selected window (from the summary KPIs). */
  meterCount?: number | null;
}

export function LiveNetworkFeed({ frames, onSelectMeter, meterCount }: Props) {
  const th = useThresholds();
  const [filter, setFilter] = useState<'ALL' | 'NORMAL' | 'WEAK' | 'DEGRADED' | 'MULTI_GW'>('ALL');

  const filteredFrames = useMemo(() => {
    if (filter === 'NORMAL') return frames.filter((f) => f.statusEvent === 'FRAME_RECEIVED');
    if (filter === 'WEAK') return frames.filter((f) => f.statusEvent === 'WEAK_RSSI' || f.statusEvent === 'POOR_LINK');
    if (filter === 'DEGRADED') return frames.filter((f) => f.statusEvent === 'DEGRADED' || f.statusEvent === 'POOR_LINK');
    if (filter === 'MULTI_GW') return frames.filter((f) => f.multiGateway === true);
    return frames;
  }, [frames, filter]);

  return (
    <div className="cc-live-feed-panel">
      <div className="cc-feed-header-bar">
        <div className="cc-feed-title-wrap">
          <Radio size={14} className="cc-live-pulse-icon" />
          <span className="cc-feed-title">LIVE NETWORK TELEMETRY FEED</span>
          {meterCount != null && (
            <span className="cc-feed-status-tag">{meterCount.toLocaleString()} unique meters seen</span>
          )}
        </div>

        <div className="cc-feed-filters">
          {[
            { key: 'ALL', label: 'All' },
            { key: 'NORMAL', label: 'Normal' },
            { key: 'WEAK', label: 'Weak Signal' },
            { key: 'DEGRADED', label: 'Degraded' },
            { key: 'MULTI_GW', label: 'Multi-Gateway' },
          ].map((f) => (
            <button
              key={f.key}
              className={`cc-feed-filter-btn ${filter === f.key ? 'cc-feed-filter-btn--active' : ''}`}
              onClick={() => setFilter(f.key as any)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cc-feed-stream-container">
        <table className="cc-telemetry-table cc-feed-table">
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
            </tr>
          </thead>
          <tbody>
            {filteredFrames.length === 0 && (
              <tr>
                <td colSpan={99} style={{ padding: 24, textAlign: 'center', opacity: 0.7 }}>
                  No frames to show.
                </td>
              </tr>
            )}
            {filteredFrames.map((frame) => {
              const isWeak = isWeakRssi(th, frame.rssi);
              const isPoor = isPoorSnr(th, frame.snr);

              return (
                <tr
                  key={frame.id}
                  className="cc-table-row cc-feed-row"
                  onClick={() => onSelectMeter(frame.meterId)}
                  title={`Click to inspect Meter ${frame.meterId}`}
                >
                  <td className="cc-mono cc-cell-time" title={utcTitle(frame.decodedAt)}>{formatLocalTime(frame.decodedAt)}</td>
                  <td className="cc-cell-bold">
                    {frame.gatewayAlias}
                    {frame.multiGateway && (
                      <span className="cc-pill-multi" style={{ marginLeft: 6 }} title="Heard by more than one gateway">
                        MULTI
                      </span>
                    )}
                  </td>
                  <td className="cc-mono cc-cell-bold">{frame.meterId}</td>
                  <td className="cc-mono cc-cell-mute">{fmt(frame.devEui)}</td>
                  <td className="cc-mono">{fmt(frame.fCnt)}</td>
                  <td className="cc-mono">{formatFrequency(frame.frequency)}</td>
                  <td className="cc-mono">{frame.dr == null ? '—' : `DR${frame.dr}`}</td>
                  <td className={`cc-mono ${isWeak ? 'cc-text-warn' : ''}`}>
                    {fmt(frame.rssi, ' dBm')}
                  </td>
                  <td className={`cc-mono ${isPoor ? 'cc-text-danger' : ''}`}>
                    {fmt(frame.snr, ' dB')}
                  </td>
                  <td>
                    <span className={`cc-event-badge cc-event-badge--${frame.statusEvent.toLowerCase()}`}>
                      {frame.statusEvent.replace('_', ' ')}
                    </span>
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
