import { useState, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { FilterBar } from '@/components/filters/FilterBar';
import { DashboardBreadcrumb } from '../components/DashboardBreadcrumb';
import { DashboardKpiRow } from '../components/DashboardKpiRow';
import { ZoneOverviewTable } from '../components/ZoneOverviewTable';
import { DmaOverviewTable } from '../components/DmaOverviewTable';
import { DmaMeterTable } from '../components/DmaMeterTable';
import { MeterHistoryDrawer } from '@/modules/gis/shared/MeterHistoryDrawer';
import type { GisMeter } from '@/modules/gis/shared/gisData';
import type { MeterRow } from '../models/dashboardRows';
import { useDashboardScope } from '../hooks/useDashboardScope';
import { useDashboardKpis } from '../hooks/useDashboardKpis';
import { useZoneRows } from '../hooks/useZoneRows';
import { useDmaRows } from '../hooks/useDmaRows';
import { useDmaMeterRows } from '../hooks/useDmaMeterRows';
import '@/modules/gis/shared/gis.css';

function meterRowToGisMeter(row: MeterRow): GisMeter {
  return {
    id: row.deviceId,
    assetId: Number(row.consumerId) || 1,
    meterId: row.meterId || row.deviceId,
    devEui: row.deviceId,
    householdId: row.consumerId || row.deviceId,
    householdShortId: row.consumerId || row.deviceId,
    householdName: row.consumerName || 'Consumer',
    locality: `${row.zoneName} - ${row.dmaName}`,
    lat: 20.2961,
    lng: 85.8245,
    gatewayId: 'GW-01',
    gatewayAlias: 'Gateway 1',
    distanceMeters: 120,
    rssi: -85,
    snr: 9.0,
    status: row.connectivityStatus === 'CONNECTED' ? 'active' : row.connectivityStatus === 'DISCONNECTED' ? 'weak' : 'silent',
    batteryStatus: 'Normal',
    batteryVoltage: 3.6,
    batteryPercentage: 92,
    valveStatus: 'Normal',
    valveState: 'Open',
    lastSeen: row.latestReadingAt ? new Date(row.latestReadingAt).toLocaleString() : 'Recent',
    pipeDiameter: row.meterSize || '15mm',
    connectionType: row.meterType || 'Domestic',
    currentReadingM3: row.totalizerM3 || 0,
    yesterdayConsumptionL: 420,
    todayConsumptionL: 0,
    monthConsumptionM3: 14.2,
    dailyAvgL: 410,
    flowRateLph: 0,
    alerts: [],
    last10DaysReadings: [],
  } as unknown as GisMeter;
}

export function DashboardPage() {
  const nav = useNavigate();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN'>('ALL');
  const [selectedMeter, setSelectedMeter] = useState<MeterRow | null>(null);

  const { zoneId, dmaId } = useParams<{ zoneId?: string; dmaId?: string }>();

  // Derive initial scope from URL params
  const rawScope = useDashboardScope();

  // Load data sources by scope
  const {
    zones,
    rawZones,
    isLoading: zonesLoading,
    error: zonesError,
    refetch: refetchZones,
  } = useZoneRows(rawScope.level === 'GLOBAL' ? searchQuery : '');

  const {
    dmas,
    rawDmas,
    isLoading: dmasLoading,
    error: dmasError,
    refetch: refetchDmas,
  } = useDmaRows(zoneId || '', rawScope.level === 'ZONE' ? searchQuery : '');

  const {
    meters,
    isLoading: metersLoading,
    error: metersError,
    refetch: refetchMeters,
  } = useDmaMeterRows(
    zoneId || '',
    dmaId || '',
    rawScope.level === 'DMA' ? searchQuery : '',
    rawScope.level === 'DMA' ? statusFilter : 'ALL'
  );

  // Resolve human-readable names for Breadcrumb
  const resolvedZoneName = useMemo(() => {
    if (!zoneId) return undefined;
    const found = rawZones.find((z) => z.zoneId === zoneId);
    return found?.zoneName;
  }, [zoneId, rawZones]);

  const resolvedDmaName = useMemo(() => {
    if (!dmaId) return undefined;
    const found = rawDmas.find((d) => d.dmaId === dmaId);
    return found?.dmaName;
  }, [dmaId, rawDmas]);

  const scope = useDashboardScope({
    zoneName: resolvedZoneName,
    dmaName: resolvedDmaName,
  });

  // Fetch hierarchical KPIs matching active scope
  const {
    kpis,
    isLoading: kpisLoading,
    error: kpisError,
    refetch: refetchKpis,
  } = useDashboardKpis(scope);

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('ALL');
  }, []);

  const handleRetryAll = () => {
    refetchKpis();
    if (scope.level === 'GLOBAL') refetchZones();
    if (scope.level === 'ZONE') refetchDmas();
    if (scope.level === 'DMA') refetchMeters();
  };

  // Search input placeholder contextualized to active scope
  const searchPlaceholder = useMemo(() => {
    switch (scope.level) {
      case 'GLOBAL':
        return 'Search zones...';
      case 'ZONE':
        return `Search DMAs in ${scope.zoneName}...`;
      case 'DMA':
        return 'Search device ID, meter ID, consumer, address...';
      default:
        return 'Search...';
    }
  }, [scope]);

  const activeError = kpisError || (scope.level === 'GLOBAL' && zonesError) || (scope.level === 'ZONE' && dmasError) || (scope.level === 'DMA' && metersError);

  const gisMeter = useMemo(() => {
    if (!selectedMeter) return null;
    return meterRowToGisMeter(selectedMeter);
  }, [selectedMeter]);

  return (
    <div>
      {/* 1. Breadcrumb navigation */}
      <DashboardBreadcrumb scope={scope} />

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
            {scope.level !== 'GLOBAL' && (
              <button
                className="cw-btn"
                onClick={() => nav('/app/dashboard')}
                style={{ fontSize: '0.85rem', padding: '6px 12px' }}
              >
                Return to All Zones
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. 7-Card KPI Row */}
      <DashboardKpiRow
        scope={scope}
        kpis={kpis}
        isLoading={kpisLoading}
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
          {scope.level === 'DMA' && (
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
      {scope.level === 'GLOBAL' && (
        <ZoneOverviewTable zones={zones} isLoading={zonesLoading} />
      )}

      {scope.level === 'ZONE' && (
        <DmaOverviewTable dmas={dmas} zoneId={scope.zoneId} isLoading={dmasLoading} />
      )}

      {scope.level === 'DMA' && (
        <DmaMeterTable
          meters={meters}
          isLoading={metersLoading}
          onSelectMeter={(meter) => setSelectedMeter(meter)}
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
