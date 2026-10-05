import { useCallback, useEffect, useRef, useState } from 'react';
import { MeterTelemetryItem } from '../types/commandCenter.types';
import { fetchFleetMeters, windowKey, type MeterStatusFilter, type WindowParams } from '@/services/api/commandCenterApi';
import { fmt, formatFrequency } from '../utils/format';
import { useNow, formatAgo } from '../utils/timeAgo';
import { useThresholds, isWeakRssi, isPoorSnr } from '../utils/thresholds';
import { useVirtualRows } from '../utils/useVirtualRows';

interface Props {
  win: WindowParams;
  siteId: string;
  selectedMeterId: string | null;
  onSelectMeter: (meter: MeterTelemetryItem) => void;
}

const PAGE_SIZE = 100;

/**
 * Fleet-wide meter list ("Meters" mode): every meter's latest frame for the selected site and window,
 * searched / filtered / paginated on the server so it scales to the whole fleet.
 */
export function FleetMetersTable({ win, siteId, selectedMeterId, onSelectMeter }: Props) {
  const nowMs = useNow();
  const th = useThresholds();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState<MeterStatusFilter | 'ALL'>('ALL');
  const [items, setItems] = useState<MeterTelemetryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (offset: number) => {
      const id = ++seq.current; // only the newest request may update the table
      setLoading(true);
      setError(null);
      try {
        const page = await fetchFleetMeters({
          win,
          siteId,
          q: debouncedQ || undefined,
          status: status === 'ALL' ? undefined : status,
          limit: PAGE_SIZE,
          offset,
        });
        if (id !== seq.current) return;
        setTotal(page.total);
        setItems((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
      } catch (err) {
        if (id === seq.current) setError(err instanceof Error ? err.message : 'Failed to load meters');
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [win, siteId, debouncedQ, status]
  );

  // Any change to window, site, search or status starts a fresh list
  useEffect(() => {
    setItems([]);
    setTotal(0);
    load(0);
  }, [load]);

  const v = useVirtualRows(items.length, `${windowKey(win)}|${siteId}|${debouncedQ}|${status}`);

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
        <span className="cc-subfilter-count">
          ({items.length.toLocaleString()} of {total.toLocaleString()} meters)
        </span>
      </div>

      <div className="cc-table-scroll-container cc-table-scroll-container--tall" ref={v.containerRef} onScroll={v.onScroll}>
        <table className="cc-telemetry-table cc-telemetry-table--virtual">
          <thead>
            <tr>
              <th>Meter ID</th>
              <th>DevEUI</th>
              <th>Last Gateway</th>
              <th>Frame Age</th>
              <th>Last RSSI</th>
              <th>Last SNR</th>
              <th>FCnt</th>
              <th>FPort</th>
              <th>Freq (MHz)</th>
              <th>DR</th>
              <th>Other GWs</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={99} style={{ padding: 24, textAlign: 'center', opacity: 0.7 }}>
                  {loading ? 'Loading meters…' : error ? `Could not load meters (${error}).` : 'No meters match.'}
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
                >
                  <td className="cc-mono cc-cell-bold">{m.meterId}</td>
                  <td className="cc-mono cc-cell-mute">{fmt(m.devEui)}</td>
                  <td className="cc-cell-bold">{latest?.alias ?? '—'}</td>
                  <td>{formatAgo(m.lastSeenDate, nowMs)}</td>
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
