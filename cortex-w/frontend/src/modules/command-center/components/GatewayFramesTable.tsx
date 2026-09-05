import { RawFrameItem } from '../types/commandCenter.types';

interface Props {
  frames: RawFrameItem[];
  gatewayAlias: string;
  onSelectFrameMeter: (meterId: string) => void;
}

export function GatewayFramesTable({
  frames,
  gatewayAlias,
  onSelectFrameMeter,
}: Props) {
  return (
    <div className="cc-frames-view">
      <div className="cc-subfilter-bar">
        <span className="cc-subfilter-label">Latest Decoded Frames for {gatewayAlias}:</span>
        <span className="cc-subfilter-count">({frames.length} frames stream)</span>
      </div>

      <div className="cc-table-scroll-container">
        <table className="cc-telemetry-table">
          <thead>
            <tr>
              <th>Decoded At (UTC)</th>
              <th>Meter ID</th>
              <th>DevEUI</th>
              <th>FCnt</th>
              <th>FPort</th>
              <th>Freq (MHz)</th>
              <th>DR</th>
              <th>RSSI</th>
              <th>SNR</th>
              <th>Confirmed</th>
              <th>ADR</th>
              <th>Checksum</th>
              <th>Event</th>
            </tr>
          </thead>
          <tbody>
            {frames.map((frame) => {
              const isWeak = frame.rssi < -95;
              const isPoor = frame.snr < -10;

              return (
                <tr
                  key={frame.id}
                  className="cc-table-row"
                  onClick={() => onSelectFrameMeter(frame.meterId)}
                >
                  <td className="cc-mono">{frame.decodedAt}</td>
                  <td className="cc-mono cc-cell-bold">{frame.meterId}</td>
                  <td className="cc-mono cc-cell-mute">{frame.devEui}</td>
                  <td className="cc-mono">{frame.fCnt}</td>
                  <td className="cc-mono">{frame.fPort}</td>
                  <td className="cc-mono">{frame.frequency}</td>
                  <td className="cc-mono">DR{frame.dr}</td>
                  <td className={`cc-mono ${isWeak ? 'cc-text-warn' : ''}`}>
                    {frame.rssi} dBm
                  </td>
                  <td className={`cc-mono ${isPoor ? 'cc-text-danger' : ''}`}>
                    {frame.snr} dB
                  </td>
                  <td>{frame.confirmed ? 'Yes' : 'No'}</td>
                  <td>{frame.adr ? 'Yes' : 'No'}</td>
                  <td>
                    <span className="cc-tag-ok">{frame.checksumStatus}</span>
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
