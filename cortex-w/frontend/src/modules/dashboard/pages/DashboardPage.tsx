import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { FilterBar } from '@/components/filters/FilterBar';
import { DashboardBreadcrumb } from '../components/DashboardBreadcrumb';
import { DashboardKpiRow } from '../components/DashboardKpiRow';
import { NodeOverviewTable } from '../components/NodeOverviewTable';
import { NodeMeterTable } from '../components/NodeMeterTable';
import { DashboardLoader } from '../components/DashboardLoader';
import { MeterHistoryDrawer } from '@/modules/gis/shared/MeterHistoryDrawer';
import type { GisMeter } from '@/modules/gis/shared/gisData';
import type { MeterRow, NodeRow } from '../models/dashboardRows';
import { useDashboardScope } from '../hooks/useDashboardScope';
import { useNodeAncestors } from '../hooks/useNodeAncestors';
import { useNodeChildren } from '../hooks/useNodeChildren';
import { useNodeMeters, METERS_PAGE_SIZE } from '../hooks/useNodeMeters';
import { aggregateNodeKpis, aggregateSummaryKpis } from '../services/dashboardAggregation';
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
    householdId: row.consumerId || row.meterId,
    householdShortId: row.consumerId || row.meterId,
    householdName: row.consumerName || 'Consumer',
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
    status: row.connectivityStatus === 'CONNECTED' ? 'active' : row.connectivityStatus === 'DISCONNECTED' ? 'weak' : 'silent',
    lastSeen: row.latestReadingLocal ?? (row.latestReadingAt ? new Date(row.latestReadingAt).toLocaleString() : null),
    pipeDiameter: row.meterSize || null,
    connectionType: row.meterType || null,
    currentReadingM3: row.totalizerM3 ?? null,
    yesterdayConsumptionL: null,
    monthConsumptionM3: null,
    dailyAvgL: null,
    currentFlowRateLph: null,
    alerts: [],
    last10DaysReadings: [],
  } as unknown as GisMeter;
}

export function DashboardPage() {
  const nav = useNavigate();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN'>('ALL');
  const [selectedMeter, setSelectedMeter] = useState<MeterRow | null>(null);

  // The current node id is just the last segment of the real URL path
  // (/app/dashboard/<id>/<id>/...) — however many real levels deep that is.
  const { currentNodeId, pathIds } = useDashboardScope();

  // Real root-to-current name chain, resolved fresh from the live site tree
  // every time — correct on a deep link or refresh, not just on in-app clicks.
  const { ancestors, isLoading: ancestorsLoading } = useNodeAncestors(currentNodeId);

  // Children of the current node (or the real top-level sites at the root).
  const {
    nodes: childNodes,
    rawNodes: rawChildNodes,
    isLoading: childrenLoading,
    error: childrenError,
    refetch: refetchChildren,
  } = useNodeChildren(currentNodeId, searchQuery);

  // A node with zero children, once loaded, is a real leaf — show its
  // meters instead of a further drill-down table.
  const isLeafView = currentNodeId !== null && !childrenLoading && rawChildNodes.length === 0;

  const {
    meters,
    total: metersTotal,
    totalPages: metersTotalPages,
    page: metersPage,
    setPage: setMetersPage,
    sort: metersSort,
    toggleSort: toggleMetersSort,
    summary: leafSummary,
    isFirstLoad: metersFirstLoad,
    isLoading: metersLoading,
    error: metersError,
    refetch: refetchMeters,
  } = useNodeMeters(isLeafView ? currentNodeId : null, searchQuery, statusFilter);

  // At a leaf the cards (devices, connected, ..., yesterday / today / month flow) are the totals of the whole node, which
  // the server sends with every page, so they do not change with the search, the status filter or the page.
  const kpis = useMemo(() => {
    if (isLeafView) return aggregateSummaryKpis(leafSummary);
    return aggregateNodeKpis(rawChildNodes);
  }, [isLeafView, leafSummary, rawChildNodes]);

  // One loader for the whole page while its first data is on the way; the cards and the table have none of their own.
  // Paging or sorting a meter list later keeps the cards and the table on screen.
  const showMainLoader =
    currentNodeId === null ? childrenLoading : childrenLoading || (isLeafView && metersFirstLoad) || ancestorsLoading;

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('ALL');
  }, []);

  const handleRetryAll = () => {
    refetchChildren();
    if (isLeafView) refetchMeters();
  };

  const handleSelectNode = (node: NodeRow) => {
    nav(`/app/dashboard/${[...pathIds, node.id].join('/')}`);
  };

  const searchPlaceholder = isLeafView
    ? 'Search device ID, meter ID, consumer, address...'
    : currentNodeId === null
    ? 'Search areas...'
    : `Search areas in ${ancestors[ancestors.length - 1]?.name || ''}...`;

  const activeError = childrenError || (isLeafView && metersError) || undefined;

  const currentLocality = ancestors.map((n) => n.name).join(' - ') || 'Dashboard';

  const gisMeter = useMemo(() => {
    if (!selectedMeter) return null;
    return meterRowToGisMeter(selectedMeter, currentLocality);
  }, [selectedMeter, currentLocality]);

  const toolbar = (
    <FilterBar
      inline
      searchValue={searchQuery}
      onSearchChange={setSearchQuery}
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
            onChange={(e) => setStatusFilter(e.target.value as any)}
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
  );

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
            <button className="cw-btn" onClick={handleRetryAll} style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
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

      {showMainLoader ? (
        <DashboardLoader />
      ) : (
        <>
          {/* 3. KPI Row */}
          <DashboardKpiRow
            isLeaf={isLeafView}
            kpis={kpis}
            isLoading={false}
            selectedStatusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />

          {/* 4. Scope-specific data table; the search and the filters sit at the right of its heading */}
          {isLeafView ? (
            <NodeMeterTable
              toolbar={toolbar}
              meters={meters}
              total={metersTotal}
              page={metersPage}
              totalPages={metersTotalPages}
              pageSize={METERS_PAGE_SIZE}
              sort={metersSort}
              onSort={toggleMetersSort}
              onPageChange={setMetersPage}
              isLoading={metersLoading}
              onSelectMeter={(meter) => setSelectedMeter(meter)}
            />
          ) : (
            <NodeOverviewTable
              toolbar={toolbar}
              nodes={childNodes}
              isLoading={childrenLoading}
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
