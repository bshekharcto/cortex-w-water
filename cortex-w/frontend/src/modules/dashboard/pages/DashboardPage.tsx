import { useState, useMemo, useCallback, useEffect } from 'react';
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
import { useNodeAncestors } from '../hooks/useNodeAncestors';
import { useNodeChildren } from '../hooks/useNodeChildren';
import { useNodeMeters } from '../hooks/useNodeMeters';
import { aggregateNodeKpis, aggregateMeterKpis } from '../services/dashboardAggregation';
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

export function DashboardPage() {
  const nav = useNavigate();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN'>('ALL');
  const [selectedMeter, setSelectedMeter] = useState<MeterRow | null>(null);

  // The current node id is just the last segment of the real URL path
  // (/app/dashboard/<id>/<id>/...) — however many real levels deep that is.
  const { currentNodeId, pathIds } = useDashboardScope();

  // Filters belong to the view they were typed in: leaving a node clears them,
  // so they can't silently narrow the next node's list.
  useEffect(() => {
    setSearchQuery('');
    setStatusFilter('ALL');
  }, [currentNodeId]);

  // Real root-to-current name chain, resolved fresh from the live site tree
  // every time — correct on a deep link or refresh, not just on in-app clicks.
  const {
    ancestors,
    isLoading: ancestorsLoading,
    error: ancestorsError,
    refetch: refetchAncestors,
  } = useNodeAncestors(currentNodeId);
  const parentId = ancestors.length > 1 ? ancestors[ancestors.length - 2].id : null;

  // Children of the current node (or the real top-level sites at the root).
  const {
    nodes: childNodes,
    rawNodes: rawChildNodes,
    isLoading: childrenLoading,
    error: childrenError,
    refetch: refetchChildren,
  } = useNodeChildren(currentNodeId, searchQuery);

  // A node whose children loaded fine and came back empty is a leaf CANDIDATE.
  // Only then is its own row (totals, flows, `hasChildren`) needed, and it
  // lives in its PARENT's children list (for a top-level site, the root list),
  // so the lookup is deferred until here — a node with children never waits
  // on, or fails because of, its parent's list.
  const childrenSettledEmpty =
    currentNodeId !== null &&
    !ancestorsLoading &&
    !ancestorsError &&
    !childrenLoading &&
    !childrenError &&
    rawChildNodes.length === 0;
  const {
    rawNodes: siblingNodes,
    isLoading: siblingsLoading,
    error: siblingsError,
    refetch: refetchSiblings,
  } = useNodeChildren(parentId, '', childrenSettledEmpty);
  const currentNode = useMemo<NodeRow | undefined>(
    () => siblingNodes.find((n) => n.id === currentNodeId),
    [siblingNodes, currentNodeId]
  );

  // It is a real leaf only once that lookup succeeded and the backend agrees
  // it has no children. An empty list for a node the backend says HAS children
  // is an error, not a leaf; a failed fetch is never an empty node.
  const childrenMissing = childrenSettledEmpty && !siblingsLoading && !siblingsError && !!currentNode?.hasChildren;
  const isLeafView = childrenSettledEmpty && !siblingsLoading && !siblingsError && !childrenMissing;

  const {
    meters,
    rawMeters,
    isLoading: metersLoading,
    error: metersError,
    refetch: refetchMeters,
  } = useNodeMeters(isLeafView ? currentNodeId : null, searchQuery, statusFilter);

  const kpis = useMemo(() => {
    if (isLeafView) {
      // Counts come from the FULL meter list: the search box and status filter
      // narrow the table, never the totals above it.
      return aggregateMeterKpis(rawMeters, {
        yesterdayFlowM3: currentNode?.yesterdayFlowM3 ?? 0,
        todayFlowM3: currentNode?.todayFlowM3 ?? 0,
        monthToDateFlowM3: currentNode?.monthToDateFlowM3 ?? 0,
      });
    }
    return aggregateNodeKpis(rawChildNodes);
  }, [isLeafView, rawMeters, currentNode, rawChildNodes]);

  const isLoading = childrenLoading || ancestorsLoading || siblingsLoading || (isLeafView && metersLoading);

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('ALL');
  }, []);

  const handleRetryAll = () => {
    refetchChildren();
    if (ancestorsError) refetchAncestors();
    if (siblingsError) refetchSiblings();
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

  // First failure wins; while any source has failed the page shows the error
  // banner instead of KPIs/tables, so zeros never stand in for missing data.
  const activeError =
    childrenError ||
    ancestorsError ||
    siblingsError ||
    (isLeafView && metersError) ||
    (childrenMissing ? 'The sub-areas of this area could not be loaded.' : undefined) ||
    undefined;

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
          onStatusFilterChange={isLeafView ? setStatusFilter : undefined}
        />

        {/* 4. Filter Bar */}
        <section className="cw-section" style={{ marginBottom: 16 }}>
          <FilterBar
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
        </section>

        {/* 5. Scope-specific Data Table */}
        {isLeafView ? (
          <NodeMeterTable
            meters={meters}
            isLoading={metersLoading}
            onSelectMeter={(meter) => setSelectedMeter(meter)}
          />
        ) : (
          <NodeOverviewTable
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
