import { MeterTelemetryItem } from '../types/commandCenter.types';
import type { MeterFilterKey } from '@/services/api/commandCenterApi';

interface Props {
  meters: MeterTelemetryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  filter: MeterFilterKey;
  onFilterChange: (filter: MeterFilterKey) => void;
  onPageChange: (page: number) => void;
  selectedMeterId: string | null;
  onSelectMeter: (meter: MeterTelemetryItem) => void;
}

export function GatewayMetersTable({
  meters,
  total,
  page,
  pageSize,
  totalPages,
  loading,
  filter,
  onFilterChange,
  onPageChange,
  selectedMeterId,
  onSelectMeter,
}: Props) {
  const firstRow = total === 0 ? 0 : page * pageSize + 1;
  const lastRow = page * pageSize + meters.length;

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
        ].map((f) => (
          <button
            key={f.key}
            className={`cc-subfilter-chip ${filter === f.key ? 'cc-subfilter-chip--active' : ''}`}
            onClick={() => onFilterChange(f.key as MeterFilterKey)}
          >
            {f.label}
          </button>
        ))}
        <span className="cc-subfilter-count">
          {loading ? '(loading…)' : `(${total.toLocaleString()} meters)`}
        </span>
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
            {meters.map((m) => {
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

      <div className="cc-subfilter-bar">
        <button
          className="cc-subfilter-chip"
          disabled={page <= 0 || loading}
          onClick={() => onPageChange(page - 1)}
        >
          ‹ Prev
        </button>
        <span className="cc-subfilter-count">
          {total === 0
            ? 'No meters'
            : `${firstRow.toLocaleString()}–${lastRow.toLocaleString()} of ${total.toLocaleString()} · page ${
                page + 1
              } of ${totalPages}`}
        </span>
        <button
          className="cc-subfilter-chip"
          disabled={page + 1 >= totalPages || loading}
          onClick={() => onPageChange(page + 1)}
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
