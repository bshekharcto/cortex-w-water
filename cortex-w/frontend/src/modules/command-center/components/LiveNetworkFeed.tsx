import { useState, useMemo } from 'react';
import { Radio } from 'lucide-react';
import { RawFrameItem } from '../types/commandCenter.types';
import { fmt, formatFrequency, formatLocalTime, localTzLabel, utcTitle } from '../utils/format';
import { useThresholds, isWeakRssi, isPoorSnr } from '../utils/thresholds';
import { CopyCell } from './CopyCell';

interface Props {
  frames: RawFrameItem[];
  onSelectMeter: (meterId: string) => void;
  /** Unique meters seen in the selected window (from the summary KPIs). */
  meterCount?: number | null;
  /** gatewayId -> status, so the feed can filter frames by their gateway's freshness. */
  gatewayStatus?: Record<string, string>;
}

export function LiveNetworkFeed({ frames, onSelectMeter, meterCount, gatewayStatus }: Props) {
  const th = useThresholds();
  const [filter, setFilter] = useState<'ALL' | 'NORMAL' | 'WEAK' | 'POOR' | 'GW_PROBLEM' | 'MULTI_GW'>('ALL');

  const filteredFrames = useMemo(() => {
    if (filter === 'NORMAL') return frames.filter((f) => f.statusEvent === 'FRAME_RECEIVED');
    if (filter === 'WEAK') return frames.filter((f) => f.statusEvent === 'WEAK_RSSI');
    if (filter === 'POOR') return frames.filter((f) => f.statusEvent === 'POOR_LINK');
    // A frame proves its gateway just heard something, so "stale gateway" frames can't exist; the useful
    // question is which frames came through a gateway that is currently unhealthy.
    if (filter === 'GW_PROBLEM') {
      return frames.filter((f) => {
        const st = gatewayStatus?.[f.gatewayId];
        return st !== undefined && st !== 'reporting';
      });
    }
    if (filter === 'MULTI_GW') return frames.filter((f) => f.multiGateway === true);
    return frames;
  }, [frames, filter, gatewayStatus]);

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
            { key: 'POOR', label: 'Poor Link' },
            { key: 'GW_PROBLEM', label: 'Problem Gateway' },
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
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectMeter(frame.meterId); } }}
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
                  <td className="cc-mono cc-cell-bold"><CopyCell value={frame.meterId} label="meter ID" /></td>
                  <td className="cc-mono cc-cell-mute"><CopyCell value={frame.devEui} label="DevEUI" /></td>
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
