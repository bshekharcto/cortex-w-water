import { formatDistance, type GatewayReach } from '../coverage';

interface Props {
  reach: GatewayReach;
  onOpenMeter: (meterId: string) => void;
}

/** A meter this far from its gateway cannot be right (LoRa reaches kilometres, not hundreds): its position is suspect. */
const SUSPECT_DISTANCE_M = 50_000;

/** The nearest and the farthest meter that report through the open gateway, with their distance. Sits above the map legend. */
export function GatewayRangeCards({ reach, onOpenMeter }: Props) {
  return (
    <div className="gis-range" aria-label="Sending range">
      <span className="gis-range-title">Sending range</span>
      <div className="gis-range-cards">
        {([
          ['Nearest meter', reach.nearest],
          ['Farthest meter', reach.farthest],
        ] as const).map(([label, m]) => (
          <button
            key={label}
            className="gis-range-card"
            disabled={!m}
            onClick={() => m && onOpenMeter(m.meterId)}
            title={m ? 'Open this meter' : 'No meter reports through this gateway'}
          >
            <span className="gis-range-label">{label}</span>
            <span className="gis-range-id">{m ? m.meterId : '—'}</span>
            {m && <span className="gis-range-dist">{formatDistance(m.distanceM)}</span>}
            {m && m.distanceM > SUSPECT_DISTANCE_M && <span className="gis-range-warn">position looks wrong</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
