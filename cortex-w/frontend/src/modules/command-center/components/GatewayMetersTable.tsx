import { useState, useMemo } from 'react';
import { MeterTelemetryItem } from '../types/commandCenter.types';
import { fmt, formatFrequency, yesNo } from '../utils/format';
import { useNow, formatAgo } from '../utils/timeAgo';
import { useThresholds, isWeakRssi, isPoorSnr } from '../utils/thresholds';
import { useVirtualRows } from '../utils/useVirtualRows';
import { MeterFacetFilters, type MeterFacetState } from './MeterFacetFilters';
import { TableSkeleton } from './TableSkeleton';
import { CopyCell } from './CopyCell';

interface Props {
  meters: MeterTelemetryItem[];
  loading?: boolean;
  error?: string | null;
  selectedMeterId: string | null;
  onSelectMeter: (meter: MeterTelemetryItem) => void;
  /** Meters upstream says this gateway heard; if more than the stored packets cover, say so. */
  expectedMeters?: number;
}

export function GatewayMetersTable({
  meters,
  loading,
  error,
  selectedMeterId,
  onSelectMeter,
  expectedMeters,
}: Props) {
  const th = useThresholds();
  const nowMs = useNow();
  const [filter, setFilter] = useState<string>('ALL');
  const [facets, setFacets] = useState<MeterFacetState>({ dr: '', frequency: '', confirmed: '' });

  // Options come from the meters actually on this gateway
  const drOptions = useMemo(() => [...new Set(meters.map((m) => m.dr).filter((d): d is number => d != null))].sort((a, b) => a - b), [meters]);
  const frequencyOptions = useMemo(() => [...new Set(meters.map((m) => m.frequency).filter((f): f is number => f != null))].sort((a, b) => a - b), [meters]);

  const statusFiltered = useMemo(() => {
    if (filter === 'ALL') return meters;
    if (filter === 'LIVE') return meters.filter((m) => m.statusChips.includes('live'));
    if (filter === 'STALE') return meters.filter((m) => m.statusChips.includes('stale'));
    if (filter === 'SILENT') return meters.filter((m) => m.statusChips.includes('silent'));
    if (filter === 'WEAK_RSSI') return meters.filter((m) => m.diagnostics.includes('weak-rssi'));
    if (filter === 'POOR_SNR') return meters.filter((m) => m.diagnostics.includes('poor-snr'));
    if (filter === 'MULTI_GW') return meters.filter((m) => m.diagnostics.includes('multi-gw'));
    return meters;
  }, [meters, filter]);

  const filteredMeters = useMemo(
    () =>
      statusFiltered.filter(
        (m) =>
          (facets.dr === '' || m.dr === Number(facets.dr)) &&
          (facets.frequency === '' || m.frequency === Number(facets.frequency)) &&
          (facets.confirmed === '' || m.confirmed === (facets.confirmed === 'true'))
      ),
    [statusFiltered, facets]
  );

  // Only the visible slice of rows is rendered (the busiest gateway has ~1,700 meters)
  const v = useVirtualRows(filteredMeters.length, `${filter}|${facets.dr}|${facets.frequency}|${facets.confirmed}|${meters[0]?.meterId ?? ''}|${meters.length}`);

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
        <MeterFacetFilters value={facets} onChange={setFacets} drOptions={drOptions} frequencyOptions={frequencyOptions} />
        <span className="cc-subfilter-count">{loading && meters.length === 0 ? '(loading…)' : `(${filteredMeters.length} meters)`}</span>
        {!loading && expectedMeters != null && meters.length > 0 && meters.length < expectedMeters && (
          <span className="cc-gap-note" title="Their only frames in this window were not stored (ingestion limit), so they cannot be listed yet.">
            · {(expectedMeters - meters.length).toLocaleString()} more seen upstream without stored frames
          </span>
        )}
      </div>

      <div className="cc-table-scroll-container cc-table-scroll-container--tall" ref={v.containerRef} onScroll={v.onScroll}>
        <table className="cc-telemetry-table cc-telemetry-table--virtual">
          <thead>
            <tr>
              <th>Meter ID</th>
              <th>DevEUI</th>
              <th>Frame Age</th>
              <th>Frames 1H</th>
              <th>Frames 24H</th>
              <th>Last RSSI</th>
              <th>Last SNR</th>
              <th>FCnt</th>
              <th>FPort</th>
              <th>Freq (Hz)</th>
              <th>DR</th>
              <th>ADR</th>
              <th>Conf.</th>
              <th>Other GWs</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredMeters.length === 0 && loading && <TableSkeleton label="Loading meters…" />}
            {filteredMeters.length === 0 && !loading && (
              <tr>
                <td colSpan={99} className="cc-table-empty">
                  {error ? `Could not load meters (${error}).` : 'No meters match.'}
                </td>
              </tr>
            )}
            {v.padTop > 0 && (
              <tr aria-hidden="true">
                <td colSpan={99} style={{ height: v.padTop, padding: 0, border: 0 }} />
              </tr>
            )}
            {filteredMeters.slice(v.start, v.end).map((m) => {
              const isSelected = selectedMeterId === m.meterId;
              const isWeak = isWeakRssi(th, m.lastRssi);
              const poorSnr = isPoorSnr(th, m.lastSnr);

              return (
                <tr
                  key={m.meterId}
                  className={`cc-table-row ${isSelected ? 'cc-table-row--selected' : ''}`}
                  onClick={() => onSelectMeter(m)}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectMeter(m); } }}
                >
                  <td className="cc-mono cc-cell-bold"><CopyCell value={m.meterId} label="meter ID" /></td>
                  <td className="cc-mono cc-cell-mute"><CopyCell value={m.devEui} label="DevEUI" /></td>
                  <td>{formatAgo(m.lastSeenDate, nowMs)}</td>
                  <td>{m.frames1H}</td>
                  <td>{m.frames24H}</td>
                  <td className={`cc-mono ${isWeak ? 'cc-text-warn' : ''}`}>
                    {fmt(m.lastRssi, ' dBm')}
                  </td>
                  <td className={`cc-mono ${poorSnr ? 'cc-text-danger' : ''}`}>
                    {fmt(m.lastSnr, ' dB')}
                  </td>
                  <td className="cc-mono">{fmt(m.fCnt)}</td>
                  <td className="cc-mono">{fmt(m.fPort)}</td>
                  <td className="cc-mono">{formatFrequency(m.frequency)}</td>
                  <td className="cc-mono">{m.dr == null ? '—' : `DR${m.dr}`}</td>
                  <td>{yesNo(m.adr)}</td>
                  <td>{yesNo(m.confirmed)}</td>
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
            {v.padBottom > 0 && (
              <tr aria-hidden="true">
                <td colSpan={99} style={{ height: v.padBottom, padding: 0, border: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
