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
  const parentId = ancestors.length > 1 ? ancestors[ancestors.length - 2].id : null;

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
    isLoading: metersLoading,
    error: metersError,
    refetch: refetchMeters,
  } = useNodeMeters(isLeafView ? currentNodeId : null, searchQuery, statusFilter);

  // A leaf's own totals (yesterday/today/month flow) live on its row in its
  // PARENT's children list, not on the (empty) call to itself — so at a
  // leaf, also fetch the sibling list to recover them for the KPI row.
  const { rawNodes: siblingNodes } = useNodeChildren(parentId, '', isLeafView && parentId !== null);
  const currentNodeTotals = useMemo<NodeRow | undefined>(
    () => siblingNodes.find((n) => n.id === currentNodeId),
    [siblingNodes, currentNodeId]
  );

  const kpis = useMemo(() => {
    if (isLeafView) {
      return aggregateMeterKpis(meters, {
        yesterdayFlowM3: currentNodeTotals?.yesterdayFlowM3 ?? 0,
        todayFlowM3: currentNodeTotals?.todayFlowM3 ?? 0,
        monthToDateFlowM3: currentNodeTotals?.monthToDateFlowM3 ?? 0,
      });
    }
    return aggregateNodeKpis(rawChildNodes);
  }, [isLeafView, meters, currentNodeTotals, rawChildNodes]);

  const isLoading = currentNodeId === null ? childrenLoading : childrenLoading || (isLeafView && metersLoading) || ancestorsLoading;

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

      {/* 3. KPI Row */}
      <DashboardKpiRow
        isLeaf={isLeafView}
        kpis={kpis}
        isLoading={isLoading}
        selectedStatusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
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
