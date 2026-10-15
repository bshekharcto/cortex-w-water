import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RadioTower, RefreshCw, Search } from 'lucide-react';
import clsx from 'clsx';
import { gatewayStatusApi, type GatewayConnectivity, type GatewayRange, type GatewayState } from '@/services/api/gatewayStatusApi';
import { useGatewayLoad } from '../useGatewayLoad';
import { filterGateways, fmtDateTime, rangeFromParams, rangeToParams } from '../gatewayStatusModel';
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

  const key = `${range.startDate}|${range.endDate}`;
  const { data, loading, refreshing, error, reload } = useGatewayLoad(key, (signal) => gatewayStatusApi.report(range, signal), REFRESH_MS);

  const rows = useMemo(() => filterGateways(data?.gateways ?? [], state, search), [data, state, search]);

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
        </div>
        <RangeControls range={range} onChange={changeRange} />
      </div>

      <div className="gs-subbar">
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
        <div className="gs-asof">
          {data && <span>As of {fmtDateTime(data.generatedAt)}</span>}
          <button className="cw-button-secondary gs-refresh" onClick={reload} disabled={refreshing} title="Refresh now">
            <RefreshCw size={13} className={refreshing ? 'cw-spin' : ''} /> Refresh
          </button>
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
