import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Zap,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
  Info,
} from 'lucide-react';
import { runtimeConfig } from '@/config/runtimeConfig';
import { useGoogleMaps } from '../../shared/useGoogleMaps';
import type { GisMeter } from '../../shared/gisData';
import type { BoundingBox } from '../../shared/spatialIndex';
import { mapApi } from '@/services/api/mapApi';
import { networkApi, type NetGateway, type NetMeter, type NetMeterStatus, type NetSiteOption } from '@/services/api/networkApi';
import { gatewayStatusApi, type GatewayState } from '@/services/api/gatewayStatusApi';
import type { ExistingMode, GatewayCandidate, GatewayPlacementResult } from '../../shared/mapTypes';
import { GatewayCandidateDrawer } from '../components/GatewayCandidateDrawer';
import { explainPlan, plural } from '../placementModel';
import { MeterHistoryDrawer } from '../../shared/MeterHistoryDrawer';
import { createMeterLayer, type LayerItem, type MeterLayer } from '../../shared/meterCanvasLayer';
import { getDecibelBorder } from '../../shared/meterColorUtils';
import { getGatewayMapMarkerIcon, getGatewaySvg } from '../../shared/gatewayIconUtils';
import { isUnauthorized } from '../../shared/meterDetailModel';
import { SiteTreeSelect } from '@/modules/command-center/components/SiteTreeSelect';
import { useNetworkData } from '../../network/hooks/useNetworkData';
import { distanceM } from '../../network/coverage';
import {
  METER_STATUS_STYLE,
  gatewayLabel,
  toGisMeter,
  trimmedBounds,
  unionBounds,
  type MeterPoint,
} from '../../network/networkModel';
import { presetRange } from '../../gateway-status/gatewayStatusModel';
import '../../shared/gis.css';

// Where the map looks before any data has arrived: a neutral overview of India, not a customer's city. As soon as the
// meters and gateways of the chosen site are loaded the map fits them (same as the Network Explorer).
const INITIAL_VIEW = { center: { lat: 22.5, lng: 80 }, zoom: 5 };

const STATUS_ORDER: NetMeterStatus[] = ['connected', 'disconnected', 'never'];

// Radius choices in the dropdown; the slider next to it allows any value in between.
const RADIUS_PRESETS = [300, 500, 800, 1000, 1500, 2000];
const RADIUS_MIN = 100;
const RADIUS_MAX = 3000;
const RADIUS_STEP = 50;

/** The gateway icon set knows reporting / degraded / stale / offline. */
function existingIconStatus(gw: NetGateway, state: GatewayState | undefined): string {
  if (state === 'online') return 'reporting';
  if (state === 'offline') return 'offline';
  if (state === 'no-data') return 'stale';
  return gw.status === 'no-traffic' ? 'stale' : gw.status;
}
const STATE_LABEL: Record<GatewayState, string> = { online: 'Online', offline: 'Offline', 'no-data': 'No data' };

const EXISTING_MODE_LABEL: Record<ExistingMode, string> = {
  all: 'Count all existing gateways',
  working: 'Count only working gateways',
  none: 'Ignore existing gateways',
};
const TARGET_CHOICES = [100, 99, 95, 90, 80];

