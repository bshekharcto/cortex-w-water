import { useState, useMemo } from 'react';
import { MeterTelemetryItem } from '../types/commandCenter.types';

interface Props {
  meters: MeterTelemetryItem[];
  selectedMeterId: string | null;
  onSelectMeter: (meter: MeterTelemetryItem) => void;
}

export function GatewayMetersTable({
  meters,
  selectedMeterId,
  onSelectMeter,
}: Props) {
  const [filter, setFilter] = useState<string>('ALL');

  const filteredMeters = useMemo(() => {
    if (filter === 'ALL') return meters;
    if (filter === 'LIVE') return meters.filter((m) => m.statusChips.includes('live'));
    if (filter === 'STALE') return meters.filter((m) => m.statusChips.includes('stale'));
    if (filter === 'SILENT') return meters.filter((m) => m.statusChips.includes('silent'));
    if (filter === 'WEAK_RSSI') return meters.filter((m) => m.statusChips.includes('weak-rssi'));
    if (filter === 'POOR_SNR') return meters.filter((m) => m.statusChips.includes('poor-snr'));
    if (filter === 'MULTI_GW') return meters.filter((m) => m.statusChips.includes('multi-gw'));
    if (filter === 'FCNT_GAP') return meters.filter((m) => m.statusChips.includes('fcnt-gap'));
    return meters;
  }, [meters, filter]);

  return (
    <div className="cc-meters-view">
      <div className="cc-subfilter-bar">
        <span className="cc-subfilter-label">Filter Meters:</span>
        {[
          { key: 'ALL', label: 'All' },
          { key: 'LIVE', label: 'Live' },
          { key: 'STALE', label: 'Stale' },
          { key: 'WEAK_RSSI', label: 'Weak RSSI' },
          { key: 'POOR_SNR', label: 'Poor SNR' },
          { key: 'MULTI_GW', label: 'Multi-Gateway' },
          { key: 'FCNT_GAP', label: 'FCnt Gap' },
        ].map((f) => (
          <button
            key={f.key}
            className={`cc-subfilter-chip ${filter === f.key ? 'cc-subfilter-chip--active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <span className="cc-subfilter-count">({filteredMeters.length} meters)</span>
      </div>

      <div className="cc-table-scroll-container">
        <table className="cc-telemetry-table">
          <thead>
            <tr>
              <th>Meter ID</th>
              <th>DevEUI</th>
              <th>Frame Age</th>
              <th>Frames 24H</th>
              <th>Last RSSI</th>
              <th>Last SNR</th>
              <th>FCnt</th>
              <th>FPort</th>
              <th>Freq (MHz)</th>
              <th>DR</th>
              <th>ADR</th>
              <th>Conf.</th>
              <th>Other GWs</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredMeters.map((m) => {
              const isSelected = selectedMeterId === m.meterId;
              const isWeak = m.lastRssi < -95;
              const isPoorSnr = m.lastSnr < -10;

              return (
                <tr
                  key={m.meterId}
                  className={`cc-table-row ${isSelected ? 'cc-table-row--selected' : ''}`}
                  onClick={() => onSelectMeter(m)}
                >
                  <td className="cc-mono cc-cell-bold">{m.meterId}</td>
                  <td className="cc-mono cc-cell-mute">{m.devEui}</td>
                  <td>{m.frameAge}</td>
                  <td>{m.frames24H}</td>
                  <td className={`cc-mono ${isWeak ? 'cc-text-warn' : ''}`}>
                    {m.lastRssi} dBm
                  </td>
                  <td className={`cc-mono ${isPoorSnr ? 'cc-text-danger' : ''}`}>
                    {m.lastSnr} dB
                  </td>
                  <td className="cc-mono">{m.fCnt}</td>
                  <td className="cc-mono">{m.fPort}</td>
                  <td className="cc-mono">{m.frequency}</td>
                  <td className="cc-mono">DR{m.dr}</td>
                  <td>{m.adr ? 'Yes' : 'No'}</td>
                  <td>{m.confirmed ? 'Yes' : 'No'}</td>
                  <td>
                    {m.otherGatewaysCount > 0 ? (
                      <span className="cc-pill-multi">+{m.otherGatewaysCount} GWs</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div className="cc-chip-stack">
                      {m.statusChips.map((chip) => (
                        <span key={chip} className={`cc-chip cc-chip--${chip}`}>
                          {chip.toUpperCase()}
                        </span>
                      ))}
                    </div>
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
