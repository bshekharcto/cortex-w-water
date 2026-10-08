import { useCallback, useEffect, useRef, useState } from 'react';
import { MeterTelemetryItem } from '../types/commandCenter.types';
import { fetchFleetMeters, windowKey, type MeterStatusFilter, type WindowParams } from '@/services/api/commandCenterApi';
import { fmt, formatFrequency } from '../utils/format';
import { useNow, formatAgo } from '../utils/timeAgo';
import { useThresholds, isWeakRssi, isPoorSnr } from '../utils/thresholds';
import { useVirtualRows } from '../utils/useVirtualRows';
import { MeterFacetFilters, type MeterFacetState } from './MeterFacetFilters';
import { TableSkeleton } from './TableSkeleton';
import { describeError, isAbortError } from '../utils/errors';
import { CopyCell } from './CopyCell';

interface Props {
  win: WindowParams;
  siteId: string;
  selectedMeterId: string | null;
  onSelectMeter: (meter: MeterTelemetryItem) => void;
  /** Unique meters seen in the window per the KPI; if the stored list is shorter, say so. */
  expectedTotal?: number | null;
  /** Changes when the page refreshes; the first page is then reloaded in place. */
  refreshToken?: string;
}

const PAGE_SIZE = 100;

/**
 * Fleet-wide meter list ("Meters" mode): every meter's latest frame for the selected site and window,
 * searched / filtered / paginated on the server so it scales to the whole fleet.
 */
