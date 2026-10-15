import { useEffect, useRef } from 'react';
import { Dialog } from '@/modules/dashboard/components/Dialog';
import { runtimeConfig } from '@/config/runtimeConfig';
import { useGoogleMaps } from '../../shared/useGoogleMaps';
import { getGatewayMapMarkerIcon } from '../../shared/gatewayIconUtils';
import type { GatewayConnectivity } from '@/services/api/gatewayStatusApi';
import { STATE_LABEL } from '../gatewayStatusModel';

interface GatewayMapDialogProps {
  gateway: GatewayConnectivity;
  onClose: () => void;
}

/** What a row's map button opens: the gateway pinned on the map, in the same icon the Network Explorer uses. */
export function GatewayMapDialog({ gateway, onClose }: GatewayMapDialogProps) {
  const { isLoaded, loadError } = useGoogleMaps(runtimeConfig.GOOGLE_MAPS_API_KEY);
  const container = useRef<HTMLDivElement | null>(null);
  const { latitude, longitude } = gateway;
  const placed = latitude != null && longitude != null;

  useEffect(() => {
    const google = (window as any).google;
    if (!placed || !isLoaded || !container.current || !google?.maps) return;
    const position = { lat: latitude, lng: longitude };
    const map = new google.maps.Map(container.current, {
      center: position,
      zoom: 16,
      mapTypeId: 'roadmap',
      streetViewControl: false,
      fullscreenControl: true,
    });
    const marker = new google.maps.Marker({
      position,
      map,
      title: gateway.gatewayId,
      // The explorer's icon set knows reporting / degraded / stale: a gateway that is not up looks like a stale one.
      icon: getGatewayMapMarkerIcon(gateway.status === 'online' ? 'reporting' : 'stale', 1.3),
    });
    // Built as DOM, not an HTML string: nothing from the upstream is ever parsed as markup.
    const content = document.createElement('div');
    content.style.cssText = 'font:13px system-ui;line-height:1.5';
    const id = document.createElement('strong');
    id.textContent = gateway.gatewayId;
    content.append(id, document.createElement('br'), STATE_LABEL[gateway.status]);
    const info = new google.maps.InfoWindow({ content });
    info.open({ map, anchor: marker });
    return () => {
      info.close();
      marker.setMap(null);
    };
  }, [placed, isLoaded, latitude, longitude, gateway.gatewayId, gateway.status]);

  return (
    <Dialog title={`Gateway ${gateway.gatewayId}`} onClose={onClose} width="min(900px, 94vw)" height="min(620px, 86vh)">
      <div className="gs-map-meta">
        <span className={`cw-badge cw-badge--${gateway.status === 'online' ? 'green' : gateway.status === 'offline' ? 'red' : 'muted'}`}>
          {STATE_LABEL[gateway.status]}
        </span>
        {gateway.address && <span>{gateway.address}</span>}
        {placed && <span className="gs-mono">{latitude.toFixed(6)}, {longitude.toFixed(6)}</span>}
      </div>
      <div className="gs-map-box">
        {!placed && <div className="gs-map-note">This gateway has no coordinates on record.</div>}
        {placed && loadError && <div className="gs-map-note gs-map-note--error">{loadError}</div>}
        {placed && !loadError && !isLoaded && (
          <div className="gs-map-note">
            <div className="cw-spinner" />
          </div>
        )}
        {placed && !loadError && <div ref={container} style={{ width: '100%', height: '100%', visibility: isLoaded ? 'visible' : 'hidden' }} />}
      </div>
    </Dialog>
  );
}
