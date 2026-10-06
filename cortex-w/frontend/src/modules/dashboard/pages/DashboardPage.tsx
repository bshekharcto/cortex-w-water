import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { FilterBar } from '@/components/filters/FilterBar';
import { DashboardBreadcrumb } from '../components/DashboardBreadcrumb';
import { DashboardKpiRow } from '../components/DashboardKpiRow';
import { NodeOverviewTable } from '../components/NodeOverviewTable';
import { NodeMeterTable } from '../components/NodeMeterTable';
import { MeterHistoryDrawer } from '@/modules/gis/shared/MeterHistoryDrawer';
import type { GisMeter } from '@/modules/gis/shared/gisData';
import type { MeterRow, NodeRow } from '../models/dashboardRows';
import { useDashboardScope } from '../hooks/useDashboardScope';
import { useDashboardView } from '../hooks/useDashboardView';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { MeterSortField, StatusFilter } from '../models/dashboardView';
import { aggregateNodeKpis, aggregateCountKpis } from '../services/dashboardAggregation';
import '@/modules/gis/shared/gis.css';

function meterRowToGisMeter(row: MeterRow, locality: string): GisMeter {
  return {
    id: row.meterId || row.devEui || undefined,
    // Real upstream asset id — this is what the drawer uses to fetch live
    // meter detail. Never guess it; an absent id means the drawer can't
    // fetch live data and should say so, not silently show the wrong meter.
    assetId: row.assetId ?? undefined,
    meterId: row.meterId,
    // Real dev_eui looked up from synced Postgres telemetry by the backend —
    // null (never fabricated) if this meter hasn't synced any packets yet.
    devEui: row.devEui || null,
    // Real consumer details only; the drawer shows "—" for what the feed lacks.
    householdId: row.consumerId || '',
    householdShortId: row.consumerId || '',
    householdName: row.consumerName || '',
    locality,
    // Everything below is an honest "unknown" placeholder until the drawer's
    // live fetch (keyed on the real assetId above) resolves — never a
    // plausible-looking fabricated number.
    lat: null,
    lng: null,
    gatewayId: '',
    gatewayAlias: '',
    distanceMeters: null,
    rssi: null,
    snr: null,
    // `status` only picks the badge colour (green / amber / red); the badge
    // TEXT is the real connectivity status below, not an invented RF state.
    status: row.connectivityStatus === 'CONNECTED' ? 'active' : row.connectivityStatus === 'DISCONNECTED' ? 'weak' : 'silent',
    connectivityStatus: row.connectivityStatus,
    batteryStatus: null,
    batteryVoltage: null,
    batteryPercentage: null,
    valveStatus: null,
    valveState: null,
    lastSeen: row.latestReadingAt ? new Date(row.latestReadingAt).toLocaleString() : null,
    // The dashboard feed carries no pipe size or meter type, so none is shown.
    pipeDiameter: null,
    connectionType: null,
    currentReadingM3: row.totalizerM3 ?? null,
    yesterdayConsumptionL: null,
    monthConsumptionM3: null,
    dailyAvgL: null,
    currentFlowRateLph: null,
    alerts: [],
    last10DaysReadings: [],
  } as unknown as GisMeter;
}

const METERS_PER_PAGE = 15;

/** The filters, paging and sort of the current screen. They belong to ONE node: see the `nodeId` check below. */
interface ScreenState {
  nodeId: string | null;
  page: number;
  search: string;
  status: StatusFilter;
  sort: MeterSortField;
  asc: boolean;
}

const freshScreen = (nodeId: string | null): ScreenState => ({
  nodeId,
  page: 0,
  search: '',
  status: 'ALL',
  sort: 'devEui',
  asc: true,
});

