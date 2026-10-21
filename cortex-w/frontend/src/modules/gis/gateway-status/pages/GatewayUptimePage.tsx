import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Download, RefreshCw, Search, TableProperties } from 'lucide-react';
import clsx from 'clsx';
import { gatewayStatusApi, type GatewayRange, type GatewayState } from '@/services/api/gatewayStatusApi';
import { useTakeOverHeaderLastUpdated } from '@/components/layout/HeaderStatus';
import { useGatewayLoad } from '../useGatewayLoad';
import { STATE_LABEL, fmtDateTime, fmtDay, todayIn } from '../gatewayStatusModel';
import { RangeControls, type RangeChoice } from '../components/RangeControls';
import {
  BUCKETS,
  THRESHOLD_CHOICES,
  UPTIME_PRESETS,
  avgText,
  bucketOf,
  buildUptime,
  cellText,
  colorOf,
  datesBetween,
  dayHeading,
  filterRows,
  fmtMinutes,
  fmtPct,
  sortRows,
  uptimePresetRange,
  uptimeRangeFromParams,
  uptimeRangeToParams,
  type Unit,
  type UptimeCell,
  type UptimeSort,
  type UptimeSortDir,
} from '../uptimeModel';
import { chartNotes, exportBaseName, uptimeCsv, uptimeWorkbook, type ExportMeta } from '../uptimeExport';
import { XLSX_MIME, downloadFile } from '../xlsx';
import '../gatewayStatus.css';

const REFRESH_MS = 60_000;

const CHIPS: Array<{ state: GatewayState; countKey: 'online' | 'offline' | 'noData' }> = [
  { state: 'online', countKey: 'online' },
  { state: 'offline', countKey: 'offline' },
  { state: 'no-data', countKey: 'noData' },
];

/** What hovering a cell says: the day, the hours online and the percentage, and what a * means. */
function cellTitle(c: UptimeCell): string {
  if (c.kind === 'nodata') return `${fmtDay(c.date)}: no data recorded`;
  const base = `${fmtDay(c.date)}: online ${fmtMinutes(c.minutes)} (${fmtPct(c.percent ?? 0)}%)`;
  return c.kind === 'partial' ? `${base}. Watched for only part of this day (it started, or the day is not over): the percentage is of the time watched.` : `${base} of 24:00`;
}

