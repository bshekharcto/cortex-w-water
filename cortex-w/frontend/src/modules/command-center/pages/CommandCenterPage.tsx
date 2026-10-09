import { useState, useMemo, useEffect, useCallback } from 'react';
import '../styles/commandCenter.css';
import '../styles/commandCenterExtras.css';

// Components
import { CommandCenterToolbar } from '../components/CommandCenterToolbar';
import { NetworkKpiStrip } from '../components/NetworkKpiStrip';
import { GatewayRail } from '../components/GatewayRail';
import { SelectedGatewayHeader } from '../components/SelectedGatewayHeader';
import { GatewayMetersTable } from '../components/GatewayMetersTable';
import { GatewayFramesPanel } from '../components/GatewayFramesPanel';
import { GatewayTrafficView } from '../components/GatewayTrafficView';
import { FrameDetailDrawer } from '../components/FrameDetailDrawer';
import { FleetMetersTable } from '../components/FleetMetersTable';
import { MeterFramesView } from '../components/MeterFramesView';
import { GatewayRadioHealth } from '../components/GatewayRadioHealth';
import { AllGatewayComparison } from '../components/AllGatewayComparison';
import { MeterInspector } from '../components/MeterInspector';
import { LiveNetworkFeed } from '../components/LiveNetworkFeed';

// Live API & Types
import {
  fetchCommandCenterSummary,
  fetchGatewayMeters,
  fetchMeter,
  fetchSites,
  getLocalCachedSummary,
  searchMeters,
  CustomRange,
  GatewayMetersPage,
  MeterFilterKey,
  TelemetrySummaryResponse,
} from '@/services/api/commandCenterApi';
import {
  GatewayItem,
  GatewayTabType,
  NetworkKpiData,
  TimeWindow,
  MeterTelemetryItem,
  RawFrameItem,
} from '../types/commandCenter.types';

// What the page shows before the first answer, or when none could be loaded: nothing, never sample data.
const NO_GATEWAYS: GatewayItem[] = [];
const NO_FRAMES: RawFrameItem[] = [];
const EMPTY_KPIS: NetworkKpiData = {
  gatewaysWithTraffic: 0,
  totalConfiguredGateways: 0,
  uniqueMetersSeen: 0,
  configuredMeters: 0,
  framesReceived: 0,
  framesTrend: '',
  lastFrameAge: '—',
  multiGatewayMeters: 0,
  avgRssi: 0,
  avgSnr: 0,
};

const METERS_PAGE_SIZE = 100;
const EMPTY_METERS_PAGE: GatewayMetersPage = { content: [], page: 0, size: METERS_PAGE_SIZE, total: 0, totalPages: 0 };

function daysFor(range: TimeWindow): number {
  return range === '30D' ? 30 : range === '7D' ? 7 : 1;
}

// a day as YYYY-MM-DD on the clock of this browser; only the first guess of the custom range, the server cuts the real days
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toLocaleDateString('en-CA');
}

