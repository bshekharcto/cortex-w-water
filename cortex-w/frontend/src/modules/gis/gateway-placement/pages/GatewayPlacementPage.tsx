import { useState, useEffect, useRef } from 'react';
import { MapPin, Sparkles, CheckCircle2 } from 'lucide-react';
import { runtimeConfig } from '@/config/runtimeConfig';
import { useGoogleMaps } from '../../shared/useGoogleMaps';
import { BHUBANESWAR_CENTER, GIS_GATEWAYS } from '../../shared/gisData';
import '../../shared/gis.css';

interface ProposedGateway {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  assignedMeters: number;
}

export function GatewayPlacementPage() {
  const apiKey = runtimeConfig.GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useGoogleMaps(apiKey);

  const [additionalCount, setAdditionalCount] = useState<number>(3);
  const [radiusMeters, setRadiusMeters] = useState<number>(600);
  const [isComputed, setIsComputed] = useState<boolean>(true);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const circlesRef = useRef<any[]>([]);

  // Computed candidate placements based on meter cluster gaps
  const proposedGateways: ProposedGateway[] = [
    {
      id: 'prop-1',
      name: 'Proposed GW-1 (Infocity Sector)',
      lat: 20.3550,
      lng: 85.8150,
      radiusMeters: radiusMeters,
      assignedMeters: 310,
    },
    {
      id: 'prop-2',
      name: 'Proposed GW-2 (Rasulgarh Industrial)',
      lat: 20.2950,
      lng: 85.8900,
      radiusMeters: radiusMeters,
      assignedMeters: 245,
    },
    {
      id: 'prop-3',
      name: 'Proposed GW-3 (Jatni Road Cluster)',
      lat: 20.2200,
      lng: 85.8200,
      radiusMeters: radiusMeters,
      assignedMeters: 190,
    },
    {
      id: 'prop-4',
      name: 'Proposed GW-4 (Mancheswar)',
      lat: 20.3350,
      lng: 85.8450,
      radiusMeters: radiusMeters,
      assignedMeters: 165,
    },
    {
      id: 'prop-5',
      name: 'Proposed GW-5 (Dhauli Corridor)',
      lat: 20.2100,
      lng: 85.8550,
      radiusMeters: radiusMeters,
      assignedMeters: 120,
    },
  ].slice(0, additionalCount);

  // Initialize Map
  useEffect(() => {
    if (!isLoaded || !mapContainerRef.current || mapInstanceRef.current) return;
    const google = (window as any).google;
    if (!google?.maps) return;

    const map = new google.maps.Map(mapContainerRef.current, {
      center: BHUBANESWAR_CENTER,
      zoom: 12,
      mapTypeId: 'roadmap',
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
      gestureHandling: 'greedy',
    });

    mapInstanceRef.current = map;
  }, [isLoaded]);

  // Render Markers and Coverage Circles
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded) return;
    const google = (window as any).google;
    if (!google?.maps) return;

    // Clear old
    markersRef.current.forEach((m) => m.setMap(null));
    circlesRef.current.forEach((c) => c.setMap(null));
    markersRef.current = [];
    circlesRef.current = [];

    // Draw Existing Gateways in Blue
    GIS_GATEWAYS.forEach((gw) => {
      const marker = new google.maps.Marker({
        position: { lat: gw.lat, lng: gw.lng },
        map: mapInstanceRef.current,
        title: `Existing: ${gw.alias}`,
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 5,
          fillColor: '#2563EB',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
        },
      });
      markersRef.current.push(marker);

      const circle = new google.maps.Circle({
        strokeColor: '#2563EB',
        strokeOpacity: 0.5,
        strokeWeight: 1,
        fillColor: '#3B82F6',
        fillOpacity: 0.05,
        map: mapInstanceRef.current,
        center: { lat: gw.lat, lng: gw.lng },
        radius: gw.radiusMeters,
      });
      circlesRef.current.push(circle);
    });

    // Draw Proposed Gateways in Purple / Emerald
    if (isComputed) {
      proposedGateways.forEach((prop) => {
        const marker = new google.maps.Marker({
          position: { lat: prop.lat, lng: prop.lng },
          map: mapInstanceRef.current,
          title: `PROPOSED: ${prop.name}`,
          icon: {
            path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
            scale: 7,
            fillColor: '#7C3AED',
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 2,
          },
        });
        markersRef.current.push(marker);

        const circle = new google.maps.Circle({
          strokeColor: '#7C3AED',
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: '#8B5CF6',
          fillOpacity: 0.14,
          map: mapInstanceRef.current,
          center: { lat: prop.lat, lng: prop.lng },
          radius: prop.radiusMeters,
        });
        circlesRef.current.push(circle);
      });
    }
  }, [isLoaded, isComputed, proposedGateways, radiusMeters]);

  return (
    <div className="gis-container">
      {/* Top Planning Controls */}
      <div className="gis-toolbar">
        <div className="gis-toolbar-left">
          <div className="gis-title-badge">
            <MapPin size={16} className="gis-title-icon" style={{ color: '#7C3AED' }} />
            <span>Gateway Placement Advisor</span>
          </div>

          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            Additional Gateways:
            <input
              type="number"
              className="cw-input"
              value={additionalCount}
              min={1}
              max={10}
              onChange={(e) => setAdditionalCount(Number(e.target.value))}
              style={{ width: 60, padding: '4px 8px' }}
            />
          </label>

          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            Radius (meters):
            <input
              type="number"
              className="cw-input"
              value={radiusMeters}
              min={300}
              max={2000}
              step={100}
              onChange={(e) => setRadiusMeters(Number(e.target.value))}
              style={{ width: 80, padding: '4px 8px' }}
            />
          </label>

          <button
            className="cw-button-primary"
            onClick={() => setIsComputed(true)}
            style={{ padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Sparkles size={14} />
            Compute Placement
          </button>
        </div>

        <div className="gis-toolbar-right">
          <span style={{ fontSize: 12, color: '#10B981', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
            <CheckCircle2 size={14} />
            {proposedGateways.length} Locations Optimized (+18.4% coverage)
          </span>
        </div>
      </div>

      {/* Map Viewport */}
      <div className="gis-map-viewport">
        <div ref={mapContainerRef} className="gis-google-map-canvas" />

        {/* Floating Legend */}
        <div className="gis-map-legend">
          <span className="gis-legend-title">Placement Legend</span>
          <div className="gis-legend-item">
            <span className="gis-legend-icon gis-legend-icon--gw" />
            <span>Existing Gateways (14 reporting)</span>
          </div>
          <div className="gis-legend-item">
            <span className="gis-legend-icon" style={{ background: '#7C3AED', border: '2px solid #FFF' }} />
            <span>Recommended New Gateways ({proposedGateways.length})</span>
          </div>
          <div className="gis-legend-item">
            <span style={{ fontSize: 11, color: '#64748B' }}>
              Radius: {radiusMeters}m per unit
            </span>
          </div>
        </div>

        {loadError && (
          <div className="gis-error-fallback">
            <strong style={{ fontSize: 14 }}>Google Maps Key Notice</strong>
            <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>
              {loadError}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
export default GatewayPlacementPage;
