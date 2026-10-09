import { frameStatusLabel, FRAME_STATUS_HELP } from '../utils/frameStatusLabel';
import { useState, useMemo } from 'react';
import { Radio } from 'lucide-react';
import { RawFrameItem } from '../types/commandCenter.types';

interface Props {
  frames: RawFrameItem[];
  metersReporting: number; // the meters that sent a frame in the chosen window
  onSelectMeter: (meterId: string) => void;
}

export function LiveNetworkFeed({ frames, metersReporting, onSelectMeter }: Props) {
  const [filter, setFilter] = useState<'ALL' | 'NORMAL' | 'WEAK' | 'DEGRADED' | 'MULTI_GW'>('ALL');

  const filteredFrames = useMemo(() => {
    if (filter === 'NORMAL') return frames.filter((f) => f.statusEvent === 'FRAME_RECEIVED');
    if (filter === 'WEAK') return frames.filter((f) => f.statusEvent === 'WEAK_RSSI' || f.statusEvent === 'POOR_LINK');
    if (filter === 'DEGRADED') return frames.filter((f) => f.statusEvent === 'DEGRADED' || f.statusEvent === 'POOR_LINK');
    if (filter === 'MULTI_GW') return frames.filter((f) => f.statusEvent === 'MULTI_GW');
    return frames;
  }, [frames, filter]);

  return (
    <div className="cc-live-feed-panel">
      <div className="cc-feed-header-bar">
        <div className="cc-feed-title-wrap">
          <Radio size={14} className="cc-live-pulse-icon" />
          <span className="cc-feed-title">LIVE NETWORK TELEMETRY FEED</span>
          <span className="cc-feed-status-tag">{metersReporting.toLocaleString()} meters reporting</span>
        </div>

        <div className="cc-feed-filters">
          {[
            { key: 'ALL', label: 'All' },
            { key: 'NORMAL', label: 'Good' },
            { key: 'WEAK', label: 'Weak signal' },
            { key: 'DEGRADED', label: 'Noisy' },
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
              <th>Time</th>
              <th>Gateway</th>
              <th>Meter ID</th>
              <th>DevEUI</th>
              <th>FCnt</th>
              <th>Freq</th>
              <th>DR</th>
              <th>RSSI</th>
              <th>SNR</th>
              <th>Signal</th>
            </tr>
          </thead>
          <tbody>
            {filteredFrames.map((frame) => {
              const isWeak = frame.rssi < -95;
              const isPoor = frame.snr < -10;

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
                  <td className="cc-mono">{frame.frequency}</td>
                  <td className="cc-mono">DR{frame.dr}</td>
                  <td className={`cc-mono ${isWeak ? 'cc-text-warn' : ''}`}>
                    {frame.rssi} dBm
                  </td>
                  <td className={`cc-mono ${isPoor ? 'cc-text-danger' : ''}`}>
                    {frame.snr} dB
                  </td>
                  <td>
                    <span className={`cc-event-badge cc-event-badge--${frame.statusEvent.toLowerCase()}`} title={FRAME_STATUS_HELP[frame.statusEvent]}>
                      {frameStatusLabel(frame.statusEvent)}
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
