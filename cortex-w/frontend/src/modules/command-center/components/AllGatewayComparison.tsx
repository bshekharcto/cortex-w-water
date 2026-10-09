import { GatewayItem } from '../types/commandCenter.types';

interface Props {
  gateways: GatewayItem[];
  onSelectGateway: (id: string) => void;
}

export function AllGatewayComparison({ gateways, onSelectGateway }: Props) {
  const activeGateways = gateways.filter((g) => g.uniqueMeters > 0);
  const maxMeters = activeGateways[0]?.uniqueMeters || 1;

  return (
    <div className="cc-all-gw-view">
      <div className="cc-card cc-chart-card">
        <div className="cc-card-header">
          <span className="cc-card-title">GATEWAY LOAD DISTRIBUTION</span>
          <span className="cc-card-meta">Unique Meters Heard by Gateway (24H)</span>
        </div>
        <div className="cc-bars-container">
          {activeGateways.map((gw) => {
            const pct = Math.round((gw.uniqueMeters / maxMeters) * 100);
            return (
              <div
                key={gw.gatewayId}
                className="cc-bar-row cc-clickable-row"
                onClick={() => onSelectGateway(gw.gatewayId)}
                title={`Click to inspect ${gw.alias}`}
              >
                <span className="cc-bar-label">
                  <strong>{gw.alias}</strong> ({gw.gatewayId.slice(0, 6)}...{gw.gatewayId.slice(-4)})
                </span>
                <div className="cc-bar-track">
                  <div className="cc-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="cc-bar-val">{gw.uniqueMeters}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="cc-card cc-table-card">
        <div className="cc-card-header">
          <span className="cc-card-title">ALL-GATEWAY COMPARISON MATRIX</span>
          <span className="cc-card-meta">{gateways.length} Gateways in Inventory</span>
        </div>
        <div className="cc-table-scroll-container">
          <table className="cc-telemetry-table">
            <thead>
              <tr>
                <th>Gateway Alias</th>
                <th>Gateway ID</th>
                <th>Status</th>
                <th>Unique Meters</th>
                <th>Frames (24H)</th>
                <th>Last Frame</th>
                <th>Avg RSSI</th>
                <th>Avg SNR</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {gateways.map((gw) => (
                <tr
                  key={gw.gatewayId}
                  className="cc-table-row"
                  onClick={() => onSelectGateway(gw.gatewayId)}
                >
                  <td className="cc-cell-bold">{gw.alias}</td>
                  <td className="cc-mono cc-cell-mute">{gw.gatewayId}</td>
                  <td>
                    <span className={`cc-status-pill cc-status-pill--${gw.status}`}>
                      {gw.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="cc-mono cc-cell-bold">{gw.uniqueMeters}</td>
                  <td className="cc-mono">{gw.frameCount}</td>
                  <td>{gw.lastFrameText}</td>
                  <td className="cc-mono">
                    {gw.avgRssi ? `${gw.avgRssi} dBm` : '—'}
                  </td>
                  <td className="cc-mono">
                    {gw.avgSnr ? `${gw.avgSnr} dB` : '—'}
                  </td>
                  <td>
                    <span
                      className={
                        gw.status === 'degraded'
                          ? 'cc-text-warn'
                          : gw.status === 'reporting'
                          ? 'cc-text-success'
                          : 'cc-cell-mute'
                      }
                    >
                      {gw.trendText}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
