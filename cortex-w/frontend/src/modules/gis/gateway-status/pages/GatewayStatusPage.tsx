import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RadioTower, RefreshCw, Search } from 'lucide-react';
import clsx from 'clsx';
import { gatewayStatusApi, type GatewayConnectivity, type GatewayRange, type GatewayState } from '@/services/api/gatewayStatusApi';
import { useTakeOverHeaderLastUpdated } from '@/components/layout/HeaderStatus';
import { useGatewayLoad } from '../useGatewayLoad';
import { filterGateways, fmtDateTime, presetOf, rangeFromParams, rangeToParams, todayIn } from '../gatewayStatusModel';
import { GatewayStatusTable } from '../components/GatewayStatusTable';
import { GatewayMapDialog } from '../components/GatewayMapDialog';
import { RangeControls } from '../components/RangeControls';
import '../gatewayStatus.css';

const REFRESH_MS = 60_000;

const CHIPS: Array<{ state: GatewayState; label: string; countKey: 'online' | 'offline' | 'noData' }> = [
  { state: 'online', label: 'Online', countKey: 'online' },
  { state: 'offline', label: 'Offline', countKey: 'offline' },
  { state: 'no-data', label: 'No data', countKey: 'noData' },
];

/** GIS > Gateway Status: how reliably every gateway has been connected over the chosen days. */
export function GatewayStatusPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const paramText = params.toString();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = useMemo(() => rangeFromParams(params), [paramText]);
  const [state, setState] = useState<GatewayState | 'all'>('all');
  const [search, setSearch] = useState('');
  const [mapFor, setMapFor] = useState<GatewayConnectivity | null>(null);

  // 1D / 3D / 7D / 14D are all fetched together the moment the page opens (one upstream call), so switching between
  // them is instant; only a hand-picked range has to be asked for.
  const preset = presetOf(range);
  const today = todayIn(range.timeZone);
  const bundle = useGatewayLoad(`presets|${today}`, (signal) => gatewayStatusApi.presets(today, range.timeZone, signal), REFRESH_MS);
  const custom = useGatewayLoad(`${range.startDate}|${range.endDate}`, (signal) => gatewayStatusApi.report(range, signal), REFRESH_MS, preset === null);
  const active = preset ? bundle : custom;
  const data = preset ? bundle.data?.ranges[preset] ?? null : custom.data;
  const { loading, error } = active;
  const refreshing = bundle.refreshing || custom.refreshing;
  const reload = () => {
    bundle.reload();
    custom.reload();
  };

  const rows = useMemo(() => filterGateways(data?.gateways ?? [], state, search), [data, state, search]);

  // This page reads the gateway health service live, with no scheduler in between, so the header's "Last updated" shows
  // when this data was loaded (on every refresh) instead of when the database numbers were last updated.
  useTakeOverHeaderLastUpdated(
    data ? fmtDateTime(data.generatedAt) : null,
    'When this gateway data was last loaded. It comes live from the gateway health service, with no delay.'
  );

  const changeRange = (next: GatewayRange) => setParams(rangeToParams(next), { replace: false });
  const openTimeline = (g: GatewayConnectivity) =>
    navigate({ pathname: `/app/gis/gateway-status/${g.gatewayId}`, search: paramText ? `?${paramText}` : '' });

  return (
    <div className="gs-page">
      <div className="gs-toolbar">
        <div className="gs-toolbar-left">
          <div className="gs-title"><RadioTower size={16} className="gs-title-icon" /> Gateway Status</div>
          <div className="gs-chips">
            {CHIPS.map((c) => (
              <button
                key={c.state}
                className={clsx('gs-chip', `gs-chip--${c.state}`, state === c.state && 'gs-chip--active')}
                onClick={() => setState(state === c.state ? 'all' : c.state)}
                aria-pressed={state === c.state}
                title={state === c.state ? 'Show all gateways' : `Show only ${c.label.toLowerCase()} gateways`}
              >
                <span className="gs-dot" />
                {c.label}: {data ? data.counts[c.countKey] : '–'}
              </button>
            ))}
          </div>
          <div className="gs-search">
            <Search size={14} className="gs-search-icon" />
            <input
              type="search"
              placeholder="Search gateway ID or address…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search gateways"
            />
          </div>
        </div>
        <div className="gs-toolbar-right">
          <button className="cw-button-secondary gs-refresh" onClick={reload} disabled={refreshing} title="Refresh now">
            <RefreshCw size={13} className={refreshing ? 'cw-spin' : ''} /> Refresh
          </button>
          <RangeControls range={range} onChange={changeRange} />
        </div>
      </div>

      {error && (
        <div className="gs-banner gs-banner--error" role="alert">
          {error} {data ? 'Showing the last data received.' : ''}
        </div>
      )}
      {data?.historyAvailableFrom && Date.parse(data.historyAvailableFrom) > Date.parse(`${range.startDate}T00:00:00Z`) && (
        <div className="gs-banner">History is only available from {fmtDateTime(data.historyAvailableFrom)}; earlier days in this range show no data.</div>
      )}

      <div className="gs-body">
        {loading && !data ? (
          <div className="gs-loading" role="status"><div className="cw-spinner" /> Loading gateways…</div>
        ) : data ? (
          <GatewayStatusTable rows={rows} onTimeline={openTimeline} onMap={setMapFor} />
        ) : null}
      </div>

      {mapFor && <GatewayMapDialog gateway={mapFor} onClose={() => setMapFor(null)} />}
    </div>
  );
}
