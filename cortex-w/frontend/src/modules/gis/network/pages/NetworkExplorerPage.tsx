import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Radio,
  Table as TableIcon,
  Map as MapIcon,
  BarChart3,
  AlertTriangle,
  Info,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { runtimeConfig } from '@/config/runtimeConfig';
import { useGoogleMaps } from '../../shared/useGoogleMaps';
import type { GisMeter } from '../../shared/gisData';
import { MeterHistoryDrawer } from '../../shared/MeterHistoryDrawer';
import {
  networkApi,
  type NetGateway,
  type NetMeter,
  type NetMeterPage,
  type NetMeterStatus,
  type NetSiteOption,
  type NetUnplacedGateway,
} from '@/services/api/networkApi';
import type { BoundingBox } from '../../shared/spatialIndex';
import { createMeterLayer, type LayerItem, type MeterLayer } from '../../shared/meterCanvasLayer';
import { getDecibelBorder } from '../../shared/meterColorUtils';
import { getGatewayMapMarkerIcon, getGatewaySvg } from '../../shared/gatewayIconUtils';
import { formatStamp, isUnauthorized } from '../../shared/meterDetailModel';
import { SiteTreeSelect } from '@/modules/command-center/components/SiteTreeSelect';
import { useNetworkData } from '../hooks/useNetworkData';
import { GatewayCoveragePanel, defaultRadius } from '../components/GatewayCoveragePanel';
import { GatewayPicker, gatewayEntry } from '../components/GatewayPicker';
import { GatewayRangeCards } from '../components/GatewayRangeCards';
import { MeterSearchBox } from '../components/MeterSearchBox';
import { computeGatewayReach, distanceM, formatDistance, lastGatewayInfo } from '../coverage';
import {
  GATEWAY_STATUS_LABEL,
  METER_STATUS_STYLE,
  gatewayLabel,
  matchesSearch,
  toGisMeter,
  trimmedBounds,
  unionBounds,
  type MeterPoint,
} from '../networkModel';
import '../../shared/gis.css';

// Where the map looks before any data has arrived. As soon as meters and gateways are loaded the map fits them, so
// this only decides what is on screen for the first moments (a neutral overview of India, not a customer's city).
const INITIAL_VIEW = { center: { lat: 22.5, lng: 80 }, zoom: 5 };

type SelectedEntity = { type: 'gateway'; data: NetGateway } | { type: 'meter'; data: GisMeter } | null;
type StatusFilter = 'ALL' | NetMeterStatus;

const STATUS_ORDER: NetMeterStatus[] = ['connected', 'disconnected', 'never'];
const dash = '—';
const fmtTime = formatStamp;
const fmtNum = (n: number | null | undefined, unit: string) => (n == null ? dash : `${n} ${unit}`);
/** The gateway icon set knows reporting / degraded / stale; a gateway with no traffic looks like a stale one. */
const iconStatus = (s: NetGateway['status']) => (s === 'no-traffic' ? 'stale' : s);

function gatewayBadgeClass(s: NetGateway['status']): string {
  if (s === 'reporting') return 'cw-badge--green';
  if (s === 'degraded') return 'cw-badge--orange';
  return 'cw-badge--muted';
}
function meterBadgeClass(s: NetMeterStatus): string {
  return s === 'connected' ? 'cw-badge--green' : s === 'disconnected' ? 'cw-badge--red' : 'cw-badge--muted';
}

