/**
 * Utilities for generating LoRaWAN Gateway Network Box Icons with Antenna
 */

export function getGatewaySvg(status: string = 'reporting'): string {
  let primaryColor = '#2563EB'; // Blue for active/reporting
  let glowColor = '#60A5FA';
  if (status === 'degraded') {
    primaryColor = '#F59E0B'; // Amber
    glowColor = '#FBBF24';
  } else if (status === 'stale' || status === 'offline') {
    primaryColor = '#64748B'; // Slate
    glowColor = '#94A3B8';
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 44" width="38" height="44">
  <!-- Radio / RF Broadcast Waves -->
  <path d="M 28 3 A 4.5 4.5 0 0 1 31 7.5" fill="none" stroke="${primaryColor}" stroke-width="2" stroke-linecap="round"/>
  <path d="M 31.5 0.5 A 9 9 0 0 1 35.5 9" fill="none" stroke="${glowColor}" stroke-width="1.8" stroke-linecap="round" opacity="0.85"/>
  
  <!-- Antenna Rod & Tip -->
  <rect x="23.5" y="12.5" width="4" height="3" rx="1" fill="#334155"/>
  <line x1="25.5" y1="12.5" x2="25.5" y2="4" stroke="#1E293B" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="25.5" cy="4" r="2.5" fill="${primaryColor}" stroke="#FFFFFF" stroke-width="1.5"/>
  
  <!-- Bottom Pointer / Anchor Pin pointing to map coordinate -->
  <path d="M 14 33 L 19 42.5 L 24 33 Z" fill="${primaryColor}" stroke="#FFFFFF" stroke-width="1.5" stroke-linejoin="round"/>
  
  <!-- Network Gateway Box Body -->
  <rect x="5" y="14" width="28" height="20" rx="4" fill="${primaryColor}" stroke="#FFFFFF" stroke-width="2"/>
  
  <!-- Inset Faceplate / Bezel -->
  <rect x="8" y="17" width="22" height="14" rx="2" fill="#0F172A" opacity="0.38"/>
  
  <!-- Front Panel Status LEDs (Power, LoRa Link, WAN) -->
  <circle cx="12" cy="22" r="1.6" fill="#22C55E"/>
  <circle cx="16.5" cy="22" r="1.6" fill="#38BDF8"/>
  <circle cx="21" cy="22" r="1.6" fill="#FBBF24"/>
  
  <!-- Network Ports / Connection Jacks -->
  <rect x="11" y="25.5" width="6" height="3.5" rx="0.8" fill="#FFFFFF" opacity="0.85"/>
  <rect x="19" y="25.5" width="6" height="3.5" rx="0.8" fill="#FFFFFF" opacity="0.85"/>
</svg>`;
}

export function getGatewayMapMarkerIcon(status: string = 'reporting', scale: number = 1.0) {
  const width = Math.round(36 * scale);
  const height = Math.round(42 * scale);
  const svg = getGatewaySvg(status);
  const encoded = encodeURIComponent(svg);
  const google = (window as any).google;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encoded}`,
    scaledSize: new google.maps.Size(width, height),
    anchor: new google.maps.Point(Math.round(18 * scale), Math.round(41 * scale)),
  };
}