export function CommandCenterPage() {
  const [activeMode, setActiveMode] = useState<'Gateways' | 'Meters'>('Gateways');
  const [timeRange, setTimeRange] = useState<TimeWindow>('7D');
  const [customRange, setCustomRange] = useState<CustomRange>({ from: isoDaysAgo(6), to: isoDaysAgo(0) });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(null);
  const [gatewayTab, setGatewayTab] = useState<GatewayTabType>('METERS');
  const [selectedMeter, setSelectedMeter] = useState<MeterTelemetryItem | null>(null);
  // the frame whose details are open, and the meter whose whole frame history replaces the workspace
  const [inspectedFrame, setInspectedFrame] = useState<RawFrameItem | null>(null);
  const [framesMeter, setFramesMeter] = useState<MeterTelemetryItem | null>(null);

  // Dynamic Site Selector State
  const [selectedSiteId, setSelectedSiteId] = useState<string>('ALL');
  const [sites, setSites] = useState<Array<{ id: string; name: string; parentId?: string | null }>>([{ id: 'ALL', name: 'All Sites' }]);

  // Load available sites from backend
  useEffect(() => {
    fetchSites().then((res) => {
      if (res && res.length > 0) {
        setSites(res);
      }
    }).catch(() => {});
  }, []);

  // Live Summary State with 0ms Stale-While-Revalidate from LocalStorage Cache
  const [summaryData, setSummaryData] = useState<TelemetrySummaryResponse | null>(() => {
    return getLocalCachedSummary(7, undefined, 'ALL') || null;
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(!summaryData);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Background fetch routine (supports 1H, 6H, 24H, 7D, 30D and site filtering)
  const loadSummary = useCallback(async (forceRefresh = false) => {
    setIsSyncing(true);
    try {
      const live = await fetchCommandCenterSummary(
        daysFor(timeRange),
        undefined,
        forceRefresh,
        selectedSiteId,
        timeRange === 'CUSTOM' ? customRange : undefined
      );
      setSummaryData(live);
      setLoadError(null);
    } catch (err) {
      console.warn('[CommandCenter] Live summary could not be loaded:', err);
      setLoadError(err instanceof Error ? err.message : 'Live data could not be loaded');
    } finally {
      setIsSyncing(false);
    }
  }, [timeRange, customRange, selectedSiteId]);

  // Sync on mount or when timeRange or selectedSiteId changes
  useEffect(() => {
    loadSummary(false);
  }, [loadSummary]);

  // Periodic background refresh (every 45s)
  useEffect(() => {
    const autoSync = setInterval(() => {
      loadSummary(false);
    }, 45000);

    return () => {
      clearInterval(autoSync);
    };
  }, [loadSummary]);

  // Derived Gateways list
  const currentGateways = useMemo(() => summaryData?.gateways ?? NO_GATEWAYS, [summaryData]);

  // the window and site the per-gateway tabs (Traffic, Radio Health) cover
  const gatewayScope = {
    days: daysFor(timeRange),
    custom: timeRange === 'CUSTOM' ? customRange : undefined,
    siteId: selectedSiteId,
  };
  const windowText = timeRange === 'CUSTOM' ? `${customRange.from} → ${customRange.to}` : timeRange;

  // Ensure an active gateway is selected once gateways are known
  useEffect(() => {
    if (!selectedGatewayId && currentGateways.length > 0) {
      setSelectedGatewayId(currentGateways[0].gatewayId);
    }
  }, [currentGateways, selectedGatewayId]);

  // Derived KPIs
  const currentKpis = useMemo(() => {
    return summaryData?.kpis || EMPTY_KPIS;
  }, [summaryData]);

  // Derived Raw Frames for live feed and tables
  const allFrames = useMemo<RawFrameItem[]>(() => summaryData?.recentFrames ?? NO_FRAMES, [summaryData]);

  // Currently selected gateway item
  const currentGateway = useMemo(() => {
    if (!selectedGatewayId) return null;
    return currentGateways.find((g) => g.gatewayId === selectedGatewayId) || null;
  }, [selectedGatewayId, currentGateways]);

  // Meters observed by the selected gateway: one server-side page at a time
  const [metersPage, setMetersPage] = useState(0);
  const [metersFilter, setMetersFilter] = useState<MeterFilterKey>('ALL');
  const [metersData, setMetersData] = useState<GatewayMetersPage>(EMPTY_METERS_PAGE);
  const [metersLoading, setMetersLoading] = useState(false);

  // a different gateway, filter, window or site starts again at the first page
  useEffect(() => {
    setMetersPage(0);
  }, [selectedGatewayId, metersFilter, timeRange, customRange, selectedSiteId]);

  const summaryStamp = summaryData?.generatedAt;
  useEffect(() => {
    if (!selectedGatewayId) {
      setMetersData(EMPTY_METERS_PAGE);
      return;
    }
    let cancelled = false;
    setMetersLoading(true);
    fetchGatewayMeters(selectedGatewayId, {
      days: daysFor(timeRange),
      page: metersPage,
      size: METERS_PAGE_SIZE,
      filter: metersFilter,
      custom: timeRange === 'CUSTOM' ? customRange : undefined,
      siteId: selectedSiteId,
    })
      .then((res) => {
        if (!cancelled) setMetersData(res);
      })
      .catch((err) => {
        console.warn('[CommandCenter] Could not load gateway meters:', err);
        if (!cancelled) setMetersData(EMPTY_METERS_PAGE);
      })
      .finally(() => {
        if (!cancelled) setMetersLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // summaryStamp: the table refreshes together with the 45 s summary refresh
  }, [selectedGatewayId, metersPage, metersFilter, timeRange, customRange, selectedSiteId, summaryStamp]);

  // Handle selecting a meter from table or feed
  const handleSelectMeter = (meter: MeterTelemetryItem) => {
    setSelectedMeter(meter);
  };

  const handleSelectMeterById = async (meterId: string) => {
    try {
      // an exact lookup first: it finds the meter whatever the search limit, and tells the gateway that heard it last
      const exact = await fetchMeter(meterId, gatewayScope);
      if (exact) {
        setSelectedMeter(exact.meter);
        return;
      }
    } catch (err) {
      console.warn('[CommandCenter] Exact meter lookup failed, trying the search:', err);
    }
    try {
      const found = (
        await searchMeters(meterId, daysFor(timeRange), timeRange === 'CUSTOM' ? customRange : undefined, selectedSiteId)
      ).find((m) => m.meterId === meterId);
      if (found) {
        setSelectedMeter(found);
        return;
      }
    } catch (err) {
      console.warn('[CommandCenter] Meter lookup failed, using the frame instead:', err);
    }
    // Fallback: construct synthesized item from frame
    const frame = allFrames.find((f) => f.meterId === meterId);
    if (frame) {
      setSelectedMeter({
        meterId: frame.meterId,
        devEui: frame.devEui,
        lastSeenDate: frame.decodedAt,
        frameAge: 'just now',
        frames1H: 1,
        frames24H: 1,
        lastRssi: frame.rssi,
        lastSnr: frame.snr,
        fCnt: frame.fCnt,
        fPort: frame.fPort,
        frequency: frame.frequency,
        dr: frame.dr,
        adr: frame.adr,
        confirmed: frame.confirmed,
        otherGatewaysCount: 0,
        statusChips: ['live'],
        gatewaysHeard: [
          {
            gatewayId: frame.gatewayId,
            alias: frame.gatewayAlias,
            rssi: frame.rssi,
            snr: frame.snr,
            lastSeenText: 'just now',
            isLatest: true,
          },
        ],
      });
    }
  };

  const findGatewayByQuery = useCallback(
    (q: string) => {
      const query = q.toLowerCase();
      return currentGateways.find(
        (g) => g.alias.toLowerCase().includes(query) || g.gatewayId.toLowerCase().includes(query)
      );
    },
    [currentGateways]
  );

  // Global search handler: a gateway matches at once, a meter is looked up on the server once typing pauses
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    const query = q.trim();
    if (!query) return;
    const gw = findGatewayByQuery(query);
    if (gw) {
      setSelectedGatewayId(gw.gatewayId);
      setGatewayTab('METERS');
    }
  };

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 3 || findGatewayByQuery(query)) return;
    const timer = setTimeout(async () => {
      try {
        const found = await searchMeters(query, daysFor(timeRange), timeRange === 'CUSTOM' ? customRange : undefined, selectedSiteId);
        if (found.length > 0) {
          setSelectedGatewayId(found[0].gatewayId);
          setSelectedMeter(found[0]);
          setGatewayTab('METERS');
        }
      } catch (err) {
        console.warn('[CommandCenter] Meter search failed:', err);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, timeRange, customRange, selectedSiteId, findGatewayByQuery]);

  return (
    <div className="cc-container">
      {/* Top Command Bar with Live Stream Sync Status */}
      <CommandCenterToolbar
        activeTab={activeMode}
        onTabChange={setActiveMode}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        customRange={customRange}
        maxDate={summaryData?.dateRange?.toDate}
        onCustomRangeChange={setCustomRange}
        searchQuery={searchQuery}
        onSearchChange={handleSearch}
        sites={sites}
        selectedSiteId={selectedSiteId}
        onSiteChange={setSelectedSiteId}
      />

      {/* Network Health 8-KPI Strip with Skeleton Loaders */}
      {loadError && (
        <div className="cc-error-banner" role="alert">
          {summaryData
            ? 'Live data could not be refreshed — showing the last data received.'
            : 'Live data could not be loaded.'}
        </div>
      )}

      <NetworkKpiStrip
        kpis={currentKpis}
        loading={isSyncing && !summaryData}
        windowText={windowText}
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
          {framesMeter ? (
            <MeterFramesView
              meter={framesMeter}
              win={gatewayScope}
              onBack={() => setFramesMeter(null)}
              onInspectFrame={setInspectedFrame}
            />
          ) : activeMode === 'Meters' ? (
            <FleetMetersTable
              win={gatewayScope}
              siteId={selectedSiteId}
              selectedMeterId={selectedMeter?.meterId || null}
              onSelectMeter={handleSelectMeter}
              expectedTotal={currentKpis.uniqueMetersSeen}
              refreshToken={summaryStamp}
            />
          ) : currentGateway ? (
            <>
              <SelectedGatewayHeader
                gateway={currentGateway}
                activeTab={gatewayTab}
                onTabChange={setGatewayTab}
                windowText={windowText}
              />

              {gatewayTab === 'METERS' && (
                <GatewayMetersTable
                  meters={metersData.content}
                  total={metersData.total}
                  page={metersPage}
                  pageSize={METERS_PAGE_SIZE}
                  totalPages={metersData.totalPages}
                  loading={metersLoading}
                  filter={metersFilter}
                  onFilterChange={setMetersFilter}
                  onPageChange={setMetersPage}
                  selectedMeterId={selectedMeter?.meterId || null}
                  onSelectMeter={handleSelectMeter}
                />
              )}

              {gatewayTab === 'FRAMES' && (
                <GatewayFramesPanel
                  gatewayId={currentGateway.gatewayId}
                  gatewayAlias={currentGateway.alias}
                  win={gatewayScope}
                  refreshToken={summaryStamp}
                  onSelectFrameMeter={handleSelectMeterById}
                  onInspectFrame={setInspectedFrame}
                  paused={!!inspectedFrame}
                />
              )}

              {gatewayTab === 'TRAFFIC' && (
                <GatewayTrafficView
                  win={gatewayScope}
                  siteId={selectedSiteId}
                  gateway={{ gatewayId: currentGateway.gatewayId, alias: currentGateway.alias }}
                  allGateways={currentGateways}
                  refreshToken={summaryStamp}
                />
              )}

              {gatewayTab === 'RADIO' && (
                <GatewayRadioHealth
                  win={gatewayScope}
                  siteId={selectedSiteId}
                  gateway={{ gatewayId: currentGateway.gatewayId, alias: currentGateway.alias }}
                  refreshToken={summaryStamp}
                  onSelectMeter={handleSelectMeterById}
                />
              )}
            </>
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
            onViewFrames={setFramesMeter}
          />
        )}
      </div>

      {inspectedFrame && (
        <FrameDetailDrawer
          frame={inspectedFrame}
          onClose={() => setInspectedFrame(null)}
          onOpenMeter={handleSelectMeterById}
        />
      )}

      {/* Bottom: Live Network Telemetry Feed */}
      <LiveNetworkFeed
        frames={allFrames}
        metersReporting={currentKpis.uniqueMetersSeen}
        onSelectMeter={handleSelectMeterById}
      />
    </div>
  );
}

export default CommandCenterPage;