export function GatewayPlacementPage() {
  const navigate = useNavigate();
  const apiKey = runtimeConfig.GOOGLE_MAPS_API_KEY;
  const { isLoaded } = useGoogleMaps(apiKey);

  // The site picker is the same tree as the Network Explorer's: a site, several sites, or all, each with its sub-sites.
  const [siteId, setSiteId] = useState<string>('ALL');
  const [sites, setSites] = useState<NetSiteOption[]>([]);

  // Control State
  const [gatewayCount, setGatewayCount] = useState<number>(5);
  const [coverageRadiusM, setCoverageRadiusM] = useState<number>(500);
  // Options: how existing gateways count, the least a new gateway must bring (null = automatic), and when to stop.
  const [existingMode, setExistingMode] = useState<ExistingMode>('all');
  const [minNewMeters, setMinNewMeters] = useState<number | null>(null);
  const [targetCoverage, setTargetCoverage] = useState<number>(100);
  const [showOptions, setShowOptions] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Parts of the answer that could not be loaded while the rest could (shown as a note, not as an empty map).
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);
  // Each run gets a number; an answer that arrives after a newer run started is ignored.
  const runIdRef = useRef(0);

  // Layer Toggles
  const [showMeters, setShowMeters] = useState<boolean>(true);
  const [enableClustering, setEnableClustering] = useState<boolean>(true);
  const [showRadiusCircles, setShowRadiusCircles] = useState<boolean>(true);
  const [showExistingGateways, setShowExistingGateways] = useState<boolean>(true);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState<boolean>(false);
  const [isLegendOpen, setIsLegendOpen] = useState<boolean>(false);

  // Data State
  const [placementResult, setPlacementResult] = useState<GatewayPlacementResult | null>(null);
  const [candidates, setCandidates] = useState<GatewayCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<GatewayCandidate | null>(null);
  const [selectedMeter, setSelectedMeter] = useState<GisMeter | null>(null);
  // Gateway Status: the place (address) and live state of each existing gateway, by gateway id.
  const [gatewayStatus, setGatewayStatus] = useState<Map<string, { address: string | null; state: GatewayState }>>(new Map());
  const [gatewayStatusUnavailable, setGatewayStatusUnavailable] = useState(false);

  // Meters and existing gateways come from the same source and hook as the Network Explorer, so both pages show the same
  // meters, the same counts and the same saved copy.
  const data = useNetworkData(siteId, sites);
  const { gateways, points, summary, coordinates } = data;

  // Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const existingMarkersRef = useRef<any[]>([]);
  const candidateMarkersRef = useRef<any[]>([]);
  const candidateCirclesRef = useRef<any[]>([]);
  const meterLayerRef = useRef<MeterLayer<MeterPoint> | null>(null);
  const infoWindowRef = useRef<any>(null);
  const fittedForRef = useRef<string | null>(null);

  const currentSiteName = sites.find((s) => s.id === siteId)?.name ?? (siteId === 'ALL' ? 'All sites' : 'Selected sites');

  // The sign-in ended: go to the login screen instead of leaving a page whose buttons can never work.
  useEffect(() => {
    if (data.sessionExpired) navigate('/login', { replace: true });
  }, [data.sessionExpired, navigate]);

  // ---- the site list, from the same tree the Dashboard and the Network Explorer filter by ----
  useEffect(() => {
    const ctl = new AbortController();
    networkApi
      .listSites(ctl.signal)
      .then((list) => {
        setSites(list.filter((s) => s.id !== 'ALL'));
      })
      .catch((e) => {
        if (isUnauthorized(e)) navigate('/login', { replace: true });
        setSites([]);
      });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Gateway Status: the place and the live state of every gateway (one call, today) ----
  useEffect(() => {
    const ctl = new AbortController();
    gatewayStatusApi
      .report(presetRange('1D'), ctl.signal)
      .then((r) => setGatewayStatus(new Map(r.gateways.map((g) => [g.gatewayId, { address: g.address, state: g.status }]))))
      .catch((e) => {
        if (ctl.signal.aborted) return;
        if (isUnauthorized(e)) navigate('/login', { replace: true });
        setGatewayStatusUnavailable(true);
      });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gatewayById = useMemo(() => new Map(gateways.map((g) => [g.gatewayId, g])), [gateways]);
  /** A gateway's name for people: the place Gateway Status reports, else its stored name / address, else its id. */
  const labelFor = useCallback(
    (id: string) => {
      const place = gatewayStatus.get(id)?.address?.trim();
      if (place) return place;
      const gw = gatewayById.get(id);
      return gw ? gatewayLabel(gw) : id;
    },
    [gatewayStatus, gatewayById]
  );

  // "Nearest existing" is worked out here from the same gateway list that is drawn on the map, and named by its place from
  // Gateway Status. (The placement service names it by whatever the gateway's stored name is, sometimes just its id.)
  const displayCandidates = useMemo(
    () =>
      candidates.map((c) => {
        if (gateways.length === 0) return c;
        let best: { id: string; d: number } | null = null;
        for (const gw of gateways) {
          const d = distanceM(c.latitude, c.longitude, gw.lat, gw.lng);
          if (!best || d < best.d) best = { id: gw.gatewayId, d };
        }
        return best
          ? { ...c, nearestExistingName: labelFor(best.id), nearestExistingDistanceM: Math.round(best.d * 10) / 10 }
          : c;
      }),
    [candidates, gateways, labelFor]
  );
  const selectedDisplay = useMemo(
    () => (selectedCandidate ? displayCandidates.find((c) => c.gatewayNumber === selectedCandidate.gatewayNumber) ?? selectedCandidate : null),
    [selectedCandidate, displayCandidates]
  );

  // Initialize Map
  useEffect(() => {
    if (!isLoaded || !mapContainerRef.current || mapInstanceRef.current) return;
    const google = (window as any).google;
    if (!google?.maps) return;

    const map = new google.maps.Map(mapContainerRef.current, {
      center: INITIAL_VIEW.center,
      zoom: INITIAL_VIEW.zoom,
      minZoom: 3,
      maxZoom: 20,
      mapTypeId: 'roadmap',
      mapTypeControl: true,
      mapTypeControlOptions: {
        position: google.maps.ControlPosition.TOP_LEFT,
      },
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
      gestureHandling: 'greedy',
      styles: [
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
      ],
    });
    infoWindowRef.current = new google.maps.InfoWindow();
    mapInstanceRef.current = map;

    // Meters are drawn on one canvas (see shared/meterCanvasLayer.ts), exactly as in the Network Explorer; clicks on it are
    // resolved there.
    meterLayerRef.current = createMeterLayer<MeterPoint>(google, map, {
      onClick: (hit) => {
        infoWindowRef.current?.close();
        if (!hit) {
          setSelectedMeter(null);
          return;
        }
        if (hit.kind === 'point') {
          setSelectedCandidate(null);
          void openMeterRef.current(hit.item.ref);
        } else if (hit.sameSpot) {
          map.setCenter({ lat: hit.bounds.north, lng: hit.bounds.east });
          map.setZoom(Math.min((map.getZoom() ?? 10) + 3, 20));
        } else {
          map.fitBounds({ north: hit.bounds.north, south: hit.bounds.south, east: hit.bounds.east, west: hit.bounds.west }, 60);
        }
      },
    });
  }, [isLoaded]);

  const fitMapTo = useCallback((box: BoundingBox) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (box.minLat === box.maxLat && box.minLng === box.maxLng) {
      map.setCenter({ lat: box.minLat, lng: box.minLng });
      map.setZoom(15);
    } else {
      map.fitBounds({ north: box.maxLat, south: box.minLat, east: box.maxLng, west: box.minLng }, 40);
    }
  }, []);

  // Fit the map to the data once per site selection (not on every background refresh, which would undo the user's panning).
  useEffect(() => {
    if (!isLoaded || !mapInstanceRef.current || fittedForRef.current === siteId) return;
    if (data.loadedSiteId !== siteId) return; // still showing the previous selection's data
    const box = unionBounds(trimmedBounds(points), trimmedBounds(gateways));
    if (!box) return;
    fittedForRef.current = siteId;
    fitMapTo(box);
  }, [isLoaded, siteId, data.loadedSiteId, points, gateways, fitMapTo]);

  // ---- opening a meter: instantly from what the map knows, then completed from the server (as in the Network Explorer) ----
  const openMeter = useCallback(
    async (p: MeterPoint) => {
      const gw = p.gatewayId ? gatewayById.get(p.gatewayId) ?? null : null;
      const partial: NetMeter = {
        meterId: p.meterId, assetId: p.assetId, devEui: null, consumerName: null, householdId: null, locality: null, ward: null,
        zone: null, dma: null, siteId: null, siteName: null, lat: p.lat, lng: p.lng, gatewayId: p.gatewayId, distanceToGatewayM: null,
        status: p.status, rssi: p.rssi, snr: p.snr, lastSeen: null, currentReadingKl: null,
      };
      setSelectedMeter(toGisMeter(partial, gw));
      try {
        const page = await networkApi.listMeters({ siteId, search: p.meterId, limit: 5 });
        const full = page.items.find((i) => i.meterId === p.meterId);
        if (full) setSelectedMeter((cur) => (cur && cur.meterId === p.meterId ? toGisMeter(full, gw) : cur));
      } catch {
        // the drawer keeps what the map knows; it loads its own details from the server as well
      }
    },
    [siteId, gatewayById]
  );
  const openMeterRef = useRef(openMeter);
  openMeterRef.current = openMeter;

  // ---- computing the placement ----
  // A new site starts from a clean slate: nothing from the previous one stays on screen, and a run still in flight for it is dropped.
  useEffect(() => {
    runIdRef.current++;
    setIsLoading(false);
    setLoadError(null);
    setLoadWarnings([]);
    setPlacementResult(null);
    setCandidates([]);
    setSelectedCandidate(null);
    setSelectedMeter(null);
  }, [siteId]);

  const handleGenerate = useCallback(async () => {
    const runId = ++runIdRef.current;
    setIsLoading(true);
    setLoadError(null);
    setLoadWarnings([]);

    try {
      const res = await mapApi.computeGatewayPlacement(siteId, gatewayCount, coverageRadiusM, {
        minNewMeters,
        targetCoveragePercent: targetCoverage,
        existingMode,
      });
      if (runId !== runIdRef.current) return; // a newer run (e.g. another site) has started
      if (!res || !Array.isArray(res.gateways)) throw new Error('The placement service returned no result');
      setPlacementResult(res);
      setCandidates(res.gateways);
      if (res.coordinatesStatus === 'stale') {
        setLoadWarnings(['Meter positions could not be refreshed; the plan uses the last known positions.']);
      }
    } catch (err: any) {
      if (runId !== runIdRef.current) return;
      if (isUnauthorized(err)) {
        navigate('/login', { replace: true });
        return;
      }
      console.error('[GatewayPlacement] Computation error:', err);
      setLoadError(err.message || 'Failed to compute gateway placement');
    } finally {
      if (runId === runIdRef.current) setIsLoading(false);
    }
  }, [siteId, gatewayCount, coverageRadiusM, minNewMeters, targetCoverage, existingMode, navigate]);

  // Compute once for every new site selection (and again with the Generate button).
  const generateRef = useRef(handleGenerate);
  generateRef.current = handleGenerate;
  useEffect(() => {
    void generateRef.current();
  }, [siteId]);

  // Fly to candidate coordinates
  const flyToCandidate = (lat: number, lng: number) => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.panTo({ lat, lng });
    mapInstanceRef.current.setZoom(14);
  };

  // The circles show the radius the candidates were computed for, not whatever the slider says now.
  const appliedRadiusM = placementResult?.coverageRadiusM ?? coverageRadiusM;

  // Render Gateways (Existing + Recommended Candidates). There are only a few dozen of these, so plain markers are fine;
  // the thousands of meters are on the canvas layer below.
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded) return;
    const google = (window as any).google;
    if (!google?.maps) return;
    const map = mapInstanceRef.current;

    // 1. Clear previous candidate markers & circles
    candidateMarkersRef.current.forEach((m) => m.setMap(null));
    candidateMarkersRef.current = [];
    candidateCirclesRef.current.forEach((c) => c.setMap(null));
    candidateCirclesRef.current = [];

    // 2. Clear existing gateway markers
    existingMarkersRef.current.forEach((m) => m.setMap(null));
    existingMarkersRef.current = [];
    infoWindowRef.current?.close();

    // 3. Render Existing Gateways, coloured by their live state from Gateway Status
    if (showExistingGateways) {
      gateways.forEach((gw) => {
        const state = gatewayStatus.get(gw.gatewayId)?.state;
        const marker = new google.maps.Marker({
          position: { lat: gw.lat, lng: gw.lng },
          map,
          title: labelFor(gw.gatewayId),
          icon: getGatewayMapMarkerIcon(existingIconStatus(gw, state), 1.1),
          zIndex: 9999,
        });

        marker.addListener('click', () => {
          // Built as DOM nodes with textContent: names and addresses come from upstream and must never be read as HTML.
          const infoEl = document.createElement('div');
          infoEl.style.cssText = 'padding:4px 8px;font-family:sans-serif;';
          const nameEl = document.createElement('strong');
          nameEl.textContent = labelFor(gw.gatewayId);
          const subEl = document.createElement('span');
          subEl.style.cssText = 'font-size:11px;color:#64748b';
          subEl.textContent = `Existing Gateway${state ? ` · ${STATE_LABEL[state]}` : ''} · ${gw.gatewayId}`;
          infoEl.append(nameEl, document.createElement('br'), subEl);
          infoWindowRef.current?.setContent(infoEl);
          infoWindowRef.current?.open(map, marker);
        });

        existingMarkersRef.current.push(marker);
      });
    }

    // 4. Render Recommended Gateways & Coverage Circles
    displayCandidates.forEach((cand) => {
      // Coverage circle
      if (showRadiusCircles) {
        const circle = new google.maps.Circle({
          strokeColor: '#EA580C',
          strokeOpacity: 0.85,
          strokeWeight: 2,
          fillColor: '#FB923C',
          fillOpacity: 0.18,
          map,
          center: { lat: cand.latitude, lng: cand.longitude },
          radius: appliedRadiusM,
          clickable: false,
        });
        candidateCirclesRef.current.push(circle);
      }

      // Circular numbered badge marker [ 1 ], [ 2 ], etc.
      const marker = new google.maps.Marker({
        position: { lat: cand.latitude, lng: cand.longitude },
        map,
        title: `Recommended Gateway #${cand.gatewayNumber}`,
        zIndex: 10000,
        label: {
          text: String(cand.gatewayNumber),
          color: '#ffffff',
          fontWeight: '700',
          fontSize: '13px',
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#EA580C',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 2.5,
          scale: 16,
        },
      });

      marker.addListener('click', () => {
        setSelectedMeter(null);
        setSelectedCandidate(cand);
        flyToCandidate(cand.latitude, cand.longitude);
      });

      candidateMarkersRef.current.push(marker);
    });
  }, [isLoaded, displayCandidates, gateways, gatewayStatus, labelFor, appliedRadiusM, showRadiusCircles, showExistingGateways]);

  // Meters: one canvas layer (no marker per meter), so the map stays smooth at any zoom. Same colours as the Network Explorer:
  // fill = how recently the meter reported, border = signal strength.
  const meterItems = useMemo<LayerItem<MeterPoint>[]>(
    () =>
      points.map((p) => {
        const border = getDecibelBorder(p.rssi ?? undefined);
        return { id: p.meterId, lat: p.lat, lng: p.lng, fill: METER_STATUS_STYLE[p.status].color, stroke: border.strokeColor, strokeWidth: border.strokeWeight, ref: p };
      }),
    [points]
  );
  useEffect(() => {
    meterLayerRef.current?.setItems(showMeters ? meterItems : []);
  }, [meterItems, showMeters, isLoaded]);
  useEffect(() => {
    meterLayerRef.current?.setClustering(enableClustering);
  }, [enableClustering, isLoaded]);
  useEffect(() => {
    meterLayerRef.current?.setSelected(selectedMeter ? selectedMeter.meterId : null);
  }, [selectedMeter]);
  useEffect(() => {
    return () => {
      meterLayerRef.current?.destroy();
      meterLayerRef.current = null;
    };
  }, []);

  // ---- notes shown to the user ----
  const sidebarWarnings = [
    ...loadWarnings,
    ...(gatewayStatusUnavailable ? ['Gateway Status is not available, so gateway names come from the network list and their state is not shown.'] : []),
  ];
  const planNote = placementResult ? explainPlan(placementResult) : null;
  /** "95% → 11 gateways" for the levels the curve reaches. */
  const neededFor = placementResult?.gatewaysFor
    ? (['90', '95', '100'] as const).map((level) => {
        const n = placementResult.gatewaysFor![level];
        const followed = Math.max(0, (placementResult.curve?.length ?? 1) - 1);
        return { level, text: n == null ? `more than ${followed}` : String(n) };
      })
    : null;
  const maxCandidateGain = Math.max(1, ...displayCandidates.map((c) => c.metersCoveredCount));

  // Coverage statistics calculations
  // null until a plan is in: shown as "—", never guessed.
  const totalMeters = placementResult?.totalMeters ?? null;
  const totalCovered = placementResult?.totalMetersCovered ?? 0;
  const overallPercent = placementResult?.overallCoveragePercent ?? null;
  const beforePercent = placementResult?.coverageBeforePercent ?? null;
  const percentColor = overallPercent == null ? '#64748b' : overallPercent >= 80 ? '#059669' : overallPercent >= 50 ? '#d97706' : '#dc2626';
  const fmtMetres = (v: number | null | undefined) => (v == null ? '—' : `${v}m`);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', margin: -20, position: 'relative' }}>
      {/* 1. TOP HEADER BAR matching Cognecto Beta 1:1 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        zIndex: 20,
        gap: 16,
        flexWrap: 'wrap',
      }}>
        {/* Left: Title & Site picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={18} color="#2563eb" />
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Gateway Placement Report
            </h1>
          </div>

          {/* Site picker: the same tree as the Network Explorer (a site includes its sub-sites) */}
          <SiteTreeSelect
            sites={sites}
            value={siteId}
            onChange={setSiteId}
          />
        </div>

        {/* Center: Controls (Gateways stepper & Radius stepper) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Gateways Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}
              title="The most new gateways to place. Fewer are recommended when fewer are worth building."
            >
              Max gateways
            </span>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              background: '#ffffff',
              overflow: 'hidden',
            }}>
              <input
                type="number"
                min={1}
                max={25}
                value={gatewayCount}
                onChange={(e) => {
                  if (e.target.value === '') return;
                  setGatewayCount(Math.max(1, Math.min(25, Math.round(Number(e.target.value)) || 1)));
                }}
                style={{
                  width: 44,
                  padding: '5px 8px',
                  border: 'none',
                  outline: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: 'center',
                  color: '#0f172a',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid #cbd5e1' }}>
                <button
                  onClick={() => setGatewayCount((c) => Math.min(25, c + 1))}
                  style={{ border: 'none', background: 'transparent', padding: '1px 5px', cursor: 'pointer', display: 'flex' }}
                >
                  <ChevronUp size={11} />
                </button>
                <button
                  onClick={() => setGatewayCount((c) => Math.max(1, c - 1))}
                  style={{ border: 'none', background: 'transparent', padding: '1px 5px', cursor: 'pointer', display: 'flex' }}
                >
                  <ChevronDown size={11} />
                </button>
              </div>
            </div>
          </div>

          {/* Radius: quick choices in the dropdown, any value in between with the slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
              Radius
            </span>
            <div style={{ position: 'relative' }}>
              <select
                value={RADIUS_PRESETS.includes(coverageRadiusM) ? coverageRadiusM : 'custom'}
                onChange={(e) => {
                  if (e.target.value !== 'custom') setCoverageRadiusM(Number(e.target.value));
                }}
                style={{
                  padding: '5px 26px 5px 10px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#0f172a',
                  cursor: 'pointer',
                  appearance: 'none',
                }}
              >
                {RADIUS_PRESETS.map((r) => (
                  <option key={r} value={r}>{r} m</option>
                ))}
                {!RADIUS_PRESETS.includes(coverageRadiusM) && <option value="custom">{coverageRadiusM} m (custom)</option>}
              </select>
              <ChevronDown
                size={14}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748b' }}
              />
            </div>
            <input
              type="range"
              min={RADIUS_MIN}
              max={RADIUS_MAX}
              step={RADIUS_STEP}
              value={coverageRadiusM}
              onChange={(e) => setCoverageRadiusM(Number(e.target.value))}
              aria-label="Custom coverage radius in metres"
              title={`Custom radius: ${coverageRadiusM} m`}
              style={{ width: 120, cursor: 'pointer' }}
            />
          </div>
        </div>

        {/* Right: Options + Primary Generate Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setShowOptions((v) => !v)}
            className="cw-button-secondary"
            aria-expanded={showOptions}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600 }}
          >
            Options {showOptions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={handleGenerate}
            disabled={isLoading}
            className="cw-button-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)',
            }}
          >
            {isLoading ? (
              <RefreshCw size={15} className="cw-spin" />
            ) : (
              <Zap size={15} />
            )}
            <span>Generate</span>
          </button>
        </div>
      </div>

      {/* Options: how existing gateways count, the least a new gateway must bring, and when to stop */}
      {showOptions && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          flexWrap: 'wrap',
          padding: '8px 20px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          fontSize: 12,
          color: '#334155',
          zIndex: 19,
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, color: '#64748b' }}>Existing gateways</span>
            <select
              value={existingMode}
              onChange={(e) => setExistingMode(e.target.value as ExistingMode)}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
              title="Meters an existing gateway already reaches need no new gateway"
            >
              {(Object.keys(EXISTING_MODE_LABEL) as ExistingMode[]).map((m) => (
                <option key={m} value={m}>{EXISTING_MODE_LABEL[m]}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, color: '#64748b' }}>Min. new meters per gateway</span>
            <input
              type="number"
              min={1}
              value={minNewMeters ?? ''}
              placeholder={`auto${placementResult?.minNewMetersUsed && minNewMeters == null ? ` (${placementResult.minNewMetersUsed})` : ''}`}
              onChange={(e) => {
                const v = e.target.value.trim();
                setMinNewMeters(v === '' ? null : Math.max(1, Math.round(Number(v)) || 1));
              }}
              style={{ width: 90, padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
              title="A gateway is only recommended when it brings at least this many meters into reach. Empty = automatic (about 0.5% of the meters)."
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, color: '#64748b' }}>Stop at coverage</span>
            <select
              value={targetCoverage}
              onChange={(e) => setTargetCoverage(Number(e.target.value))}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
            >
              {TARGET_CHOICES.map((t) => (
                <option key={t} value={t}>{t}%</option>
              ))}
            </select>
          </label>
          <span style={{ color: '#94a3b8' }}>Changes apply on Generate.</span>
        </div>
      )}

      {/* 2. BODY CONTENT: MAP (LEFT) + RECOMMENDED GATEWAYS SIDEBAR (RIGHT) */}
      <div style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Left Map View */}
        <div style={{ flex: 1, position: 'relative', height: '100%' }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

          {/* Nothing to draw yet: say what is being waited for. Quiet background refreshes only show the thin bar. */}
          {!data.metersReady && !data.gatewaysReady && (data.isLoading || !isLoaded) && (
            <div className="gis-loading-overlay" role="status" aria-live="polite">
              <div className="gis-loading-card">
                <div className="cw-spinner" />
                <div className="gis-loading-title">Loading network data…</div>
                <div className="gis-loading-steps">
                  {[
                    { label: 'Map', done: isLoaded },
                    { label: 'Gateways', done: data.gatewaysReady },
                    { label: 'Meters and their status', done: data.metersReady },
                  ].map((st) => (
                    <div key={st.label} className={`gis-loading-step ${st.done ? 'gis-loading-step--done' : ''}`}>
                      <span className="gis-loading-dot" />
                      <span>{st.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {(data.metersReady || data.gatewaysReady) && (data.isLoading || data.isShowingSavedCopy) && !data.metersError && !data.gatewaysError && (
            <div className="gis-loading-bar" role="progressbar" aria-label="Refreshing" />
          )}

          <div className="gis-map-notices">
            {data.isShowingSavedCopy && !data.metersError && !data.gatewaysError && (
              <div className="gis-map-notice">Showing the copy saved on your last visit, refreshing…</div>
            )}
            {data.metersError && (
              <div className="gis-map-notice gis-map-notice--error">
                {data.metersError} <button onClick={data.reload}>Retry</button>
              </div>
            )}
            {data.gatewaysError && (
              <div className="gis-map-notice gis-map-notice--error">
                {data.gatewaysError} <button onClick={data.reload}>Retry</button>
              </div>
            )}
            {coordinates?.status === 'unavailable' && (
              <div className="gis-map-notice gis-map-notice--warn">Meter positions are not available right now, so meters cannot be drawn. Gateways are shown.</div>
            )}
            {coordinates?.status === 'stale' && (
              <div className="gis-map-notice gis-map-notice--warn">Meter positions could not be refreshed; showing the last known positions.</div>
            )}
          </div>

          {/* Floating Layer Controls (Top Left over map) */}
          <div style={{
            position: 'absolute',
            top: 60,
            left: 12,
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(4px)',
            borderRadius: 8,
            padding: '8px 12px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontSize: 12,
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={showMeters}
                onChange={(e) => setShowMeters(e.target.checked)}
              />
              <span>Meters ({points.length.toLocaleString()})</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={enableClustering}
                onChange={(e) => setEnableClustering(e.target.checked)}
              />
              <span>Group nearby meters</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={showRadiusCircles}
                onChange={(e) => setShowRadiusCircles(e.target.checked)}
              />
              <span>Radius circles</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={showExistingGateways}
                onChange={(e) => setShowExistingGateways(e.target.checked)}
              />
              <span>Existing gateways ({gateways.length})</span>
            </label>
          </div>

          {/* Floating Collapsible Map Legend (Bottom Left above summary bar) */}
          <div style={{ position: 'absolute', bottom: 70, left: 16, zIndex: 11 }}>
            {!isLegendOpen ? (
              <button
                onClick={() => setIsLegendOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid #CBD5E1',
                  borderRadius: 20,
                  padding: '5px 12px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: '#1E293B',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title="Click to view the map legend"
              >
                <Info size={13} color="#2563EB" />
                <span>Map Legend</span>
                <ChevronUp size={13} color="#64748B" />
              </button>
            ) : (
              <div className="gis-map-legend" style={{ position: 'relative', bottom: 'auto', left: 'auto', minWidth: 260 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <span className="gis-legend-title" style={{ margin: 0 }}>Meter status (fill)</span>
                  <button
                    onClick={() => setIsLegendOpen(false)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      color: '#64748B',
                      fontSize: 11,
                      fontWeight: 500,
                    }}
                    title="Close Legend"
                  >
                    <span>Hide</span>
                    <ChevronDown size={14} />
                  </button>
                </div>

                {STATUS_ORDER.map((st) => (
                  <div className="gis-legend-item" key={st} title={METER_STATUS_STYLE[st].hint}>
                    <span className="gis-legend-icon" style={{ background: METER_STATUS_STYLE[st].color, border: '1.5px solid #FFFFFF', boxShadow: '0 0 3px rgba(0,0,0,0.25)' }} />
                    <span>{METER_STATUS_STYLE[st].label} · {METER_STATUS_STYLE[st].hint}</span>
                  </div>
                ))}
                <div style={{ height: 1, background: '#E2E8F0', margin: '3px 0' }} />
                <span className="gis-legend-title" style={{ fontSize: 9.5 }}>Signal quality (border)</span>
                <div className="gis-legend-item">
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#94A3B8', border: '2px solid #FFFFFF', display: 'inline-block' }} />
                  <span>Strong (≥ -95 dBm · white)</span>
                </div>
                <div className="gis-legend-item">
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#94A3B8', border: '2.5px solid #EAB308', display: 'inline-block' }} />
                  <span>Marginal (-95 to -105 dBm · yellow)</span>
                </div>
                <div className="gis-legend-item">
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#94A3B8', border: '2.5px solid #EF4444', display: 'inline-block' }} />
                  <span>Weak (&lt; -105 dBm · red)</span>
                </div>
                <div className="gis-legend-item">
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#94A3B8', border: '2px solid #94A3B8', display: 'inline-block' }} />
                  <span>No signal reading (grey)</span>
                </div>
                <div style={{ height: 1, background: '#E2E8F0', margin: '3px 0' }} />
                <div className="gis-legend-item">
                  <span
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 17, flexShrink: 0 }}
                    dangerouslySetInnerHTML={{ __html: getGatewaySvg('reporting').replace('width="38"', 'width="15"').replace('height="44"', 'height="17"') }}
                  />
                  <span>Existing gateway (blue online · grey offline / no data)</span>
                </div>
                <div className="gis-legend-item">
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#EA580C', color: '#fff', fontSize: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>1</span>
                  <span>Recommended gateway (circle = coverage radius)</span>
                </div>
                <div className="gis-legend-item">
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#059669', color: '#fff', fontSize: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>50</span>
                  <span>Group of meters (click to zoom)</span>
                </div>
              </div>
            )}
          </div>

          {/* Floating Bottom Left Summary Bar matching screenshot */}
          <div style={{
            position: 'absolute',
            bottom: 24,
            left: 16,
            background: '#ffffff',
            borderRadius: 8,
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
            zIndex: 10,
            fontSize: 13,
            fontWeight: 600,
            color: '#0f172a',
            overflow: 'hidden',
          }}>
            <div
              onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                cursor: 'pointer',
                background: '#ffffff',
              }}
            >
              <span>
                <strong>{plural(displayCandidates.length, 'new gateway')}</strong> · coverage{' '}
                {beforePercent == null ? '—' : `${beforePercent}%`} → <span style={{ color: percentColor }}>{overallPercent == null ? '—' : `${overallPercent}%`}</span>
              </span>
              {isSummaryExpanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </div>

            {isSummaryExpanded && (
              <div style={{
                padding: '10px 16px',
                borderTop: '1px solid #f1f5f9',
                fontSize: 12,
                color: '#64748b',
                background: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}>
                {summary && (
                  <div>
                    Meters in selection (all sub-sites): <strong>{summary.total.toLocaleString()}</strong>
                    {' '}({summary.withCoordinates.toLocaleString()} with a position)
                  </div>
                )}
                <div>Meters planned for (with a position): <strong>{totalMeters == null ? '—' : totalMeters.toLocaleString()}</strong></div>
                <div>
                  Already within {appliedRadiusM} m of an existing gateway:{' '}
                  <strong>{placementResult?.coveredByExisting == null ? '—' : placementResult.coveredByExisting.toLocaleString()}</strong>
                  {placementResult?.existingMode && placementResult.existingMode !== 'all' ? ` (${EXISTING_MODE_LABEL[placementResult.existingMode].toLowerCase()})` : ''}
                </div>
                <div>Newly reached by the new gateways: <strong style={{ color: '#059669' }}>{placementResult?.newlyCovered == null ? '—' : placementResult.newlyCovered.toLocaleString()}</strong></div>
                <div>Still out of reach: <strong>{placementResult?.uncovered == null ? '—' : placementResult.uncovered.toLocaleString()}</strong> (total reached {totalCovered.toLocaleString()})</div>
                {placementResult && placementResult.excludedMeterCount > 0 && (
                  <div>Left out (no usable position): <strong>{placementResult.excludedMeterCount.toLocaleString()}</strong></div>
                )}
                <div>Existing Gateways: <strong>{gateways.length}</strong></div>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar: Recommended Gateways (N) */}
        <div style={{
          width: 380,
          background: '#ffffff',
          borderLeft: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          zIndex: 15,
        }}>
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid #e2e8f0',
            fontWeight: 700,
            fontSize: 15,
            color: '#0f172a',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>Recommended Gateways ({displayCandidates.length})</span>
            {isLoading && <RefreshCw size={14} className="cw-spin" color="#2563eb" />}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {loadError && (
              <div style={{ padding: 12, borderRadius: 6, background: '#fef2f2', color: '#dc2626', fontSize: 12, display: 'flex', gap: 8 }}>
                <AlertCircle size={16} />
                <span>{loadError}</span>
              </div>
            )}

            {planNote && !isLoading && (
              <div style={{ padding: 12, borderRadius: 6, background: '#eff6ff', color: '#1e3a8a', fontSize: 12, display: 'flex', gap: 8 }}>
                <Info size={16} style={{ flexShrink: 0, color: '#2563eb' }} />
                <div>
                  <div>{planNote}</div>
                  {neededFor && placementResult?.stopReason !== 'no-meters' && placementResult?.stopReason !== 'already-covered' && (
                    <div style={{ marginTop: 6, color: '#475569' }} title="Beyond the recommended gateways these are estimates (each next gateway placed where it reaches most)">
                      New gateways needed for {neededFor.map((x) => `${x.level}%: ${x.text}`).join(' · ')}
                    </div>
                  )}
                </div>
              </div>
            )}

            {sidebarWarnings.map((w) => (
              <div key={w} style={{ padding: 12, borderRadius: 6, background: '#fffbeb', color: '#b45309', fontSize: 12, display: 'flex', gap: 8 }}>
                <AlertCircle size={16} />
                <span>{w}</span>
              </div>
            ))}

            {displayCandidates.length === 0 && !isLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: '#94a3b8' }}>
                <MapPin size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <div style={{ fontWeight: 600, fontSize: 14 }}>No gateway recommendations</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  {placementResult ? 'See the note above for why.' : 'Click "Generate" to compute gateway placement'}
                </div>
              </div>
            ) : (
              displayCandidates.map((cand) => {
                const num = cand.gatewayNumber;
                const inRange = cand.metersAssigned;
                const covered = cand.metersCoveredCount;
                const percent = cand.percentCovered ?? 0;
                const avgD = cand.avgDistanceM;
                const maxD = cand.maxDistanceM;
                const nearestName = cand.nearestExistingName;
                const nearestDist = cand.nearestExistingDistanceM;

                const isSelected = selectedCandidate?.gatewayNumber === num;

                return (
                  <div
                    key={num}
                    onClick={() => {
                      setSelectedCandidate(cand);
                      flyToCandidate(cand.latitude, cand.longitude);
                    }}
                    style={{
                      borderRadius: 8,
                      border: isSelected ? '2px solid #ea580c' : '1px solid #e2e8f0',
                      background: '#ffffff',
                      padding: 14,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    }}
                  >
                    {/* Card Topline */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 24,
                          height: 24,
                          borderRadius: 4,
                          background: '#EA580C',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: 13,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {num}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }} title="Meters it newly brings into reach">
                          +{covered.toLocaleString()} meters
                        </span>
                      </div>

                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: '#FEF3C7',
                        color: '#D97706',
                        fontSize: 11,
                        fontWeight: 700,
                      }}>
                        {percent}% of meters
                      </span>
                    </div>

                    {/* Metrics 3-column row */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 1fr 1fr',
                      gap: 8,
                      marginTop: 12,
                      paddingBottom: 10,
                      borderBottom: '1px solid #f1f5f9',
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                          {inRange.toLocaleString()}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }} title="Every meter within the radius, including those other gateways also reach">In range</div>
                      </div>

                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                          {fmtMetres(avgD)}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Avg dist</div>
                      </div>

                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                          {fmtMetres(maxD)}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Max dist</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ height: 4, background: '#f1f5f9', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round((covered / maxCandidateGain) * 100)}%`, height: '100%', background: '#ea580c' }} />
                    </div>

                    {cand.onlyThisOne != null && (
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                        Only this one reaches <strong>{cand.onlyThisOne.toLocaleString()}</strong>
                        {cand.addedInOrder != null && <> · adds <strong>{cand.addedInOrder.toLocaleString()}</strong> when built in this order</>}
                      </div>
                    )}

                    {/* Nearest Existing line */}
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                      {nearestName == null || nearestDist == null ? (
                        <>Nearest existing: <strong>none found</strong></>
                      ) : (
                        <>Nearest existing: <strong>{nearestName}</strong> · <strong>{nearestDist}m</strong> away</>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 3. Gateway Candidate 360 Detail Drawer */}
      <GatewayCandidateDrawer
        gateway={selectedDisplay}
        siteName={currentSiteName}
        radiusM={appliedRadiusM}
        onClose={() => setSelectedCandidate(null)}
        onFlyTo={flyToCandidate}
      />

      {/* 4. Meter 360 History Drawer (accessible by clicking any meter marker) */}
      {selectedMeter && (
        <MeterHistoryDrawer
          meter={selectedMeter}
          onClose={() => setSelectedMeter(null)}
        />
      )}
    </div>
  );
}
