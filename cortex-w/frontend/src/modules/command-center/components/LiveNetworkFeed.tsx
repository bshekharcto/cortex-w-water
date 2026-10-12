import { Radio } from 'lucide-react';
import { RawFrameItem } from '../types/commandCenter.types';
import { isPoorSnr, isWeakRssi, useThresholds } from '../utils/thresholds';

interface Props {
  frames: RawFrameItem[];
  metersReporting: number; // the meters that sent a frame in the chosen window
  onSelectMeter: (meterId: string) => void;
}

export function LiveNetworkFeed({ frames, metersReporting, onSelectMeter }: Props) {
  const thresholds = useThresholds();
  return (
    <div className="cc-live-feed-panel">
      <div className="cc-feed-header-bar">
        <div className="cc-feed-title-wrap">
          <Radio size={14} className="cc-live-pulse-icon" />
          <span className="cc-feed-title">LIVE NETWORK TELEMETRY FEED</span>
          <span className="cc-feed-status-tag">{metersReporting.toLocaleString()} meters reporting</span>
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
            </tr>
          </thead>
          <tbody>
            {frames.map((frame) => {
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