export function FleetMetersTable({ win, siteId, selectedMeterId, onSelectMeter, expectedTotal, refreshToken }: Props) {
  const nowMs = useNow();
  const th = useThresholds();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState<MeterStatusFilter | 'ALL'>('ALL');
  const [facets, setFacets] = useState<MeterFacetState>({ dr: '', frequency: '', confirmed: '' });
  const [facetOptions, setFacetOptions] = useState<{ dr: number[]; frequency: number[] }>({ dr: [], frequency: [] });
  const [items, setItems] = useState<MeterTelemetryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (offset: number, silent = false) => {
      const id = ++seq.current; // only the newest request may update the table
      abortRef.current?.abort(); // and the superseded one is cancelled, not left running
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const page = await fetchFleetMeters({
          win,
          siteId,
          q: debouncedQ || undefined,
          status: status === 'ALL' ? undefined : status,
          dr: facets.dr === '' ? undefined : Number(facets.dr),
          frequency: facets.frequency === '' ? undefined : Number(facets.frequency),
          confirmed: facets.confirmed === '' ? undefined : facets.confirmed === 'true',
          limit: PAGE_SIZE,
          offset,
          signal: ctrl.signal,
        });
        if (id !== seq.current) return;
        setTotal(page.total);
        if (offset === 0) setFacetOptions(page.facets);
        // Appended pages are de-duplicated: new frames can shift the ordering between two page loads
        setItems((prev) => {
          if (offset === 0) return page.items;
          const have = new Set(prev.map((m) => m.meterId));
          return [...prev, ...page.items.filter((m) => !have.has(m.meterId))];
        });
      } catch (err) {
        if (isAbortError(err)) return;
        if (id === seq.current && !silent) setError(describeError(err, 'Failed to load meters'));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [win, siteId, debouncedQ, status, facets]
  );

  // Any change to window, site, search or status starts a fresh list
  useEffect(() => {
    setItems([]);
    setTotal(0);
    load(0);
  }, [load]);

  // A page refresh brings fresh data: reload the first page in place (not when the user has paged deeper,
  // so the list never jumps under them)
  const lastToken = useRef(refreshToken);
  useEffect(() => {
    if (lastToken.current === refreshToken) return;
    lastToken.current = refreshToken;
    if (items.length <= PAGE_SIZE) load(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const v = useVirtualRows(items.length, `${windowKey(win)}|${siteId}|${debouncedQ}|${status}|${facets.dr}|${facets.frequency}|${facets.confirmed}`);

  return (
    <div className="cc-meters-view">
      <div className="cc-subfilter-bar">
        <input
          className="cc-fleet-search"
          placeholder="Search Meter ID or DevEUI…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {(['ALL', 'live', 'stale', 'silent'] as const).map((s) => (
          <button
            key={s}
            className={`cc-subfilter-chip ${status === s ? 'cc-subfilter-chip--active' : ''}`}
            onClick={() => setStatus(s)}
          >
            {s === 'ALL' ? 'All' : s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
        <MeterFacetFilters value={facets} onChange={setFacets} drOptions={facetOptions.dr} frequencyOptions={facetOptions.frequency} />
        <span className="cc-subfilter-count">
          {loading && items.length === 0
            ? '(loading…)'
            : `(${items.length.toLocaleString()} of ${total.toLocaleString()} meters)`}
        </span>
        {!loading && expectedTotal != null && status === 'ALL' && !debouncedQ && !facets.dr && !facets.frequency && !facets.confirmed && total > 0 && total < expectedTotal && (
          <span className="cc-gap-note" title="Their only frames in this window were not stored (ingestion limit), so they cannot be listed yet.">
            · {(expectedTotal - total).toLocaleString()} more seen upstream without stored frames
          </span>
        )}
      </div>

      <div className="cc-table-scroll-container cc-table-scroll-container--tall" ref={v.containerRef} onScroll={v.onScroll}>
        <table className="cc-telemetry-table cc-telemetry-table--virtual">
          <thead>
            <tr>
              <th>Meter ID</th>
              <th>DevEUI</th>
              <th>Last Gateway</th>
              <th>Frame Age</th>
              <th>Frames 1H</th>
              <th>Frames 24H</th>
              <th>Last RSSI</th>
              <th>Last SNR</th>
              <th>FCnt</th>
              <th>FPort</th>
              <th>Freq (Hz)</th>
              <th>DR</th>
              <th>Other GWs</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && loading && <TableSkeleton label="Loading meters…" />}
            {items.length === 0 && !loading && (
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
            {items.slice(v.start, v.end).map((m) => {
              const latest = m.gatewaysHeard.find((p) => p.isLatest);
              return (
                <tr
                  key={m.meterId}
                  className={`cc-table-row ${selectedMeterId === m.meterId ? 'cc-table-row--selected' : ''}`}
                  onClick={() => onSelectMeter(m)}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectMeter(m); } }}
                >
                  <td className="cc-mono cc-cell-bold"><CopyCell value={m.meterId} label="meter ID" /></td>
                  <td className="cc-mono cc-cell-mute"><CopyCell value={m.devEui} label="DevEUI" /></td>
                  <td className="cc-cell-bold">{latest?.alias ?? '—'}</td>
                  <td>{formatAgo(m.lastSeenDate, nowMs)}</td>
                  <td>{m.frames1H}</td>
                  <td>{m.frames24H}</td>
                  <td className={`cc-mono ${isWeakRssi(th, m.lastRssi) ? 'cc-text-warn' : ''}`}>{fmt(m.lastRssi, ' dBm')}</td>
                  <td className={`cc-mono ${isPoorSnr(th, m.lastSnr) ? 'cc-text-danger' : ''}`}>{fmt(m.lastSnr, ' dB')}</td>
                  <td className="cc-mono">{fmt(m.fCnt)}</td>
                  <td className="cc-mono">{fmt(m.fPort)}</td>
                  <td className="cc-mono">{formatFrequency(m.frequency)}</td>
                  <td className="cc-mono">{m.dr == null ? '—' : `DR${m.dr}`}</td>
                  <td>{m.otherGatewaysCount > 0 ? <span className="cc-pill-multi">+{m.otherGatewaysCount} GWs</span> : '—'}</td>
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

      {items.length < total && (
        <button className="cw-button-secondary cc-load-more" disabled={loading} onClick={() => load(items.length)}>
          {loading ? 'Loading…' : `Load more (${(total - items.length).toLocaleString()} remaining)`}
        </button>
      )}
    </div>
  );
}
