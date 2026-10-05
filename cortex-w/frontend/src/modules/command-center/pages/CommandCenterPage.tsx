import { useState, useMemo, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/empty-state/EmptyState';
import '../styles/commandCenter.css';

// Components
import { CommandCenterToolbar } from '../components/CommandCenterToolbar';
import { NetworkKpiStrip } from '../components/NetworkKpiStrip';
import { GatewayRail } from '../components/GatewayRail';
import { SelectedGatewayHeader } from '../components/SelectedGatewayHeader';
import { GatewayMetersTable } from '../components/GatewayMetersTable';
import { GatewayFramesTable } from '../components/GatewayFramesTable';
import { GatewayTrafficChart } from '../components/GatewayTrafficChart';
import { GatewayRadioHealth } from '../components/GatewayRadioHealth';
import { AllGatewayComparison } from '../components/AllGatewayComparison';
import { MeterInspector } from '../components/MeterInspector';
import { LiveNetworkFeed } from '../components/LiveNetworkFeed';

// Live API & Types
import {
  fetchCommandCenterSummary,
  fetchSites,
  fetchGatewayMeters,
  searchMeters,
  getLocalCachedSummary,
  TelemetrySummaryResponse,
} from '@/services/api/commandCenterApi';
import {
  GatewayTabType,
  TimeWindow,
  MeterTelemetryItem,
  RawFrameItem,
} from '../types/commandCenter.types';

const TARGET_DATE = new Date().toISOString().slice(0, 10);

export function CommandCenterPage() {
  const [activeMode, setActiveMode] = useState<'Gateways' | 'Meters'>('Gateways');
  const [timeRange, setTimeRange] = useState<TimeWindow>('7D');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(null);
  const [gatewayTab, setGatewayTab] = useState<GatewayTabType>('METERS');
  const [selectedMeter, setSelectedMeter] = useState<MeterTelemetryItem | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Dynamic Site Selector State
  const [selectedSiteId, setSelectedSiteId] = useState<string>('ALL');
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([
    { id: 'ALL', name: 'All Sites (Fleet)' },
  ]);

  // Load available sites from backend; refresh periodically and on tab focus so new sites appear
  useEffect(() => {
    const loadSites = () =>
      fetchSites()
        .then((res) => {
          if (res && res.length > 0) setSites(res);
        })
        .catch(() => {});
    loadSites();
    const id = setInterval(loadSites, 60000);
    window.addEventListener('focus', loadSites);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', loadSites);
    };
  }, []);

  // Live Summary State with 0ms Stale-While-Revalidate from LocalStorage Cache
  const [summaryData, setSummaryData] = useState<TelemetrySummaryResponse | null>(() => {
    return getLocalCachedSummary(7, TARGET_DATE, 'ALL') || null;
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(!summaryData);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [metersByGatewayMap, setMetersByGatewayMap] = useState<Record<string, MeterTelemetryItem[]>>({});
  const [metersLoading, setMetersLoading] = useState(false);
  const [metersError, setMetersError] = useState<string | null>(null);

  // Background fetch routine (supports 1H, 6H, 24H, 7D, 30D and site filtering)
  const loadSummary = useCallback(async (forceRefresh = false) => {
    setIsSyncing(true);
    try {
      const days = timeRange === '30D' ? 30 : timeRange === '7D' ? 7 : timeRange === '24H' ? 1 : 1;
      const live = await fetchCommandCenterSummary(days, TARGET_DATE, forceRefresh, selectedSiteId);
      setSummaryData(live);
      setSyncError(null);
      setSecondsAgo(0);
    } catch (err) {
      console.warn('[CommandCenter] Live summary sync failed:', err);
      setSyncError(err instanceof Error ? err.message : 'Telemetry service unavailable');
    } finally {
      setIsSyncing(false);
    }
  }, [timeRange, selectedSiteId]);

  // Sync on mount or when timeRange or selectedSiteId changes
  useEffect(() => {
    loadSummary(false);
  }, [loadSummary]);

  // Periodic background refresh (every 45s) and elapsed timer ticker
  useEffect(() => {
    const ticker = setInterval(() => {
      setSecondsAgo((prev) => prev + 1);
    }, 1000);

    const autoSync = setInterval(() => {
      loadSummary(false);
    }, 45000);

    return () => {
      clearInterval(ticker);
      clearInterval(autoSync);
    };
  }, [loadSummary]);

  const handleManualRefresh = () => {
    loadSummary(true);
  };

  // Derived Gateways list
  const currentGateways = useMemo(() => {
    return summaryData?.gateways ?? [];
  }, [summaryData]);

  // Ensure an active gateway is selected once gateways are known
  useEffect(() => {
    if (!selectedGatewayId && currentGateways.length > 0) {
      setSelectedGatewayId(currentGateways[0].gatewayId);
    }
  }, [currentGateways, selectedGatewayId]);

  // Derived KPIs
  const currentKpis = useMemo(() => {
    return summaryData?.kpis ?? null;
  }, [summaryData]);

  const days = timeRange === '30D' ? 30 : timeRange === '7D' ? 7 : 1;

  // Meters are loaded per gateway on selection (the summary no longer embeds ~10k meters)
  useEffect(() => {
    setMetersByGatewayMap({});
  }, [days, selectedSiteId]);

  useEffect(() => {
    if (!selectedGatewayId || metersByGatewayMap[selectedGatewayId]) return;
    let cancelled = false;
    setMetersLoading(true);
    setMetersError(null);
    fetchGatewayMeters(selectedGatewayId, days, TARGET_DATE)
      .then((list) => {
        if (!cancelled) setMetersByGatewayMap((prev) => ({ ...prev, [selectedGatewayId]: list }));
      })
      .catch((err) => {
        if (!cancelled) setMetersError(err instanceof Error ? err.message : 'Failed to load meters');
      })
      .finally(() => {
        if (!cancelled) setMetersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedGatewayId, days, metersByGatewayMap]);

  // Derived Raw Frames for live feed and tables
  const allFrames = useMemo<RawFrameItem[]>(() => {
    return summaryData?.recentFrames ?? [];
  }, [summaryData]);

  // Time window filter for frames
  const timeFilteredFrames = useMemo(() => {
    if (timeRange === '24H' || timeRange === '7D' || timeRange === 'CUSTOM') {
      return allFrames;
    }
    const now = Date.now();
    const cutoffMs = timeRange === '1H' ? 3600 * 1000 : 6 * 3600 * 1000;
    return allFrames.filter((f) => {
      const t = new Date(f.decodedAt).getTime();
      return !isNaN(t) && now - t <= cutoffMs;
    });
  }, [allFrames, timeRange]);

  // Currently selected gateway item
  const currentGateway = useMemo(() => {
    if (!selectedGatewayId) return null;
    return currentGateways.find((g) => g.gatewayId === selectedGatewayId) || null;
  }, [selectedGatewayId, currentGateways]);

  // Meters observed by selected gateway
  const currentMeters = useMemo(() => {
    if (!selectedGatewayId) return [];
    return metersByGatewayMap[selectedGatewayId] ?? [];
  }, [selectedGatewayId, metersByGatewayMap]);

  // Frames received by selected gateway
  const currentFrames = useMemo(() => {
    if (!selectedGatewayId) return timeFilteredFrames;
    return timeFilteredFrames.filter((f) => f.gatewayId === selectedGatewayId);
  }, [selectedGatewayId, timeFilteredFrames]);

  // Handle selecting a meter from table or feed
  const handleSelectMeter = (meter: MeterTelemetryItem) => {
    setSelectedMeter(meter);
  };

  const handleSelectMeterById = (meterId: string) => {
    for (const gwId of Object.keys(metersByGatewayMap)) {
      const found = metersByGatewayMap[gwId].find((m) => m.meterId === meterId);
      if (found) {
        setSelectedMeter(found);
        return;
      }
    }
    searchMeters(meterId, days, TARGET_DATE)
      .then((hits) => {
        const hit = hits.find((h) => h.meter.meterId === meterId);
        if (hit) setSelectedMeter(hit.meter);
      })
      .catch(() => {});
  };

  // Global search handler
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (!q) return;
    const query = q.toLowerCase();
    // Check gateway alias or id
    const gw = currentGateways.find(
      (g) => g.alias.toLowerCase().includes(query) || g.gatewayId.toLowerCase().includes(query)
    );
    if (gw) {
      setSelectedGatewayId(gw.gatewayId);
      setGatewayTab('METERS');
      return;
    }
    // Meter ID / DevEUI lookup (server-side; meters aren't preloaded)
    if (q.length >= 3) {
      searchMeters(q, days, TARGET_DATE)
        .then((hits) => {
          if (hits.length === 0) return;
          setSelectedGatewayId(hits[0].gatewayId);
          setSelectedMeter(hits[0].meter);
          setGatewayTab('METERS');
        })
        .catch(() => {});
    }
  };

  return (
    <div className="cc-container">
      {/* Top Command Bar with Live Stream Sync Status */}
      <CommandCenterToolbar
        activeTab={activeMode}
        onTabChange={setActiveMode}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        searchQuery={searchQuery}
        onSearchChange={handleSearch}
        onRefresh={handleManualRefresh}
        lastUpdatedText={`${secondsAgo}s ago`}
        isSyncing={isSyncing}
        sites={sites}
        selectedSiteId={selectedSiteId}
        onSiteChange={setSelectedSiteId}
      />

      {syncError && (
        <div className="cc-card" role="alert" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', color: '#B45309' }}>
          <AlertTriangle size={16} />
          <span>
            {summaryData
              ? `Could not refresh telemetry (${syncError}). Showing the last data received.`
              : `Could not load telemetry (${syncError}).`}
          </span>
          <button className="cw-button-secondary" onClick={handleManualRefresh} style={{ marginLeft: 'auto' }}>
            Retry
          </button>
        </div>
      )}

      {/* Network Health 8-KPI Strip with Skeleton Loaders */}
      <NetworkKpiStrip
        kpis={currentKpis}
        loading={isSyncing && !summaryData}
      />

      {/* Main Operational Workspace */}
      <div
        className={`cc-main-workspace-layout ${
          selectedMeter ? 'cc-main-workspace-layout--with-inspector' : ''
        }`}
      >
        {/* Left Navigator: Gateway Rail with Live Status */}
        <GatewayRail
          gateways={currentGateways}
          selectedGatewayId={selectedGatewayId}
          loading={isSyncing && !summaryData}
          onSelectGateway={(id) => {
            setSelectedGatewayId(id);
            if (id) {
              setGatewayTab('METERS');
            }
          }}
        />

        {/* Center: Selected Gateway Workspace OR All-Gateway Overview */}
        <main className="cc-center-workspace">
          {currentGateway ? (
            <>
              <SelectedGatewayHeader
                gateway={currentGateway}
                activeTab={gatewayTab}
                onTabChange={setGatewayTab}
                onClearSelection={() => setSelectedGatewayId(null)}
              />

              {gatewayTab === 'METERS' && (
                <GatewayMetersTable
                  loading={metersLoading && !metersByGatewayMap[currentGateway.gatewayId]}
                  error={metersError}
                  meters={currentMeters}
                  selectedMeterId={selectedMeter?.meterId || null}
                  onSelectMeter={handleSelectMeter}
                />
              )}

              {gatewayTab === 'FRAMES' && (
                <GatewayFramesTable
                  frames={currentFrames}
                  gatewayAlias={currentGateway.alias}
                  onSelectFrameMeter={handleSelectMeterById}
                />
              )}

              {gatewayTab === 'TRAFFIC' && (
                <GatewayTrafficChart
                  allGateways={currentGateways}
                  hourlyActivity={summaryData?.hourlyActivity}
                />
              )}

              {gatewayTab === 'RADIO' && (
                <GatewayRadioHealth gatewayAlias={currentGateway.alias} meters={currentMeters} />
              )}
            </>
          ) : currentGateways.length === 0 ? (
            <EmptyState
              message={
                isSyncing
                  ? 'Loading gateways…'
                  : 'No gateway traffic has been observed for this site and time window.'
              }
            />
          ) : (
            <AllGatewayComparison
              gateways={currentGateways}
              onSelectGateway={(id) => {
                setSelectedGatewayId(id);
                setGatewayTab('METERS');
              }}
            />
          )}
        </main>

        {/* Right Inspector: Latest Meter Info (Telemetry Packet Inspector) */}
        {selectedMeter && (
          <MeterInspector
            meter={selectedMeter}
            onClose={() => setSelectedMeter(null)}
          />
        )}
      </div>

      {/* Bottom: Live Network Telemetry Feed */}
      <LiveNetworkFeed
        frames={allFrames}
        onSelectMeter={handleSelectMeterById}
      />
    </div>
  );
}

export default CommandCenterPage;
