import { useState, useMemo } from 'react';
import { MeterTelemetryItem } from '../types/commandCenter.types';
import { fmt } from '../utils/format';
import { useNow, formatAgo } from '../utils/timeAgo';
import { useThresholds, isWeakRssi, isPoorSnr } from '../utils/thresholds';

interface Props {
  meters: MeterTelemetryItem[];
  loading?: boolean;
  error?: string | null;
  selectedMeterId: string | null;
  onSelectMeter: (meter: MeterTelemetryItem) => void;
}

export function GatewayMetersTable({
  meters,
  loading,
  error,
  selectedMeterId,
  onSelectMeter,
}: Props) {
  const th = useThresholds();
  const nowMs = useNow();
  const [filter, setFilter] = useState<string>('ALL');

  const filteredMeters = useMemo(() => {
    if (filter === 'ALL') return meters;
    if (filter === 'LIVE') return meters.filter((m) => m.statusChips.includes('live'));
    if (filter === 'STALE') return meters.filter((m) => m.statusChips.includes('stale'));
    if (filter === 'SILENT') return meters.filter((m) => m.statusChips.includes('silent'));
    if (filter === 'WEAK_RSSI') return meters.filter((m) => m.diagnostics.includes('weak-rssi'));
    if (filter === 'POOR_SNR') return meters.filter((m) => m.diagnostics.includes('poor-snr'));
    if (filter === 'MULTI_GW') return meters.filter((m) => m.diagnostics.includes('multi-gw'));
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
          { key: 'SILENT', label: 'Silent' },
          { key: 'WEAK_RSSI', label: 'Weak RSSI' },
          { key: 'POOR_SNR', label: 'Poor SNR' },
          { key: 'MULTI_GW', label: 'Multi-Gateway' },
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
            {filteredMeters.length === 0 && (
              <tr>
                <td colSpan={99} style={{ padding: 24, textAlign: 'center', opacity: 0.7 }}>
                  {loading ? 'Loading meters…' : error ? `Could not load meters (${error}).` : 'No meters match.'}
                </td>
              </tr>
            )}
            {filteredMeters.map((m) => {
              const isSelected = selectedMeterId === m.meterId;
              const isWeak = isWeakRssi(th, m.lastRssi);
              const poorSnr = isPoorSnr(th, m.lastSnr);

              return (
                <tr
                  key={m.meterId}
                  className={`cc-table-row ${isSelected ? 'cc-table-row--selected' : ''}`}
                  onClick={() => onSelectMeter(m)}
                >
                  <td className="cc-mono cc-cell-bold">{m.meterId}</td>
                  <td className="cc-mono cc-cell-mute">{fmt(m.devEui)}</td>
                  <td>{formatAgo(m.lastSeenDate, nowMs)}</td>
                  <td>{m.frames24H}</td>
                  <td className={`cc-mono ${isWeak ? 'cc-text-warn' : ''}`}>
                    {fmt(m.lastRssi, ' dBm')}
                  </td>
                  <td className={`cc-mono ${poorSnr ? 'cc-text-danger' : ''}`}>
                    {fmt(m.lastSnr, ' dB')}
                  </td>
                  <td className="cc-mono">{fmt(m.fCnt)}</td>
                  <td className="cc-mono">{fmt(m.fPort)}</td>
                  <td className="cc-mono">{fmt(m.frequency)}</td>
                  <td className="cc-mono">{m.dr == null ? '—' : `DR${m.dr}`}</td>
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
