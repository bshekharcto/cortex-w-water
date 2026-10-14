import { MeterTelemetryItem } from '../types/commandCenter.types';
import type { MeterFilterKey } from '@/services/api/commandCenterApi';
import { TableSkeleton } from './TableSkeleton';

interface Props {
  meters: MeterTelemetryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  /** Why the list could not be loaded (shown with a Retry instead of an empty table). */
  error?: string | null;
  onRetry?: () => void;
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
  error,
  onRetry,
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
          { key: 'CONNECTED', label: 'Connected' },
          { key: 'DISCONNECTED', label: 'Disconnected' },
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
          {loading ? '(loading…)' : error ? '(could not load)' : `(${total.toLocaleString()} meters)`}
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
            {loading && meters.length === 0 && <TableSkeleton rows={8} label="Loading meters" />}
            {!loading && error && (
              <tr>
                <td colSpan={14} className="cc-card-alert" role="alert">
                  {error}{' '}
                  {onRetry && (
                    <button className="cc-subfilter-chip" onClick={onRetry}>
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            )}
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
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
        >
          ‹ Prev
        </button>
        <span className="cc-subfilter-count">
          {total === 0
            ? 'No meters'
            : `${firstRow.toLocaleString()}–${lastRow.toLocaleString()} of ${total.toLocaleString()} · page ${
                page + 1
              } of ${Math.max(totalPages, 1)}`}
        </span>
        <button
          className="cc-subfilter-chip"
          disabled={page + 1 >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
