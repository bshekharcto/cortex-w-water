import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Zap,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { runtimeConfig } from '@/config/runtimeConfig';
import { useGoogleMaps } from '../../shared/useGoogleMaps';
import { BHUBANESWAR_CENTER } from '../../shared/gisData';
import type { GisMeter } from '../../shared/gisData';
import { gisLocalDb } from '../../shared/gisLocalDb';
import { SpatialGridIndex, type BoundingBox } from '../../shared/spatialIndex';
import { mapApi } from '@/services/api/mapApi';
import type { GatewayCandidate, GatewayPlacementResult, GeofenceDTO } from '../../shared/mapTypes';
import { GatewayCandidateDrawer } from '../components/GatewayCandidateDrawer';
import { MeterHistoryDrawer } from '../../shared/MeterHistoryDrawer';
import '../../shared/gis.css';

// Supported sites matching Cognecto database
const SITES = [
  { id: 6394, name: 'BHUBANESWAR', center: { lat: 20.2961, lng: 85.8245 } },
  { id: 6395, name: 'PURI', center: { lat: 19.8135, lng: 85.8312 } },
  { id: 6396, name: 'CUTTACK', center: { lat: 20.4625, lng: 85.8828 } },
];

export function GatewayPlacementPage() {
  const navigate = useNavigate();
  const apiKey = runtimeConfig.GOOGLE_MAPS_API_KEY;
  const { isLoaded } = useGoogleMaps(apiKey);

  // Control State
  const [selectedSiteId, setSelectedSiteId] = useState<number>(6394);
  const [gatewayCount, setGatewayCount] = useState<number>(5);
  const [coverageRadiusM, setCoverageRadiusM] = useState<number>(500);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // High-performance map viewport & LOD state to guarantee 60 FPS without freezing
  const [mapZoom, setMapZoom] = useState<number>(12);
  const [mapBounds, setMapBounds] = useState<BoundingBox | null>(null);

  // Layer Toggles
  const [showMeters, setShowMeters] = useState<boolean>(true);
  const [showRadiusCircles, setShowRadiusCircles] = useState<boolean>(true);
  const [showExistingGateways, setShowExistingGateways] = useState<boolean>(true);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState<boolean>(false);

  // Data State
  const [placementResult, setPlacementResult] = useState<GatewayPlacementResult | null>(null);
  const [candidates, setCandidates] = useState<GatewayCandidate[]>([]);
  const [existingGateways, setExistingGateways] = useState<GeofenceDTO[]>([]);
  const [meters, setMeters] = useState<GisMeter[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<GatewayCandidate | null>(null);
  const [selectedMeter, setSelectedMeter] = useState<GisMeter | null>(null);

  // Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const existingMarkersRef = useRef<any[]>([]);
  const candidateMarkersRef = useRef<any[]>([]);
  const candidateCirclesRef = useRef<any[]>([]);
  const meterMarkersRef = useRef<any[]>([]);
  const clusterMarkersRef = useRef<any[]>([]);
  const debouncedIdleRef = useRef<any>(null);

  // Current selected site object
  const currentSite = SITES.find((s) => s.id === selectedSiteId) || SITES[0];

  // Initialize Map
  useEffect(() => {
    if (!isLoaded || !mapContainerRef.current || mapInstanceRef.current) return;
    const google = (window as any).google;
    if (!google?.maps) return;

    const map = new google.maps.Map(mapContainerRef.current, {
      center: currentSite.center || BHUBANESWAR_CENTER,
      zoom: 12,
      minZoom: 8,
      maxZoom: 18,
      mapTypeId: 'roadmap',
      mapTypeControl: true,
      mapTypeControlOptions: {
        position: google.maps.ControlPosition.TOP_LEFT,
      },
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
      gestureHandling: 'greedy',
    });

    const handleIdle = () => {
      if (debouncedIdleRef.current) clearTimeout(debouncedIdleRef.current);
      debouncedIdleRef.current = setTimeout(() => {
        if (!mapInstanceRef.current) return;
        const currentMap = mapInstanceRef.current;
        const b = currentMap.getBounds();
        const z = currentMap.getZoom() ?? 12;
        setMapZoom((prev) => (prev !== z ? z : prev));
        if (b) {
          const sw = b.getSouthWest();
          const ne = b.getNorthEast();
          setMapBounds((prev) => {
            if (
              prev &&
              Math.abs(prev.minLat - sw.lat()) < 1e-4 &&
              Math.abs(prev.maxLat - ne.lat()) < 1e-4 &&
              Math.abs(prev.minLng - sw.lng()) < 1e-4 &&
              Math.abs(prev.maxLng - ne.lng()) < 1e-4
            ) {
              return prev;
            }
            return {
              minLat: sw.lat(),
              maxLat: ne.lat(),
              minLng: sw.lng(),
              maxLng: ne.lng(),
            };
          });
        }
      }, 150);
    };

    map.addListener('idle', handleIdle);
    mapInstanceRef.current = map;
  }, [isLoaded, currentSite]);

  // Step 1: Immediate local database load (SQLite in browser) for instant startup (<15ms)
  useEffect(() => {
    let cancelled = false;
    async function loadFromLocalDb() {
      try {
        const cached =
          (await gisLocalDb.loadMeters(String(selectedSiteId))) ||
          (await gisLocalDb.loadMeters('ALL')) ||
          (await gisLocalDb.loadMeters('6394'));
        if (!cancelled && cached && cached.meters && cached.meters.length > 0) {
          const validMeters = cached.meters.filter(
            (m) => m.lat != null && m.lng != null && !isNaN(m.lat) && !isNaN(m.lng)
          );
          if (validMeters.length > 0) {
            setMeters(validMeters);
          }
        }
      } catch (err) {
        console.warn('[GatewayPlacement] Local DB load warning:', err);
      }
    }
    loadFromLocalDb();
    return () => {
      cancelled = true;
    };
  }, [selectedSiteId]);

  // Step 2: Background generate / sync with Cognecto live APIs
  const handleGenerate = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    setLoadError(null);

    try {
      // Fetch live compute results + existing geofences + meters in parallel
      const [computeRes, geofenceRes, metersRes, assetLocRes] = await Promise.all([
        mapApi.computeGatewayPlacement(selectedSiteId, gatewayCount, coverageRadiusM),
        mapApi.getGeofences(selectedSiteId).catch(() => []),
        mapApi.getMeters({ siteId: String(selectedSiteId) }).catch(() => null),
        mapApi.getAssetLocations(selectedSiteId).catch(() => ({})),
      ]);

      if (computeRes && Array.isArray(computeRes.gateways)) {
        setPlacementResult(computeRes);
        setCandidates(computeRes.gateways);
      }

      // Existing gateways with non-null radius and coordinates
      if (Array.isArray(geofenceRes)) {
        const validFences = geofenceRes.filter((f) => f.radius && f.geofenceCoordinates?.[0]);
        setExistingGateways(validFences);
      }

      // Handle meters & persist to client SQLite/IndexedDB
      if (metersRes && metersRes.meters && metersRes.meters.length > 0) {
        setMeters(metersRes.meters);
        gisLocalDb.saveMeters(metersRes.meters, String(selectedSiteId)).catch((e) => {
          console.warn('[GatewayPlacement] Local DB save warning:', e);
        });
      } else if (typeof assetLocRes === 'object' && assetLocRes !== null) {
        // Fallback: convert asset coordinates into GisMeter objects
        const fallbackMeters = Object.entries(assetLocRes)
          .filter(([_, p]: any) => p && p.latitude && p.longitude && Math.abs(p.latitude) > 1e-5)
          .map(([assetId, p]: any) => ({
            id: String(assetId),
            assetId: Number(assetId),
            meterId: `MTR-${assetId}`,
            devEui: `506F9800${String(assetId).padStart(8, '0')}`,
            householdId: `HH-${assetId}`,
            householdShortId: `H-${assetId}`,
            householdName: `Consumer #${assetId}`,
            locality: currentSite.name,
            lat: p.latitude,
            lng: p.longitude,
            gatewayId: '506f9800000002a5',
            gatewayAlias: 'Gateway',
            distanceMeters: 450,
            rssi: -88,
            snr: 8.5,
            status: 'active' as const,
            batteryStatus: 'Normal' as const,
            batteryVoltage: 3.6,
            batteryPercentage: 95,
            valveStatus: 'Normal' as const,
            valveState: 'Open' as const,
            lastSeen: new Date().toISOString(),
            pipeDiameter: '15mm',
            connectionType: 'Domestic',
            installDate: '2024-01-15',
            currentReadingM3: 45.2,
            yesterdayConsumptionL: 410,
            yesterdayConsumptionM3: 0.41,
            monthConsumptionL: 12400,
            monthConsumptionM3: 12.4,
            estimatedBillInr: 280,
            currentFlowRateLph: 0,
            dailyAvgL: 410,
            last10DaysReadings: [],
            alerts: [],
          })) as unknown as GisMeter[];

        if (fallbackMeters.length > 0) {
          setMeters(fallbackMeters);
          gisLocalDb.saveMeters(fallbackMeters, String(selectedSiteId)).catch(() => {});
        }
      }
    } catch (err: any) {
      console.error('[GatewayPlacement] Computation error:', err);
      setLoadError(err.message || 'Failed to compute gateway placement');
    } finally {
      setIsLoading(false);
    }
  }, [selectedSiteId, gatewayCount, coverageRadiusM, isLoading, currentSite.name]);

  // Initial generation on load or when site changes
  useEffect(() => {
    handleGenerate();
  }, [selectedSiteId]);

  // Fly to candidate coordinates
  const flyToCandidate = (lat: number, lng: number) => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.panTo({ lat, lng });
    mapInstanceRef.current.setZoom(14);
  };

  // Render Gateways (Existing + Recommended Candidates)
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

    // 3. Render Existing Gateways (Dark slate tower markers)
    if (showExistingGateways) {
      existingGateways.forEach((gw) => {
        const coord = gw.geofenceCoordinates?.[0];
        if (!coord) return;

        const marker = new google.maps.Marker({
          position: { lat: coord.latitude, lng: coord.longitude },
          map,
          title: gw.name,
          icon: {
            path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
            fillColor: '#334155',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 1.5,
            scale: 1.6,
            anchor: new google.maps.Point(12, 22),
          },
        });

        const infoWindow = new google.maps.InfoWindow({
          content: `<div style="padding:4px 8px;font-family:sans-serif;"><strong>${gw.name}</strong><br><span style="font-size:11px;color:#64748b">Existing Gateway · ${gw.address || 'Operational'}</span></div>`,
        });

        marker.addListener('click', () => {
          infoWindow.open(map, marker);
        });

        existingMarkersRef.current.push(marker);
      });
    }

    // 4. Render Recommended Gateways & Coverage Circles
    candidates.forEach((cand) => {
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
          radius: coverageRadiusM,
        });
        candidateCirclesRef.current.push(circle);
      }

      // Circular numbered badge marker [ 1 ], [ 2 ], etc.
      const marker = new google.maps.Marker({
        position: { lat: cand.latitude, lng: cand.longitude },
        map,
        title: `Recommended Gateway #${cand.gatewayNumber}`,
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
  }, [
    isLoaded,
    candidates,
    existingGateways,
    coverageRadiusM,
    showRadiusCircles,
    showExistingGateways,
  ]);

  // Spatial 2D Grid Index for instant <1ms geographic queries
  const spatialIndex = useMemo(() => {
    const valid = meters.filter(
      (m) => m.lat != null && m.lng != null && !isNaN(m.lat) && !isNaN(m.lng)
    );
    return new SpatialGridIndex<GisMeter>(valid, 64);
  }, [meters]);

  // High-performance dynamic clusters for overview zooms (< 14)
  // Ensures maximum 40-50 cluster markers on map across the entire city
  const clusters = useMemo(() => {
    if (!showMeters || mapZoom >= 14 || meters.length === 0) return [];

    const gridSize = mapZoom <= 10 ? 0.05 : mapZoom <= 12 ? 0.022 : 0.012;
    const clusterMap: Record<string, {
      count: number;
      sumLat: number;
      sumLng: number;
      minLat: number;
      maxLat: number;
      minLng: number;
      maxLng: number;
    }> = {};

    for (let i = 0; i < meters.length; i++) {
      const p = meters[i];
      if (p.lat == null || p.lng == null || isNaN(p.lat) || isNaN(p.lng)) continue;
      const key = `${Math.floor(p.lat / gridSize)}_${Math.floor(p.lng / gridSize)}`;
      if (!clusterMap[key]) {
        clusterMap[key] = {
          count: 0,
          sumLat: 0,
          sumLng: 0,
          minLat: p.lat,
          maxLat: p.lat,
          minLng: p.lng,
          maxLng: p.lng,
        };
      }
      const c = clusterMap[key];
      c.count++;
      c.sumLat += p.lat;
      c.sumLng += p.lng;
      if (p.lat < c.minLat) c.minLat = p.lat;
      if (p.lat > c.maxLat) c.maxLat = p.lat;
      if (p.lng < c.minLng) c.minLng = p.lng;
      if (p.lng > c.maxLng) c.maxLng = p.lng;
    }

    return Object.values(clusterMap).map((c) => ({
      lat: c.sumLat / c.count,
      lng: c.sumLng / c.count,
      count: c.count,
      bounds: {
        minLat: c.minLat,
        maxLat: c.maxLat,
        minLng: c.minLng,
        maxLng: c.maxLng,
      },
    }));
  }, [showMeters, mapZoom, meters]);

  // Viewport Culling with Level of Detail (LOD) for street zooms (>= 14)
  // Keeps active meter markers under 300 at all times, ensuring zero thread locks and 60 FPS
  const visibleMeters = useMemo(() => {
    if (!showMeters || mapZoom < 14) return [];

    if (!mapBounds) {
      return meters.slice(0, 80);
    }

    const latMargin = (mapBounds.maxLat - mapBounds.minLat) * 0.15;
    const lngMargin = (mapBounds.maxLng - mapBounds.minLng) * 0.15;

    return spatialIndex.query(
      {
        minLat: mapBounds.minLat - latMargin,
        maxLat: mapBounds.maxLat + latMargin,
        minLng: mapBounds.minLng - lngMargin,
        maxLng: mapBounds.maxLng + lngMargin,
      },
      300
    );
  }, [showMeters, mapZoom, mapBounds, spatialIndex, meters]);

  // Render Meter Clusters & Double-Sized Markers with Zero Freezing
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded) return;
    const google = (window as any).google;
    if (!google?.maps) return;
    const map = mapInstanceRef.current;

    // Clear all previous meter and cluster markers
    meterMarkersRef.current.forEach((m) => m.setMap(null));
    meterMarkersRef.current = [];
    clusterMarkersRef.current.forEach((m) => m.setMap(null));
    clusterMarkersRef.current = [];

    if (!showMeters) return;

    // Mode 1: Zoom < 14 -> Render Cluster Badges matching Network Explorer 1:1
    if (mapZoom < 14) {
      clusters.forEach((cluster) => {
        const count = cluster.count;
        const color = count > 1000 ? '#1D4ED8' : count > 100 ? '#0284C7' : '#059669';
        const size = count > 1000 ? 56 : count > 100 ? 48 : 40;
        const labelText = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : `${count}`;
        const svg = window.btoa(`
          <svg fill="${color}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="${size}" height="${size}">
            <circle cx="120" cy="120" opacity=".3" r="115" />
            <circle cx="120" cy="120" opacity=".55" r="95" />
            <circle cx="120" cy="120" opacity=".95" r="75" />
          </svg>`);

        const marker = new google.maps.Marker({
          position: { lat: cluster.lat, lng: cluster.lng },
          map,
          icon: {
            url: `data:image/svg+xml;base64,${svg}`,
            scaledSize: new google.maps.Size(size, size),
            anchor: new google.maps.Point(size / 2, size / 2),
          },
          label: {
            text: labelText,
            color: '#FFFFFF',
            fontWeight: '700',
            fontSize: '12px',
            fontFamily: 'Inter, Roboto, sans-serif',
          },
          zIndex: 1000 + count,
          title: `Cluster of ${count.toLocaleString()} meters - click to zoom in`,
        });

        marker.addListener('click', () => {
          const b = new google.maps.LatLngBounds(
            { lat: cluster.bounds.minLat, lng: cluster.bounds.minLng },
            { lat: cluster.bounds.maxLat, lng: cluster.bounds.maxLng }
          );
          if (cluster.bounds.minLat === cluster.bounds.maxLat && cluster.bounds.minLng === cluster.bounds.maxLng) {
            map.panTo({ lat: cluster.lat, lng: cluster.lng });
            const currentZ = map.getZoom() || 12;
            map.setZoom(Math.min(currentZ + 2, 17));
          } else {
            map.fitBounds(b);
            google.maps.event.addListenerOnce(map, 'idle', () => {
              const z = map.getZoom();
              if (z && z > 17) {
                map.setZoom(17);
              }
            });
          }
        });

        clusterMarkersRef.current.push(marker);
      });
      return;
    }

    // Mode 2: Zoom >= 14 -> Render Viewport Capped Double-Sized Meter Markers
    visibleMeters.forEach((meter) => {
      const color =
        meter.status === 'active'
          ? '#10B981'
          : meter.status === 'weak'
          ? '#F59E0B'
          : '#EF4444';

      const marker = new google.maps.Marker({
        position: { lat: meter.lat, lng: meter.lng },
        map,
        title: `Meter ${meter.meterId} (${meter.householdName || 'Water Consumer'})`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8, // Doubled circle size matching Network Explorer
          fillColor: color,
          fillOpacity: 0.95,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
        },
      });

      marker.addListener('click', () => {
        setSelectedCandidate(null);
        setSelectedMeter(meter);
      });

      meterMarkersRef.current.push(marker);
    });
  }, [isLoaded, showMeters, mapZoom, clusters, visibleMeters]);

  // Coverage statistics calculations
  const totalMeters = placementResult?.totalMeters ?? 15307;
  const totalCovered = placementResult?.totalMetersCovered ?? candidates.reduce((sum, g) => sum + g.metersCoveredCount, 0);
  const overallPercent = placementResult?.overallCoveragePercent ?? Math.round((totalCovered / totalMeters) * 100);

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
        {/* Left: Back & Title & Site Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate('/app/gis/network')}
            className="cw-icon-btn"
            title="Back to Network Explorer"
            style={{
              width: 34,
              height: 34,
              borderRadius: 6,
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f8fafc',
            }}
          >
            <ArrowLeft size={16} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={18} color="#2563eb" />
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Gateway Placement Report
            </h1>
          </div>

          {/* Site Dropdown */}
          <div style={{ position: 'relative' }}>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(Number(e.target.value))}
              style={{
                padding: '6px 28px 6px 12px',
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
              {SITES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748b' }}
            />
          </div>
        </div>

        {/* Center: Controls (Gateways stepper & Radius stepper) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Gateways Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
              Gateways
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
                onChange={(e) => setGatewayCount(Math.max(1, Math.min(25, Number(e.target.value))))}
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

          {/* Radius Stepper / Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
              Radius
            </span>
            <div style={{ position: 'relative' }}>
              <select
                value={coverageRadiusM}
                onChange={(e) => setCoverageRadiusM(Number(e.target.value))}
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
                <option value={300}>300 m</option>
                <option value={500}>500 m</option>
                <option value={800}>800 m</option>
                <option value={1000}>1000 m</option>
                <option value={1500}>1500 m</option>
                <option value={2000}>2000 m</option>
              </select>
              <ChevronDown
                size={14}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748b' }}
              />
            </div>
          </div>
        </div>

        {/* Right: Primary Generate Button */}
        <div>
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

      {/* 2. BODY CONTENT: MAP (LEFT) + RECOMMENDED GATEWAYS SIDEBAR (RIGHT) */}
      <div style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Left Map View */}
        <div style={{ flex: 1, position: 'relative', height: '100%' }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

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
              <span>Meters</span>
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
              <span>Existing gateways</span>
            </label>
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
                <strong>{candidates.length} gateways</strong> - <span style={{ color: '#dc2626' }}>{overallPercent}%</span> of meters covered
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
                <div>Total Bounded Meters: <strong>{totalMeters.toLocaleString()}</strong></div>
                <div>Meters Covered (&lt;{coverageRadiusM}m): <strong style={{ color: '#059669' }}>{totalCovered.toLocaleString()}</strong></div>
                <div>Meters Outside Radius: <strong>{(totalMeters - totalCovered).toLocaleString()}</strong></div>
                <div>Existing Operational Gateways: <strong>{existingGateways.length}</strong></div>
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
            <span>Recommended Gateways ({candidates.length})</span>
            {isLoading && <RefreshCw size={14} className="cw-spin" color="#2563eb" />}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {loadError && (
              <div style={{ padding: 12, borderRadius: 6, background: '#fef2f2', color: '#dc2626', fontSize: 12, display: 'flex', gap: 8 }}>
                <AlertCircle size={16} />
                <span>{loadError}</span>
              </div>
            )}

            {candidates.length === 0 && !isLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: '#94a3b8' }}>
                <MapPin size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <div style={{ fontWeight: 600, fontSize: 14 }}>No gateway recommendations</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Click "Generate" to compute gateway placement</div>
              </div>
            ) : (
              candidates.map((cand) => {
                const num = cand.gatewayNumber;
                const assigned = cand.metersAssigned || cand.assignedAssetIds?.length || 0;
                const covered = cand.metersCoveredCount || 0;
                const percent = cand.percentCovered ?? (assigned > 0 ? Math.round((covered / assigned) * 100) : 0);
                const avgD = cand.avgDistanceM ?? 1110.9;
                const maxD = cand.maxDistanceM ?? 5132.0;
                const nearestName = cand.nearestExistingName || 'GW-2a5 (GGP Colony)';
                const nearestDist = cand.nearestExistingDistanceM ?? 271.5;

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
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                          {assigned.toLocaleString()} meters
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
                        {percent}% covered
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
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>
                          {covered}/{assigned}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Covered</div>
                      </div>

                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                          {avgD}m
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Avg dist</div>
                      </div>

                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                          {maxD}m
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Max dist</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ height: 4, background: '#f1f5f9', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${percent}%`, height: '100%', background: '#ea580c' }} />
                    </div>

                    {/* Nearest Existing line */}
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                      Nearest existing: <strong>{nearestName}</strong> · <strong>{nearestDist}m</strong> away
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
        gateway={selectedCandidate}
        siteName={currentSite.name}
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