/** What the map is waiting for, step by step, so a slow load never looks like a frozen page. */
function MapLoadingOverlay({ steps }: { steps: Array<{ label: string; done: boolean }> }) {
  return (
    <div className="gis-loading-overlay" role="status" aria-live="polite">
      <div className="gis-loading-card">
        <div className="cw-spinner" />
        <div className="gis-loading-title">Loading network data…</div>
        <div className="gis-loading-steps">
          {steps.map((st) => (
            <div key={st.label} className={`gis-loading-step ${st.done ? 'gis-loading-step--done' : ''}`}>
              <span className="gis-loading-dot" />
              <span>{st.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SkeletonRows({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c}>
              <span className="gis-skeleton" style={{ width: c === 1 ? 110 : c === 2 ? 130 : 60, height: 12 }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function GatewayCardSkeletons({ count }: { count: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="gis-card-skeleton">
          <span className="gis-skeleton" style={{ width: '55%', height: 16 }} />
          {[70, 60, 80, 50].map((w, j) => (
            <span key={j} className="gis-skeleton" style={{ width: `${w}%`, height: 11 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function NetworkExplorerPage() {
  const navigate = useNavigate();
  const apiKey = runtimeConfig.GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useGoogleMaps(apiKey);

  const [activeView, setActiveView] = useState<'map' | 'table' | 'performance'>('map');
  const [siteId, setSiteId] = useState<string>('ALL');
  const [sites, setSites] = useState<NetSiteOption[]>([]);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // what the map is narrowed to: set when a search is submitted (Enter), not on every keystroke, so typing only shows suggestions
  const [mapSearch, setMapSearch] = useState('');
  const [showMeters, setShowMeters] = useState(true);
  const [showGateways, setShowGateways] = useState(true);
  const [showCircles, setShowCircles] = useState(false); // coverage circles start hidden; the toggle turns them on
  const [enableClustering, setEnableClustering] = useState(true);
  const [isLegendOpen, setIsLegendOpen] = useState(false);

  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(50);
  const [tableTab, setTableTab] = useState<'all' | 'gateways' | 'meters'>('all');
  const [tableData, setTableData] = useState<NetMeterPage | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);

  const [perfVisibleCount, setPerfVisibleCount] = useState(8);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity>(null);
  // the gateway whose coverage is open (circle + panel), and the radius it is drawn at: set by clicking a gateway or choosing one
  const [coverageGatewayId, setCoverageGatewayId] = useState<string | null>(null);
  const [radiusM, setRadiusM] = useState<number>(500);

  // opening a gateway closes the meter card, so the gateway's card is not left behind it
  const closeMeterCard = useCallback(() => setSelectedEntity((cur) => (cur?.type === 'meter' ? null : cur)), []);

  const data = useNetworkData(siteId, sites);
  const { gateways, unplaced, points, summary, coordinates } = data;

  const pageRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const circlesRef = useRef<any[]>([]);
  const focusCircleRef = useRef<any>(null);
  const storedCircleRef = useRef<any>(null); // the gateway's actual (stored) radius: stays put while the slider moves the other circle
  const meterLayerRef = useRef<MeterLayer<MeterPoint> | null>(null);
  const infoWindowRef = useRef<any>(null);
  const fittedForRef = useRef<string | null>(null);

  // The sign-in ended (the API answered 401 and the stored token is already cleared): go to the login screen instead of
  // leaving a page whose "Try again" can never work.
  useEffect(() => {
    if (data.sessionExpired) navigate('/login', { replace: true });
  }, [data.sessionExpired, navigate]);

  // ---- the area (site) list, from the same tree the Dashboard filters by ----
  useEffect(() => {
    const ctl = new AbortController();
    networkApi
      .listSites(ctl.signal)
      .then((list) => setSites(list.filter((s) => s.id !== 'ALL')))
      .catch((e) => {
        if (isUnauthorized(e)) navigate('/login', { replace: true });
        setSites([]); // the picker then offers "All my sites" only
      });
    return () => ctl.abort();
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  // A new area starts from a clean slate: the gateway filter belongs to the area before it.
  useEffect(() => {
    setSelectedGatewayId('ALL');
    setSelectedEntity(null);
    setCoverageGatewayId(null);
  }, [siteId]);

  useEffect(() => {
    setTablePage(1);
  }, [debouncedSearch, siteId, statusFilter, tableTab, tablePageSize]);

  // a gateway filter whose gateway is no longer in the list (a refresh dropped it) would hide every gateway: reset it
  useEffect(() => {
    if (selectedGatewayId === 'ALL' || data.loadedSiteId !== siteId || gateways.length === 0) return;
    if (!gateways.some((g) => g.gatewayId === selectedGatewayId)) {
      setSelectedGatewayId('ALL');
      setCoverageGatewayId(null);
    }
  }, [gateways, selectedGatewayId, siteId, data.loadedSiteId]);

  const gatewayById = useMemo(() => new Map(gateways.map((g) => [g.gatewayId, g])), [gateways]);
  const focusGateway = coverageGatewayId ? gatewayById.get(coverageGatewayId) ?? null : null;
  const focusId = focusGateway?.gatewayId ?? null;
  // what the open gateway reaches, from every meter with a position (the page's filters do not narrow it)
  const reach = useMemo(() => (focusGateway ? computeGatewayReach(points, focusGateway) : null), [points, focusGateway]);
  // choosing a gateway in the picker opens its coverage too
  useEffect(() => {
    if (selectedGatewayId !== 'ALL') setCoverageGatewayId(selectedGatewayId);
  }, [selectedGatewayId]);
  // each gateway starts at the radius stored for it; the slider only changes what is drawn and counted
  useEffect(() => {
    const gw = focusId ? gatewayById.get(focusId) : null;
    if (gw) setRadiusM(defaultRadius(gw));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);
  const gatewayName = useCallback((id: string | null) => (id ? (gatewayById.has(id) ? gatewayLabel(gatewayById.get(id)!) : id) : dash), [gatewayById]);
  const siteName = useMemo(() => new Map(sites.map((s) => [Number(s.id), s.name])), [sites]);

  // ---- what is shown ----
  const filteredGateways = useMemo(() => {
    const q = mapSearch.toLowerCase();
    return gateways.filter((g) => {
      if (selectedGatewayId !== 'ALL' && g.gatewayId !== selectedGatewayId) return false;
      if (!q) return true;
      return g.gatewayId.includes(q) || gatewayLabel(g).toLowerCase().includes(q);
    });
  }, [gateways, selectedGatewayId, mapSearch]);

  const filteredPoints = useMemo(
    () =>
      points.filter((p) => {
        if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
        return matchesSearch(p, mapSearch);
      }),
    [points, statusFilter, mapSearch]
  );

  // the gateway closest to the open meter (straight line, among the gateways with a position)
  const nearestGateway = useMemo(() => {
    if (selectedEntity?.type !== 'meter') return null;
    const { lat, lng } = selectedEntity.data;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    let best: { gw: NetGateway; d: number } | null = null;
    for (const gw of gateways) {
      const d = distanceM(lat, lng, gw.lat, gw.lng);
      if (!best || d < best.d) best = { gw, d };
    }
    if (!best) return null;
    const e = gatewayEntry(best.gw);
    return { gatewayId: e.name ? `${e.id} · ${e.name}` : e.id, distanceLabel: formatDistance(best.d) };
  }, [selectedEntity, gateways]);

  // the gateway the open meter's last message came through (the meter's gateway column), and how far it is
  const lastGateway = useMemo(
    () => (selectedEntity?.type === 'meter' ? lastGatewayInfo(selectedEntity.data, gateways) : null),
    [selectedEntity, gateways]
  );

  // ---- opening a meter: instantly from what the map knows, then completed from the server ----
  const openMeter = useCallback(
    async (p: MeterPoint) => {
      const gw = p.gatewayId ? gatewayById.get(p.gatewayId) ?? null : null;
      const partial: NetMeter = {
        meterId: p.meterId, assetId: p.assetId, devEui: null, consumerName: null, householdId: null, locality: null, ward: null,
        zone: null, dma: null, siteId: null, siteName: null, lat: p.lat, lng: p.lng, gatewayId: p.gatewayId, distanceToGatewayM: null,
        status: p.status, rssi: p.rssi, snr: p.snr, lastSeen: null, currentReadingKl: null,
      };
      setSelectedEntity({ type: 'meter', data: toGisMeter(partial, gw) });
      try {
        const page = await networkApi.listMeters({ siteId, search: p.meterId, limit: 5 });
        const full = page.items.find((i) => i.meterId === p.meterId);
        if (full) {
          setSelectedEntity((cur) => (cur?.type === 'meter' && cur.data.meterId === p.meterId ? { type: 'meter', data: toGisMeter(full, gw) } : cur));
        }
      } catch {
        // the drawer keeps what the map knows; it loads its own details from the server as well
      }
    },
    [siteId, gatewayById]
  );
  const openMeterRef = useRef(openMeter);
  openMeterRef.current = openMeter;

  // ---- the meter table: one page at a time, filtered by the server ----
  useEffect(() => {
    if (activeView !== 'table' || tableTab === 'gateways') return;
    const ctl = new AbortController();
    setTableLoading(true);
    setTableError(null);
    networkApi
      .listMeters(
        {
          siteId,
          limit: tablePageSize,
          offset: (tablePage - 1) * tablePageSize,
          search: debouncedSearch || undefined,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
        },
        ctl.signal
      )
      .then((page) => {
        setTableData(page);
        setTableLoading(false);
      })
      .catch((e) => {
        if (ctl.signal.aborted) return;
        if (isUnauthorized(e)) {
          navigate('/login', { replace: true });
          return;
        }
        setTableError((e as { operatorMessage?: string })?.operatorMessage || 'Could not load the meter list.');
        setTableLoading(false);
      });
    return () => ctl.abort();
  }, [activeView, tableTab, siteId, tablePage, tablePageSize, debouncedSearch, statusFilter]);

  const totalMeters = tableData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalMeters / tablePageSize));

  // ---- map ----
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
      streetViewControl: false,
      fullscreenControl: false, // the toolbar has its own full screen button (it keeps the toolbar and panels)
      zoomControl: true,
      gestureHandling: 'greedy',
      styles: [
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
      ],
    });


    infoWindowRef.current = new google.maps.InfoWindow();
    mapInstanceRef.current = map;

    // Meters are drawn on one canvas (see shared/meterCanvasLayer.ts); clicks on it are resolved there.
    meterLayerRef.current = createMeterLayer<MeterPoint>(google, map, {
      onClick: (hit) => {
        if (!hit) {
          setSelectedEntity(null);
          infoWindowRef.current?.close();
          return;
        }
        infoWindowRef.current?.close();
        if (hit.kind === 'point') {
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

  // Full screen: the whole explorer (toolbar, map and panels), not only the map canvas
  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement === pageRef.current);
      const google = (window as any).google;
      if (mapInstanceRef.current && google?.maps) setTimeout(() => google.maps.event.trigger(mapInstanceRef.current, 'resize'), 120);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void pageRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  // Redraw the canvas when the map tab comes back
  useEffect(() => {
    if (activeView === 'map' && mapInstanceRef.current && (window as any).google?.maps) {
      const timer = setTimeout(() => (window as any).google.maps.event.trigger(mapInstanceRef.current, 'resize'), 60);
      return () => clearTimeout(timer);
    }
  }, [activeView]);

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

  // Fit the map to the data once per area selection (not on every background refresh, which would undo the user's panning)
  useEffect(() => {
    if (!isLoaded || !mapInstanceRef.current || fittedForRef.current === siteId) return;
    if (data.loadedSiteId !== siteId) return; // still showing the previous area's data
    const box = unionBounds(trimmedBounds(points), trimmedBounds(gateways));
    if (!box) return;
    fittedForRef.current = siteId;
    fitMapTo(box);
  }, [isLoaded, siteId, data.loadedSiteId, points, gateways, fitMapTo]);

  // Searching moves the map to what was found; clearing the search goes back to the whole selection.
  const shownRef = useRef({ filteredPoints, filteredGateways, points, gateways });
  shownRef.current = { filteredPoints, filteredGateways, points, gateways };
  const lastSearchRef = useRef('');
  useEffect(() => {
    const previous = lastSearchRef.current;
    lastSearchRef.current = mapSearch;
    if (!isLoaded || !mapInstanceRef.current || previous === mapSearch) return;
    const r = shownRef.current;
    const box = mapSearch
      ? unionBounds(trimmedBounds(r.filteredPoints, 0), trimmedBounds(r.filteredGateways, 0))
      : unionBounds(trimmedBounds(r.points), trimmedBounds(r.gateways));
    if (box) fitMapTo(box);
  }, [mapSearch, isLoaded, fitMapTo]);

  // Gateways and their coverage
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded) return;
    const google = (window as any).google;
    if (!google?.maps) return;

    markersRef.current.forEach((m) => m.setMap(null));
    circlesRef.current.forEach((c) => c.setMap(null));
    markersRef.current = [];
    circlesRef.current = [];

    if (!showGateways) return;
    filteredGateways.forEach((gw) => {
      const marker = new google.maps.Marker({
        position: { lat: gw.lat, lng: gw.lng },
        map: mapInstanceRef.current,
        title: `${gatewayLabel(gw)} (${GATEWAY_STATUS_LABEL[gw.status]})`,
        icon: getGatewayMapMarkerIcon(iconStatus(gw.status)),
        zIndex: 9999,
      });
      marker.addListener('click', () => {
        setSelectedGatewayId(gw.gatewayId);
        setCoverageGatewayId(gw.gatewayId);
        closeMeterCard();
        infoWindowRef.current?.close();
      });
      markersRef.current.push(marker);

      // The circle is the gateway's stored coverage radius, drawn at its true size
      if (showCircles && gw.radiusM && gw.gatewayId !== coverageGatewayId) {
        const degraded = gw.status === 'degraded';
        const circle = new google.maps.Circle({
          strokeColor: degraded ? '#F59E0B' : '#2563EB',
          strokeOpacity: 0.6,
          strokeWeight: 1.5,
          fillColor: degraded ? '#FBBF24' : '#3B82F6',
          fillOpacity: 0.08,
          map: mapInstanceRef.current,
          center: { lat: gw.lat, lng: gw.lng },
          radius: gw.radiusM,
        });
        circle.addListener('click', () => {
          setSelectedGatewayId(gw.gatewayId);
          setCoverageGatewayId(gw.gatewayId);
          closeMeterCard();
          infoWindowRef.current?.close();
        });
        circlesRef.current.push(circle);
      }
    });
  }, [isLoaded, filteredGateways, showGateways, showCircles, coverageGatewayId]);

  // The open gateway's radius circle: drawn at the chosen radius, redrawn as the slider moves, and the map goes to it once
  // when a gateway is opened (not on every slider step, which would fight the user's own panning)
  useEffect(() => {
    const google = (window as any).google;
    if (!isLoaded || !mapInstanceRef.current || !google?.maps) return;
    if (!focusGateway) {
      focusCircleRef.current?.setMap(null);
      focusCircleRef.current = null;
      storedCircleRef.current?.setMap(null);
      storedCircleRef.current = null;
      return;
    }
    // the actual radius: a fixed dashed ring, there as long as the gateway is open (none when no radius is stored for it)
    if (focusGateway.radiusM) {
      if (!storedCircleRef.current) {
        storedCircleRef.current = new google.maps.Circle({
          strokeColor: '#F59E0B',
          strokeOpacity: 0.95,
          strokeWeight: 2,
          fillOpacity: 0,
          map: mapInstanceRef.current,
          clickable: false,
          zIndex: 2,
        });
      }
      storedCircleRef.current.setCenter({ lat: focusGateway.lat, lng: focusGateway.lng });
      storedCircleRef.current.setRadius(focusGateway.radiusM);
    } else {
      storedCircleRef.current?.setMap(null);
      storedCircleRef.current = null;
    }
    if (!focusCircleRef.current) {
      focusCircleRef.current = new google.maps.Circle({
        strokeColor: '#2563EB',
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: '#3B82F6',
        fillOpacity: 0.1,
        map: mapInstanceRef.current,
        clickable: false,
        zIndex: 1,
      });
    }
    focusCircleRef.current.setCenter({ lat: focusGateway.lat, lng: focusGateway.lng });
    focusCircleRef.current.setRadius(radiusM);
  }, [isLoaded, focusGateway, radiusM, activeView]);
  useEffect(() => {
    const map = mapInstanceRef.current;
    const gw = focusId ? gatewayById.get(focusId) : null;
    if (!gw || !map) return;
    // the box around the gateway's stored radius (a degree is about 111 km); computed here, as the radius state is still
    // being reset to this gateway's own value when this effect runs
    const r = defaultRadius(gw);
    const dLat = r / 111320;
    const dLng = r / (111320 * Math.max(0.1, Math.cos((gw.lat * Math.PI) / 180)));
    map.fitBounds({ north: gw.lat + dLat, south: gw.lat - dLat, east: gw.lng + dLng, west: gw.lng - dLng }, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);
  useEffect(() => () => {
    focusCircleRef.current?.setMap(null);
    storedCircleRef.current?.setMap(null);
  }, []);

  // Meters: one canvas layer (no marker per meter), so the map stays smooth at any zoom
  const meterItems = useMemo<LayerItem<MeterPoint>[]>(
    () =>
      filteredPoints.map((p) => {
        const border = getDecibelBorder(p.rssi ?? undefined);
        return { id: p.meterId, lat: p.lat, lng: p.lng, fill: METER_STATUS_STYLE[p.status].color, stroke: border.strokeColor, strokeWidth: border.strokeWeight, ref: p };
      }),
    [filteredPoints]
  );
  useEffect(() => {
    meterLayerRef.current?.setItems(showMeters ? meterItems : []);
  }, [meterItems, showMeters, isLoaded]);
  useEffect(() => {
    meterLayerRef.current?.setClustering(enableClustering);
  }, [enableClustering, isLoaded]);
  useEffect(() => {
    meterLayerRef.current?.setSelected(selectedEntity?.type === 'meter' ? selectedEntity.data.meterId : null);
  }, [selectedEntity]);
  useEffect(() => {
    return () => {
      meterLayerRef.current?.destroy();
      meterLayerRef.current = null;
    };
  }, []);

  // ---- notices on the map ----
  const noData = !data.isLoading && points.length === 0 && gateways.length === 0;
  const failedCompletely = noData && (data.metersError || data.gatewaysError);

  const placeGateway = (id: string) => {
    setSelectedGatewayId(id);
    setCoverageGatewayId(id);
    closeMeterCard();
    const gw = gateways.find((g) => g.gatewayId === id);
    if (gw && mapInstanceRef.current) {
      mapInstanceRef.current.panTo({ lat: gw.lat, lng: gw.lng });
      mapInstanceRef.current.setZoom(16);
    }
  };

  const siteLabel = (id: number | null) => (id == null ? null : siteName.get(id) ?? null);

  return (
    <div className="gis-container" ref={pageRef}>
      {/* Top Floating Control Bar */}
      <div className="gis-toolbar">
        <div className="gis-toolbar-left">
          <div className="gis-title-badge">
            <Radio size={16} className="gis-title-icon" />
            <span>Network Explorer</span>
            {!summary && data.isLoading ? (
              <span style={{ fontSize: 10, color: '#64748B', background: '#F1F5F9', padding: '2px 6px', borderRadius: 10 }}>Loading…</span>
            ) : null}
          </div>

          <div className="gis-filter-row">
          <MeterSearchBox
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={activeView === 'table' ? 'Search meter, consumer, locality…' : 'Search meter ID or consumer ID…'}
            siteId={siteId}
            points={points}
            onSubmit={setMapSearch}
            onPick={(sg) => {
              setSearchQuery(sg.meterId);
              setMapSearch('');
              const p = points.find((x) => x.meterId === sg.meterId);
              if (!p) {
                setActiveView('table'); // no position: the table lists it (and the server search finds it)
                return;
              }
              setActiveView('map');
              const map = mapInstanceRef.current;
              if (map) {
                map.panTo({ lat: p.lat, lng: p.lng });
                map.setZoom(Math.max(map.getZoom() ?? 0, 18));
              }
              void openMeter(p);
            }}
          />

          <SiteTreeSelect sites={sites} value={siteId} onChange={setSiteId} />

          <div className="gis-filter-group">
            <span className="gis-filter-label">Gateway</span>
          <GatewayPicker
            gateways={gateways}
            value={selectedGatewayId}
            onChange={(id) => {
              if (id === 'ALL') {
                setSelectedGatewayId('ALL');
                setCoverageGatewayId(null);
              } else placeGateway(id);
            }}
          />

            <span className="gis-filter-sep" />
            <span className="gis-filter-label">Status</span>
          <select className="gis-select gis-select--bare" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} title="Meter status">
            <option value="ALL">All statuses</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {METER_STATUS_STYLE[s].label}
                {summary ? ` (${summary[s].toLocaleString()})` : ''}
              </option>
            ))}
          </select>
          </div>
          </div>
        </div>

        <div className="gis-toolbar-right">
          <div className="gis-layer-pills">
            <button className={`gis-layer-btn ${showGateways ? 'gis-layer-btn--active' : ''}`} onClick={() => setShowGateways(!showGateways)}>
              Gateways ({filteredGateways.length})
            </button>
            <button className={`gis-layer-btn ${showMeters ? 'gis-layer-btn--active' : ''}`} onClick={() => setShowMeters(!showMeters)}>
              Meters ({filteredPoints.length.toLocaleString()})
            </button>
            <button className={`gis-layer-btn ${showCircles ? 'gis-layer-btn--active' : ''}`} onClick={() => setShowCircles(!showCircles)}>
              Coverage Circles
            </button>
            <button
              className={`gis-layer-btn ${enableClustering ? 'gis-layer-btn--active' : ''}`}
              onClick={() => setEnableClustering(!enableClustering)}
              title="Group nearby meters"
            >
              Cluster ({enableClustering ? 'On' : 'Off'})
            </button>
          </div>

          <div className="gis-view-tabs">
            <button className={`gis-view-tab ${activeView === 'map' ? 'gis-view-tab--active' : ''}`} onClick={() => setActiveView('map')}>
              <MapIcon size={12} style={{ display: 'inline', marginRight: 4 }} />
              Map
            </button>
            <button className={`gis-view-tab ${activeView === 'table' ? 'gis-view-tab--active' : ''}`} onClick={() => setActiveView('table')}>
              <TableIcon size={12} style={{ display: 'inline', marginRight: 4 }} />
              Table
            </button>
            <button className={`gis-view-tab ${activeView === 'performance' ? 'gis-view-tab--active' : ''}`} onClick={() => setActiveView('performance')}>
              <BarChart3 size={12} style={{ display: 'inline', marginRight: 4 }} />
              Performance
            </button>
          </div>
          <button
            className="gis-layer-btn gis-fullscreen-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Leave full screen (Esc)' : 'Show the explorer full screen'}
            aria-pressed={isFullscreen}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{isFullscreen ? 'Exit full screen' : 'Full screen'}</span>
          </button>
        </div>
      </div>

      {/* Map - kept mounted so the Google Maps canvas survives tab switches */}
      <div className="gis-map-viewport" style={{ display: activeView === 'map' ? 'block' : 'none' }}>
        <div ref={mapContainerRef} className="gis-google-map-canvas" />

        {/* Nothing to draw yet: say what is being waited for. Quiet background refreshes only show the thin bar. */}
        {!loadError && !data.metersReady && !data.gatewaysReady && (data.isLoading || !isLoaded) && (
          <MapLoadingOverlay
            steps={[
              { label: 'Map', done: isLoaded },
              { label: 'Gateways', done: data.gatewaysReady },
              { label: 'Meters and their status', done: data.metersReady },
            ]}
          />
        )}
        {!loadError && (data.metersReady || data.gatewaysReady) && (data.isLoading || data.isShowingSavedCopy) && !data.metersError && !data.gatewaysError && (
          <div className="gis-loading-bar" role="progressbar" aria-label="Refreshing" />
        )}

        <div className="gis-map-notices">
          {data.isShowingSavedCopy && !data.metersError && !data.gatewaysError && (
            <div className="gis-map-notice">Showing the copy saved on your last visit, refreshing…</div>
          )}
          {!failedCompletely && data.metersError && (
            <div className="gis-map-notice gis-map-notice--error">
              {data.metersError} <button onClick={data.reload}>Retry</button>
            </div>
          )}
          {!failedCompletely && data.gatewaysError && (
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

        {/* Bottom left: the open gateway's nearest / farthest meter, above the legend */}
        <div className="gis-map-bottom-left">
          {focusGateway && reach && (
            <GatewayRangeCards
              reach={reach}
              onOpenMeter={(id) => {
                const p = points.find((x) => x.meterId === id);
                if (!p) return;
                mapInstanceRef.current?.panTo({ lat: p.lat, lng: p.lng });
                void openMeter(p);
              }}
            />
          )}
        {/* Legend */}
        <div>
          {!isLegendOpen ? (
            <button
              onClick={() => setIsLegendOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)',
                border: '1px solid #CBD5E1', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 600, color: '#1E293B',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)', cursor: 'pointer',
              }}
              title="Click to view the map legend"
            >
              <Info size={14} color="#2563EB" />
              <span>Map Legend</span>
              <ChevronUp size={14} color="#64748B" />
            </button>
          ) : (
            <div className="gis-map-legend" style={{ position: 'relative', bottom: 'auto', left: 'auto', minWidth: 260 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span className="gis-legend-title" style={{ margin: 0 }}>Meter status (fill)</span>
                <button
                  onClick={() => setIsLegendOpen(false)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: 4, color: '#64748B', fontSize: 11, fontWeight: 500 }}
                  title="Close legend"
                >
                  <span>Hide</span>
                  <ChevronDown size={14} />
                </button>
              </div>
              {STATUS_ORDER.map((s) => (
                <div className="gis-legend-item" key={s} title={METER_STATUS_STYLE[s].hint}>
                  <span className="gis-legend-icon" style={{ background: METER_STATUS_STYLE[s].color, border: '1.5px solid #FFFFFF', boxShadow: '0 0 3px rgba(0,0,0,0.25)' }} />
                  <span>
                    {METER_STATUS_STYLE[s].label} · {METER_STATUS_STYLE[s].hint}
                  </span>
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
                <span>Gateway (blue reporting · amber degraded · grey stale / no traffic)</span>
              </div>
              <div className="gis-legend-item">
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#2563EB', color: '#fff', fontSize: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>50</span>
                <span>Group of meters (click to zoom)</span>
              </div>
            </div>
          )}
        </div>
        </div>

        {/* What the open gateway reaches: radius, nearest / farthest meter, what a radius would cover */}
        {/* Top of the map: the coverage strip, and right below it the gateway card */}
        <div className="gis-map-top">
        {focusGateway && reach && (
          <GatewayCoveragePanel
            gateway={focusGateway}
            reach={reach}
            radiusM={radiusM}
            onRadiusChange={setRadiusM}
            onClose={() => {
              setCoverageGatewayId(null);
              setSelectedEntity((cur) => (cur?.type === 'gateway' ? null : cur));
            }}
            details={
              <div className="gis-cov-details">
                <span className="gis-cov-section">Gateway telemetry</span>
                <div className="gis-kv-row"><span className="gis-k">Gateway ID</span><span className="gis-v">{focusGateway.gatewayId}</span></div>
                <div className="gis-kv-row"><span className="gis-k">Status</span><span className="gis-v">{GATEWAY_STATUS_LABEL[focusGateway.status]}</span></div>
                <div className="gis-kv-row">
                  <span className="gis-k">Meters heard</span>
                  <span className="gis-v">{focusGateway.metersHeard.toLocaleString()} ({focusGateway.liveMeters.toLocaleString()} connected)</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Avg RSSI / SNR</span>
                  <span className="gis-v">{fmtNum(focusGateway.avgRssi, 'dBm')} · {fmtNum(focusGateway.avgSnr, 'dB')}</span>
                </div>
                <div className="gis-kv-row"><span className="gis-k">Last frame</span><span className="gis-v">{fmtTime(focusGateway.lastFrameAt)}</span></div>
                <div className="gis-kv-row"><span className="gis-k">Site</span><span className="gis-v">{siteLabel(focusGateway.siteId) ?? dash}</span></div>
                <div className="gis-kv-row">
                  <span className="gis-k">Coordinates</span>
                  <span className="gis-v">{focusGateway.lat.toFixed(4)}, {focusGateway.lng.toFixed(4)}</span>
                </div>
                <button className="gis-action-btn" onClick={() => navigate(`/app/command-center/gateways/${focusGateway.gatewayId}`)}>
                  Open in Command Center
                </button>
              </div>
            }
          />
        )}

        </div>

        {/* Nothing could be loaded: say so instead of showing an empty map */}
        {!loadError && failedCompletely && (
          <div className="gis-error-fallback">
            <AlertTriangle size={32} color="#EF4444" />
            <strong style={{ fontSize: 14 }}>Network data could not be loaded</strong>
            <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>{data.metersError || data.gatewaysError}</p>
            <button className="gis-action-btn" style={{ marginTop: 8 }} onClick={data.reload}>
              Try again
            </button>
          </div>
        )}
        {!loadError && noData && !failedCompletely && (
          <div className="gis-error-fallback">
            <Info size={28} color="#2563EB" />
            <strong style={{ fontSize: 14 }}>Nothing to show for this selection</strong>
            <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>No gateways or meters were found for the chosen area.</p>
          </div>
        )}

        {/* Google Maps could not load (key, referrer or quota) */}
        {loadError && (
          <div className="gis-error-fallback">
            <AlertTriangle size={32} color="#F59E0B" />
            <strong style={{ fontSize: 14 }}>Google Maps Notice</strong>
            <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>{loadError}</p>
            <button className="gis-action-btn" style={{ marginTop: 8 }} onClick={() => setActiveView('table')}>
              Switch to Table View
            </button>
          </div>
        )}
      </div>

      {/* Table View with server-side paging */}
      {activeView === 'table' && (
        <div className="gis-table-container">
          <div
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #E2E8F0',
              background: '#FFFFFF', flexShrink: 0, flexWrap: 'wrap', gap: 10,
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className={`gis-layer-btn ${tableTab === 'all' ? 'gis-layer-btn--active' : ''}`} onClick={() => setTableTab('all')}>
                All
              </button>
              <button className={`gis-layer-btn ${tableTab === 'meters' ? 'gis-layer-btn--active' : ''}`} onClick={() => setTableTab('meters')}>
                Meters ({(tableData?.total ?? summary?.total ?? 0).toLocaleString()})
              </button>
              <button className={`gis-layer-btn ${tableTab === 'gateways' ? 'gis-layer-btn--active' : ''}`} onClick={() => setTableTab('gateways')}>
                Gateways ({filteredGateways.length + unplaced.length})
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#64748B' }}>
              {tableTab === 'gateways'
                ? `${filteredGateways.length} on the map, ${unplaced.length} not placed`
                : totalMeters === 0
                ? tableLoading ? 'Loading meters…' : 'No meters match'
                : `${tableLoading ? 'Updating… ' : ''}Showing ${((tablePage - 1) * tablePageSize + 1).toLocaleString()}–${Math.min(tablePage * tablePageSize, totalMeters).toLocaleString()} of ${totalMeters.toLocaleString()} meters`}
            </div>
          </div>

          {tableError && (
            <div className="gis-map-notice gis-map-notice--error" style={{ margin: '8px 16px' }}>
              {tableError}
            </div>
          )}

          <div className="gis-table-body-scroll" style={{ opacity: tableLoading ? 0.6 : 1 }}>
            <table className="gis-data-table">
              <thead>
                <tr>
                  <th>Entity Type</th>
                  <th>Identifier</th>
                  <th>Name / Consumer</th>
                  <th>Locality</th>
                  <th>Latitude</th>
                  <th>Longitude</th>
                  <th>Gateway / Reach</th>
                  <th>RSSI</th>
                  <th>SNR</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tableTab !== 'meters' && data.isLoading && gateways.length === 0 && <SkeletonRows rows={5} cols={10} />}
                {tableTab !== 'meters' &&
                  filteredGateways.map((gw) => (
                    <tr
                      key={gw.gatewayId}
                      onClick={() => {
                        setSelectedGatewayId(gw.gatewayId);
                        setCoverageGatewayId(gw.gatewayId);
                        closeMeterCard();
                        setActiveView('map');
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td><strong>Gateway</strong></td>
                      <td><code>{gw.gatewayId}</code></td>
                      <td>{gatewayLabel(gw)}</td>
                      <td>{gw.address || siteLabel(gw.siteId) || dash}</td>
                      <td>{gw.lat.toFixed(4)}</td>
                      <td>{gw.lng.toFixed(4)}</td>
                      <td>
                        {gw.radiusM ? `Radius ${gw.radiusM} m · ` : ''}
                        {gw.metersHeard.toLocaleString()} meters
                      </td>
                      <td>{fmtNum(gw.avgRssi, 'dBm')}</td>
                      <td>{fmtNum(gw.avgSnr, 'dB')}</td>
                      <td><span className={`cw-badge ${gatewayBadgeClass(gw.status)}`}>{GATEWAY_STATUS_LABEL[gw.status].toUpperCase()}</span></td>
                    </tr>
                  ))}

                {tableTab !== 'meters' &&
                  unplaced.map((gw: NetUnplacedGateway) => (
                    <tr key={`unplaced-${gw.gatewayId}`}>
                      <td><strong>Gateway</strong></td>
                      <td><code>{gw.gatewayId}</code></td>
                      <td>Not on the map</td>
                      <td>{gw.reason === 'no-geofence' ? 'No location stored' : 'Stored location unusable'}</td>
                      <td>{dash}</td>
                      <td>{dash}</td>
                      <td>{gw.metersHeard.toLocaleString()} meters</td>
                      <td>{fmtNum(gw.avgRssi, 'dBm')}</td>
                      <td>{fmtNum(gw.avgSnr, 'dB')}</td>
                      <td><span className={`cw-badge ${gatewayBadgeClass(gw.status)}`}>{GATEWAY_STATUS_LABEL[gw.status].toUpperCase()}</span></td>
                    </tr>
                  ))}

                {tableTab !== 'gateways' && tableLoading && !tableData && <SkeletonRows rows={10} cols={10} />}
                {tableTab !== 'gateways' &&
                  tableData?.items.map((m) => {
                    const gw = m.gatewayId ? gatewayById.get(m.gatewayId) ?? null : null;
                    return (
                      <tr key={m.meterId} onClick={() => setSelectedEntity({ type: 'meter', data: toGisMeter(m, gw) })} style={{ cursor: 'pointer' }}>
                        <td>Meter</td>
                        <td><code>{m.meterId}</code></td>
                        <td>{m.consumerName || dash}</td>
                        <td>{m.locality || m.siteName || dash}</td>
                        <td>{m.lat != null ? m.lat.toFixed(4) : dash}</td>
                        <td>{m.lng != null ? m.lng.toFixed(4) : dash}</td>
                        <td>
                          {m.gatewayId ? gatewayName(m.gatewayId) : dash}
                          {m.distanceToGatewayM != null ? ` (${m.distanceToGatewayM.toLocaleString()} m)` : ''}
                        </td>
                        <td>{fmtNum(m.rssi, 'dBm')}</td>
                        <td>{fmtNum(m.snr, 'dB')}</td>
                        <td><span className={`cw-badge ${meterBadgeClass(m.status)}`}>{METER_STATUS_STYLE[m.status].label.toUpperCase()}</span></td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {tableTab !== 'gateways' && (
            <div className="gis-table-pagination">
              <div className="gis-pagination-info">
                <span>
                  <strong>{totalMeters.toLocaleString()}</strong> meters
                </span>
                <span style={{ margin: '0 8px', color: '#CBD5E1' }}>|</span>
                <span>Rows per page:</span>
                <select className="gis-pagination-select" value={tablePageSize} onChange={(e) => setTablePageSize(Number(e.target.value))}>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>
              <div className="gis-pagination-actions">
                <button className="gis-pagination-btn" onClick={() => setTablePage(1)} disabled={tablePage === 1}>&laquo; First</button>
                <button className="gis-pagination-btn" onClick={() => setTablePage((p) => Math.max(p - 1, 1))} disabled={tablePage === 1}>&lsaquo; Prev</button>
                <span style={{ margin: '0 6px', fontWeight: 600 }}>Page {tablePage} of {totalPages}</span>
                <button className="gis-pagination-btn" onClick={() => setTablePage((p) => Math.min(p + 1, totalPages))} disabled={tablePage >= totalPages}>Next &rsaquo;</button>
                <button className="gis-pagination-btn" onClick={() => setTablePage(totalPages)} disabled={tablePage >= totalPages}>Last &raquo;</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Performance View */}
      {activeView === 'performance' && (
        <div className="gis-table-container" style={{ padding: 16, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: 16 }}>Gateway coverage and link quality</h3>
              <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>
                Showing {Math.min(perfVisibleCount, filteredGateways.length)} of {filteredGateways.length} gateways
                {unplaced.length > 0 ? `, plus ${unplaced.length} heard by meters but not on the map` : ''}
              </p>
            </div>
            {perfVisibleCount < filteredGateways.length && (
              <button className="gis-layer-btn" onClick={() => setPerfVisibleCount(filteredGateways.length)} style={{ fontSize: 11 }}>
                Show All ({filteredGateways.length})
              </button>
            )}
          </div>

          {gateways.length === 0 && unplaced.length === 0 && data.isLoading && <GatewayCardSkeletons count={6} />}
          {gateways.length === 0 && unplaced.length === 0 && !data.isLoading && (
            <div style={{ color: '#64748B', fontSize: 13 }}>No gateways found for this selection.</div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {filteredGateways.slice(0, perfVisibleCount).map((gw) => (
              <div key={gw.gatewayId} className="gis-card" style={{ background: '#FFFFFF' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 14, color: '#2563EB' }}>{gatewayLabel(gw)}</strong>
                  <span className={`cw-badge ${gatewayBadgeClass(gw.status)}`}>{GATEWAY_STATUS_LABEL[gw.status]}</span>
                </div>
                <div className="gis-kv-row"><span className="gis-k">Gateway ID</span><span className="gis-v">{gw.gatewayId}</span></div>
                <div className="gis-kv-row"><span className="gis-k">Location</span><span className="gis-v">{gw.lat.toFixed(4)}, {gw.lng.toFixed(4)}</span></div>
                <div className="gis-kv-row"><span className="gis-k">Coverage radius</span><span className="gis-v">{gw.radiusM ? `${gw.radiusM} m` : dash}</span></div>
                <div className="gis-kv-row"><span className="gis-k">Meters heard</span><span className="gis-v">{gw.metersHeard.toLocaleString()} ({gw.liveMeters.toLocaleString()} connected)</span></div>
                <div className="gis-kv-row"><span className="gis-k">Avg link quality</span><span className="gis-v">{fmtNum(gw.avgRssi, 'dBm')} · SNR {fmtNum(gw.avgSnr, 'dB')}</span></div>
                <div className="gis-kv-row"><span className="gis-k">Last frame</span><span className="gis-v">{fmtTime(gw.lastFrameAt)}</span></div>
                <button
                  className="gis-action-btn"
                  style={{ marginTop: 8, padding: '5px 10px', fontSize: 11.5 }}
                  onClick={() => {
                    placeGateway(gw.gatewayId);
                    setActiveView('map');
                  }}
                >
                  Show on map
                </button>
              </div>
            ))}
          </div>

          {perfVisibleCount < filteredGateways.length && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20, marginBottom: 12 }}>
              <button className="gis-load-more-btn" onClick={() => setPerfVisibleCount((prev) => Math.min(prev + 8, filteredGateways.length))}>
                Load more gateways ({filteredGateways.length - perfVisibleCount} remaining)
              </button>
            </div>
          )}

          {unplaced.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: 15 }}>Heard by meters, not on the map</h3>
              <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#64748B' }}>
                Meters report through these gateways, but no usable location is stored for them, so they cannot be drawn.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                {unplaced.map((gw) => (
                  <div key={gw.gatewayId} className="gis-card" style={{ background: '#FFFFFF' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 14 }}>{gw.gatewayId}</strong>
                      <span className={`cw-badge ${gatewayBadgeClass(gw.status)}`}>{GATEWAY_STATUS_LABEL[gw.status]}</span>
                    </div>
                    <div className="gis-kv-row"><span className="gis-k">Why</span><span className="gis-v">{gw.reason === 'no-geofence' ? 'No location stored' : 'Stored location unusable'}</span></div>
                    <div className="gis-kv-row"><span className="gis-k">Meters heard</span><span className="gis-v">{gw.metersHeard.toLocaleString()} ({gw.liveMeters.toLocaleString()} connected)</span></div>
                    <div className="gis-kv-row"><span className="gis-k">Avg link quality</span><span className="gis-v">{fmtNum(gw.avgRssi, 'dBm')} · SNR {fmtNum(gw.avgSnr, 'dB')}</span></div>
                    <div className="gis-kv-row"><span className="gis-k">Last frame</span><span className="gis-v">{fmtTime(gw.lastFrameAt)}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Meter 360 History Drawer (from the map and the table) */}
      {selectedEntity?.type === 'meter' && <MeterHistoryDrawer meter={selectedEntity.data} nearestGateway={nearestGateway} lastGateway={lastGateway} onClose={() => setSelectedEntity(null)} />}
    </div>
  );
}