export function DashboardPage() {
  const nav = useNavigate();
  const [selectedMeter, setSelectedMeter] = useState<MeterRow | null>(null);

  // The current node id is just the last segment of the real URL path
  // (/app/dashboard/<id>/<id>/...) — however many real levels deep that is.
  const { currentNodeId, pathIds } = useDashboardScope();

  // Filters, paging and sort belong to the screen they were set on. State
  // saved for another node is ignored, so moving to a node starts it clean —
  // with no effect that would first fire a request using the old node's
  // leftovers.
  const [saved, setSaved] = useState<ScreenState>(freshScreen(currentNodeId));
  const screen = saved.nodeId === currentNodeId ? saved : freshScreen(currentNodeId);
  const update = useCallback(
    (patch: Partial<ScreenState>) => setSaved({ ...screen, ...patch, nodeId: currentNodeId }),
    [screen, currentNodeId]
  );
  const searchQuery = screen.search;
  const statusFilter = screen.status;

  // Typing in the search box shouldn't fire a request per keystroke.
  const debouncedSearch = useDebouncedValue(searchQuery, 300, currentNodeId);

  // One request returns the whole screen: breadcrumb, this node's own row,
  // its children and — at a leaf — one page of its meters.
  const { view, error: viewError, isLoading, isFetching, refetch } = useDashboardView(currentNodeId, {
    page: screen.page,
    size: METERS_PER_PAGE,
    search: debouncedSearch,
    status: screen.status,
    sort: screen.sort,
    dir: screen.asc ? 'asc' : 'desc',
  });

  const ancestors = view?.ancestors ?? [];
  const rawChildNodes = view?.children ?? [];
  const currentNode = view?.node ?? undefined;
  const isLeafView = !!view?.isLeaf;
  const meterPage = view?.meters ?? null;

  // At a non-leaf node the search box narrows the (small) list of areas here;
  // at a leaf it is sent to the server with the meter query instead.
  const childNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return q ? rawChildNodes.filter((n) => n.name.toLowerCase().includes(q)) : rawChildNodes;
  }, [rawChildNodes, searchQuery]);

  // A node that is neither a leaf nor has any children means its sub-areas
  // failed to come back — an error, never a wrong "no meters" screen.
  const childrenMissing = !!view && currentNodeId !== null && !view.isLeaf && view.children.length === 0;

  const kpis = useMemo(() => {
    if (!view) return null;
    if (view.isLeaf && view.meters) {
      // Counts cover ALL the node's meters: the search box and status filter
      // narrow the table, never the totals above it.
      return aggregateCountKpis(
        view.meters.counts,
        {
          yesterdayFlowM3: currentNode?.yesterdayFlowM3 ?? 0,
          todayFlowM3: currentNode?.todayFlowM3 ?? 0,
          monthToDateFlowM3: currentNode?.monthToDateFlowM3 ?? 0,
        },
        currentNode?.dataTimestamp
      );
    }
    return aggregateNodeKpis(view.children);
  }, [view, currentNode]);

  const handleResetFilters = useCallback(() => update({ search: '', status: 'ALL', page: 0 }), [update]);

  const handleSort = (field: MeterSortField) =>
    update(screen.sort === field ? { asc: !screen.asc, page: 0 } : { sort: field, asc: true, page: 0 });

  const handleSelectNode = (node: NodeRow) => {
    nav(`/app/dashboard/${[...pathIds, node.id].join('/')}`);
  };

  const searchPlaceholder = isLeafView
    ? 'Search device ID, meter ID, consumer, address...'
    : currentNodeId === null
    ? 'Search areas...'
    : `Search areas in ${ancestors[ancestors.length - 1]?.name || ''}...`;

  // First failure wins; while any source has failed the page shows the error
  // banner instead of KPIs/tables, so zeros never stand in for missing data.
  const activeError =
    viewError || (childrenMissing ? 'The sub-areas of this area could not be loaded.' : undefined) || undefined;

  const currentLocality = ancestors.map((n) => n.name).join(' - ') || 'Dashboard';

  const gisMeter = useMemo(() => {
    if (!selectedMeter) return null;
    return meterRowToGisMeter(selectedMeter, currentLocality);
  }, [selectedMeter, currentLocality]);

  return (
    <div>
      {/* 1. Breadcrumb navigation */}
      <DashboardBreadcrumb path={ancestors} />

      {/* 2. Error Banner if data fetch fails */}
      {activeError && (
        <div
          className="cw-surface"
          style={{
            padding: 16,
            marginBottom: 20,
            background: 'var(--cw-red-subtle, rgba(239, 68, 68, 0.08))',
            borderColor: 'var(--cw-red, #ef4444)',
            borderWidth: 1,
            borderStyle: 'solid',
            borderRadius: 'var(--cw-radius, 8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--cw-red, #dc2626)' }}>
            <AlertTriangle size={20} />
            <div>
              <strong>Failed to load telemetry data:</strong> {activeError}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="cw-btn" onClick={refetch} style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
              <RotateCcw size={14} style={{ marginRight: 4 }} /> Retry
            </button>
            {currentNodeId !== null && (
              <button
                className="cw-btn"
                onClick={() => nav('/app/dashboard')}
                style={{ fontSize: '0.85rem', padding: '6px 12px' }}
              >
                Return to All Areas
              </button>
            )}
          </div>
        </div>
      )}

      {!activeError && (
        <>
        {/* 3. KPI Row */}
        <DashboardKpiRow
          isLeaf={isLeafView}
          kpis={kpis}
          isLoading={isLoading}
          selectedStatusFilter={statusFilter}
          // Status filtering only exists on the meter list, so the cards are
          // only clickable at a leaf.
          onStatusFilterChange={isLeafView ? (status) => update({ status, page: 0 }) : undefined}
        />

        {/* 4. Filter Bar */}
        <section className="cw-section" style={{ marginBottom: 16 }}>
          <FilterBar
            searchValue={searchQuery}
            onSearchChange={(search) => update({ search, page: 0 })}
            searchPlaceholder={searchPlaceholder}
            onReset={searchQuery || statusFilter !== 'ALL' ? handleResetFilters : undefined}
          >
            {isLeafView && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label htmlFor="dashboard-status-filter" style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)', whiteSpace: 'nowrap' }}>
                  Status:
                </label>
                <select
                  id="dashboard-status-filter"
                  className="cw-filter-select"
                  value={statusFilter}
                  onChange={(e) => update({ status: e.target.value as StatusFilter, page: 0 })}
                  style={{
                    background: 'var(--cw-bg-input, #fff)',
                    border: '1px solid var(--cw-border, #cbd5e1)',
                    borderRadius: 'var(--cw-radius, 6px)',
                    padding: '6px 12px',
                    fontSize: '0.85rem',
                    color: 'var(--cw-text, #1e293b)',
                  }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="CONNECTED">Connected</option>
                  <option value="DISCONNECTED">Disconnected</option>
                  <option value="NEVER_SEEN">Never Seen</option>
                </select>
              </div>
            )}
          </FilterBar>
        </section>

        {/* 5. Scope-specific Data Table */}
        {isLeafView ? (
          <NodeMeterTable
            meters={meterPage?.items ?? []}
            total={meterPage?.total ?? 0}
            page={meterPage?.page ?? 0}
            pageSize={meterPage?.pageSize ?? METERS_PER_PAGE}
            sortField={screen.sort}
            sortAsc={screen.asc}
            isLoading={isLoading}
            isFetching={isFetching}
            onSort={handleSort}
            onPageChange={(page) => update({ page })}
            onSelectMeter={(meter) => setSelectedMeter(meter)}
          />
        ) : (
          <NodeOverviewTable
            nodes={childNodes}
            isLoading={isLoading}
            onSelectNode={handleSelectNode}
          />
        )}

        </>
      )}

      {/* 6. Meter 360° History Drawer */}
      {selectedMeter && gisMeter && (
        <MeterHistoryDrawer
          meter={gisMeter}
          onClose={() => setSelectedMeter(null)}
        />
      )}
    </div>
  );
}