/** GIS > Gateway Status > Uptime chart: every gateway's online time for every day, in hours or in percent. */
export function GatewayUptimePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const paramText = params.toString();
  const timeZone = 'Asia/Kolkata';
  const today = todayIn(timeZone);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = useMemo(() => uptimeRangeFromParams(params, today), [paramText, today]);
  const unit: Unit = params.get('unit') === 'percent' ? 'percent' : 'hours';
  const dates = useMemo(() => datesBetween(range.startDate, range.endDate), [range]);

  const [state, setState] = useState<GatewayState | 'all'>('all');
  const [search, setSearch] = useState('');
  const [below, setBelow] = useState<number | null>(null);
  const [sort, setSort] = useState<{ key: UptimeSort; dir: UptimeSortDir }>({ key: 'average', dir: 'desc' });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { data, loading, error, refreshing, reload } = useGatewayLoad(
    `uptime|${range.startDate}|${range.endDate}`,
    (signal) => gatewayStatusApi.report(range, signal),
    REFRESH_MS
  );

  // This page reads the gateway health service live, so the header shows when this data was loaded (see GatewayStatusPage).
  useTakeOverHeaderLastUpdated(
    data ? fmtDateTime(data.generatedAt) : null,
    'When this gateway data was last loaded. It comes live from the gateway health service, with no delay.'
  );

  const allRows = useMemo(() => (data ? buildUptime(data, dates, today) : []), [data, dates, today]);
  const rows = useMemo(
    () => sortRows(filterRows(allRows, { state, search, belowPercent: below }), sort.key, sort.dir),
    [allRows, state, search, below, sort]
  );

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const presets: RangeChoice[] = UPTIME_PRESETS.map((p) => ({ key: p.key, range: uptimePresetRange(p.key, today, timeZone) }));
  const update = (next: Record<string, string>) => setParams(next, { replace: false });
  const changeRange = (r: GatewayRange) => update({ ...uptimeRangeToParams(r, today), ...(unit === 'percent' ? { unit: 'percent' } : {}) });
  const changeUnit = (u: Unit) => {
    const next = new URLSearchParams(params);
    if (u === 'percent') next.set('unit', 'percent');
    else next.delete('unit');
    setParams(next, { replace: true });
  };
  const toggleSort = (key: UptimeSort) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'average' ? 'desc' : 'asc' }));

  const meta: ExportMeta | null = data
    ? { range, dates, generatedAt: fmtDateTime(data.generatedAt), filtered: { shown: rows.length, total: allRows.length } }
    : null;
  const download = (kind: 'xlsx' | 'csv') => {
    if (!meta) return;
    setMenuOpen(false);
    if (kind === 'xlsx') downloadFile(`${exportBaseName('both', range)}.xlsx`, uptimeWorkbook(rows, meta), XLSX_MIME);
    else downloadFile(`${exportBaseName(unit, range)}.csv`, uptimeCsv(rows, unit, meta), 'text/csv;charset=utf-8');
  };

  const sortIcon = (key: UptimeSort) => (sort.key === key ? sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : null);
  const ariaSort = (key: UptimeSort) => (sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');

  return (
    <div className="gs-page">
      <div className="gs-toolbar">
        <div className="gs-toolbar-left">
          <button className="cw-icon-btn gs-back" onClick={() => navigate('/app/gis/gateway-status')} aria-label="Back to Gateway Status" title="Back to Gateway Status">
            <ArrowLeft size={16} />
          </button>
          <div className="gs-title"><TableProperties size={16} className="gs-title-icon" /> Gateway Uptime</div>
          <div className="gs-unit" role="group" aria-label="Unit">
            {(['hours', 'percent'] as const).map((u) => (
              <button key={u} className={clsx('gs-unit-btn', unit === u && 'gs-unit-btn--active')} aria-pressed={unit === u} onClick={() => changeUnit(u)}>
                {u === 'hours' ? 'Hours' : 'Percent'}
              </button>
            ))}
          </div>
        </div>
        <div className="gs-toolbar-right">
          <div className="gs-menu" ref={menuRef}>
            <button className="cw-button-secondary gs-download" onClick={() => setMenuOpen((o) => !o)} disabled={!data || rows.length === 0} aria-haspopup="menu" aria-expanded={menuOpen}>
              <Download size={14} /> Download <ChevronDown size={13} />
            </button>
            {menuOpen && (
              <div className="gs-menu-pop" role="menu">
                <button role="menuitem" onClick={() => download('xlsx')}>
                  <strong>Excel (.xlsx)</strong>
                  <span>Hours and percent, with the colours</span>
                </button>
                <button role="menuitem" onClick={() => download('csv')}>
                  <strong>CSV</strong>
                  <span>The table as shown ({unit === 'hours' ? 'hours' : 'percent'})</span>
                </button>
              </div>
            )}
          </div>
          <button className="cw-button-secondary gs-refresh" onClick={reload} disabled={refreshing} title="Refresh now" aria-label="Refresh">
            <RefreshCw size={14} className={refreshing ? 'cw-spin' : ''} />
          </button>
          <RangeControls range={range} onChange={changeRange} presets={presets} />
        </div>
      </div>

      <div className="gs-toolbar gs-toolbar--filters">
        <div className="gs-toolbar-left">
          <div className="gs-chips">
            {CHIPS.map((c) => (
              <button
                key={c.state}
                className={clsx('gs-chip', `gs-chip--${c.state}`, state === c.state && 'gs-chip--active')}
                onClick={() => setState(state === c.state ? 'all' : c.state)}
                aria-pressed={state === c.state}
                title={state === c.state ? 'Show all gateways' : `Show only gateways that are now ${STATE_LABEL[c.state].toLowerCase()}`}
              >
                <span className="gs-dot" />
                {STATE_LABEL[c.state]}: {data ? data.counts[c.countKey] : '–'}
              </button>
            ))}
          </div>
          <div className="gs-search">
            <Search size={14} className="gs-search-icon" />
            <input type="search" placeholder="Search gateway ID or address…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search gateways" />
          </div>
          <label className="gs-filter">
            <span>Average below</span>
            <select value={below ?? ''} onChange={(e) => setBelow(e.target.value === '' ? null : Number(e.target.value))}>
              <option value="">Any</option>
              {THRESHOLD_CHOICES.map((t) => (
                <option key={t} value={t}>{t}%</option>
              ))}
            </select>
          </label>
        </div>
        <div className="gs-count" aria-live="polite">
          {data ? `${rows.length} of ${allRows.length} gateways · ${fmtDay(range.startDate)} – ${fmtDay(range.endDate)} (${dates.length} ${dates.length === 1 ? 'day' : 'days'})` : ''}
        </div>
      </div>

      {error && (
        <div className="gs-banner gs-banner--error" role="alert">
          {error} {data ? 'Showing the last data received.' : ''}
        </div>
      )}

      <div className="gs-body">
        {loading && !data ? (
          <div className="gs-loading" role="status"><div className="cw-spinner" /> Loading gateways…</div>
        ) : data ? (
          <div className="cw-surface gs-up-card">
            <div className="gs-up-scroll">
              <table className="gs-up-table">
                <thead>
                  <tr>
                    <th className="gs-up-sticky gs-up-id" aria-sort={ariaSort('gatewayId')}>
                      <button className="gs-th-btn gs-th-btn--left" onClick={() => toggleSort('gatewayId')}>Gateway ID {sortIcon('gatewayId')}</button>
                    </th>
                    <th className="gs-up-sticky gs-up-addr" aria-sort={ariaSort('address')}>
                      <button className="gs-th-btn gs-th-btn--left" onClick={() => toggleSort('address')}>Address {sortIcon('address')}</button>
                    </th>
                    {dates.map((d) => (
                      <th key={d} className="gs-up-day" title={fmtDay(d)}>{dayHeading(d)}</th>
                    ))}
                    <th className="gs-up-avg" aria-sort={ariaSort('average')}>
                      <button className="gs-th-btn" onClick={() => toggleSort('average')} title="Average over the days that have data">
                        {unit === 'hours' ? 'Avg per day' : `${dates.length}-day avg`} {sortIcon('average')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.gatewayId}>
                      <td className="gs-up-sticky gs-up-id gs-mono">{r.gatewayId}</td>
                      <td className="gs-up-sticky gs-up-addr" title={r.address ?? undefined}>{r.address ?? '—'}</td>
                      {r.cells.map((c) => (
                        <td key={c.date} className={clsx('gs-up-cell', c.kind === 'nodata' && 'gs-up-cell--none')} style={{ background: colorOf(bucketOf(c.percent)) }} title={cellTitle(c)}>
                          {cellText(c, unit)}
                        </td>
                      ))}
                      <td className="gs-up-avg gs-up-avgcell">{avgText(r, unit)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={dates.length + 3} className="gs-empty">No gateways match.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="gs-up-legend" aria-label="Colour legend">
              {BUCKETS.map((b) => (
                <span key={b.key} className="gs-up-legend-item"><span className="gs-up-swatch" style={{ background: b.color }} />{b.label}</span>
              ))}
            </div>
            <div className="gs-up-notes">
              {chartNotes(unit).map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
