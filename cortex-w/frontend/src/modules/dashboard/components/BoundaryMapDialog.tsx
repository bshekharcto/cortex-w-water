import { useEffect, useRef, useState } from 'react';
import { Dialog } from './Dialog';
import { fetchNodeBoundaries } from '../services/dashboardDataService';
import { runtimeConfig } from '@/config/runtimeConfig';
import { useGoogleMaps } from '@/modules/gis/shared/useGoogleMaps';
import type { Boundary } from '../models/dashboardTrend';

interface BoundaryMapDialogProps {
  nodeId: string;
  nodeName: string;
  onClose: () => void;
}

const COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

// The centre of a polygon (area-weighted), falling back to the average of its points for a degenerate one.
function centroid(path: Array<{ lat: number; lng: number }>): { lat: number; lng: number } {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < path.length; i++) {
    const p0 = path[i];
    const p1 = path[(i + 1) % path.length];
    const cross = p0.lng * p1.lat - p1.lng * p0.lat;
    area += cross;
    cx += (p0.lng + p1.lng) * cross;
    cy += (p0.lat + p1.lat) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) {
    return {
      lat: path.reduce((sum, p) => sum + p.lat, 0) / path.length,
      lng: path.reduce((sum, p) => sum + p.lng, 0) / path.length,
    };
  }
  return { lat: cy / (6 * area), lng: cx / (6 * area) };
}

// What the map icon of a zone / DMA opens: the boundary polygons under it, drawn on a satellite map.
export function BoundaryMapDialog({ nodeId, nodeName, onClose }: BoundaryMapDialogProps) {
  const { isLoaded, loadError } = useGoogleMaps(runtimeConfig.GOOGLE_MAPS_API_KEY);
  const [boundaries, setBoundaries] = useState<Boundary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const container = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchNodeBoundaries(nodeId)
      .then((res) => {
        if (cancelled) return;
        setBoundaries(res);
        setState('ready');
      })
      .catch((err) => {
        console.warn('[BoundaryMapDialog] Could not load the boundaries:', err);
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  const hasBoundary = state === 'ready' && boundaries.length > 0;

  useEffect(() => {
    const google = (window as any).google;
    if (!hasBoundary || !isLoaded || !container.current || !google?.maps) return;

    const map = new google.maps.Map(container.current, {
      zoom: 15,
      mapTypeId: 'satellite',
      streetViewControl: false,
    });
    const bounds = new google.maps.LatLngBounds();

    boundaries.forEach((b, index) => {
      const color = COLORS[index % COLORS.length];
      new google.maps.Polygon({
        paths: b.points,
        strokeColor: color,
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: 0.3,
        map,
      });
      new google.maps.Marker({
        position: centroid(b.points),
        map,
        title: b.name,
        label: { text: b.name, color: '#fff', fontSize: '12px', fontWeight: '600' },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
      });
      b.points.forEach((p) => bounds.extend(p));
    });
    map.fitBounds(bounds);
  }, [hasBoundary, isLoaded, boundaries]);

  return (
    <Dialog title={`Boundary — ${nodeName}`} onClose={onClose} width="75vw" height="78vh">
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {state === 'loading' && (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
            <div className="cw-spinner" />
          </div>
        )}
        {state === 'error' && (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--cw-red)' }}>
            The boundary could not be loaded. Please try again.
          </div>
        )}
        {state === 'ready' && boundaries.length === 0 && (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--cw-text-muted)' }}>
            No boundary has been drawn for this area yet.
          </div>
        )}
        {hasBoundary && loadError && (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--cw-red)', textAlign: 'center' }}>
            {loadError}
          </div>
        )}
        {hasBoundary && !loadError && <div ref={container} style={{ width: '100%', height: '100%', borderRadius: 6 }} />}
      </div>
    </Dialog>
  );
}
