import { useMemo } from 'react';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';
import type { NetGateway } from '@/services/api/networkApi';
import { computeGatewayReach, formatDistance } from '../coverage';
import { gatewayLabel, METER_STATUS_STYLE, type MeterPoint } from '../networkModel';

interface Props {
  gateway: NetGateway;
  /** Every meter with a position in the area (not narrowed by the page's filters): the radius counts all of them. */
  points: ReadonlyArray<MeterPoint>;
  radiusM: number;
  onRadiusChange: (radiusM: number) => void;
  onClose: () => void;
  onOpenMeter: (meterId: string) => void;
}

export const MIN_RADIUS_M = 50;
const STEP_M = 10;
const NUDGE_M = 50;
/** A meter this far from its gateway cannot be right (LoRa reaches kilometres, not hundreds): its position is suspect. */
const SUSPECT_DISTANCE_M = 50_000;

export function defaultRadius(gateway: NetGateway): number {
  return gateway.radiusM && gateway.radiusM > 0 ? gateway.radiusM : 500;
}

const n = (v: number) => v.toLocaleString();

/**
 * What a gateway reaches, drawn over the map: the circle of the chosen radius, how many meters report through the gateway,
 * its nearest and farthest meter, and how many meters a given radius would cover. The slider only changes the picture and
 * the numbers: it never changes the gateway's stored radius.
 */
export function GatewayCoveragePanel({ gateway, points, radiusM, onRadiusChange, onClose, onOpenMeter }: Props) {
  const reach = useMemo(() => computeGatewayReach(points, gateway), [points, gateway]);
  const cov = reach.coverageAt(radiusM);
  const stored = defaultRadius(gateway);
  const max = Math.max(3000, Math.ceil((stored * 2) / 500) * 500);
  const pct = Math.min(100, Math.max(0, ((radiusM - MIN_RADIUS_M) / (max - MIN_RADIUS_M)) * 100));
  const clamp = (v: number) => Math.min(max, Math.max(MIN_RADIUS_M, Math.round(v)));

  const bar = (value: number, color: string) => (
    <span className="gis-cov-bar-seg" style={{ width: cov.total ? `${(value / cov.total) * 100}%` : 0, background: color }} />
  );

  return (
    <aside className="gis-cov-panel" aria-label="Gateway coverage">
      <header className="gis-cov-head">
        <div>
          <span className="gis-cov-eyebrow">Gateway coverage</span>
          <span className="gis-cov-name">{gatewayLabel(gateway)}</span>
        </div>
        <button className="gis-drawer-close" onClick={onClose} aria-label="Close coverage">
          <X size={16} />
        </button>
      </header>

      <div className="gis-cov-hero">
        <span className="gis-cov-hero-num">{n(reach.metersOnGateway)}</span>
        <span className="gis-cov-hero-label">meters on this gateway</span>
      </div>

      <div className="gis-cov-range-cards">
        {([
          ['Nearest meter', reach.nearest],
          ['Farthest meter', reach.farthest],
        ] as const).map(([label, m]) => (
          <button
            key={label}
            className="gis-cov-range-card"
            disabled={!m}
            onClick={() => m && onOpenMeter(m.meterId)}
            title={m ? 'Open this meter' : undefined}
          >
            <span className="gis-cov-range-label">{label}</span>
            {m ? (
              <>
                <span className="gis-cov-range-id">{m.meterId}</span>
                <span className="gis-cov-range-dist">{formatDistance(m.distanceM)}</span>
                {m.distanceM > SUSPECT_DISTANCE_M && <span className="gis-cov-range-warn">position looks wrong</span>}
              </>
            ) : (
              <span className="gis-cov-range-id">—</span>
            )}
          </button>
        ))}
      </div>

      <div className="gis-cov-radius">
        <div className="gis-cov-radius-head">
          <span className="gis-cov-section">Radius</span>
          <div className="gis-cov-stepper">
            <button onClick={() => onRadiusChange(clamp(radiusM - NUDGE_M))} disabled={radiusM <= MIN_RADIUS_M} aria-label="Decrease radius">
              <Minus size={12} />
            </button>
            <input
              type="number"
              min={MIN_RADIUS_M}
              max={max}
              step={STEP_M}
              value={radiusM}
              onChange={(e) => e.target.value !== '' && onRadiusChange(clamp(Number(e.target.value)))}
              aria-label="Radius in metres"
            />
            <span className="gis-cov-unit">m</span>
            <button onClick={() => onRadiusChange(clamp(radiusM + NUDGE_M))} disabled={radiusM >= max} aria-label="Increase radius">
              <Plus size={12} />
            </button>
          </div>
        </div>
        <input
          className="gis-cov-slider"
          type="range"
          min={MIN_RADIUS_M}
          max={max}
          step={STEP_M}
          value={Math.min(max, radiusM)}
          style={{ ['--pct' as string]: `${pct}%` }}
          onChange={(e) => onRadiusChange(clamp(Number(e.target.value)))}
          aria-label="Coverage radius"
        />
        {gateway.radiusM ? (
          <div className="gis-cov-legend">
            <span><i className="gis-cov-key gis-cov-key--stored" />Stored radius {n(gateway.radiusM)} m (fixed)</span>
            <span><i className="gis-cov-key gis-cov-key--chosen" />Chosen radius</span>
          </div>
        ) : null}
        <div className="gis-cov-scale">
          <span>{MIN_RADIUS_M} m</span>
          <button
            className="gis-cov-reset"
            onClick={() => onRadiusChange(clamp(stored))}
            disabled={radiusM === clamp(stored)}
            title="Back to the radius stored for this gateway"
          >
            <RotateCcw size={11} /> Stored {n(stored)} m
          </button>
          <span>{formatDistance(max)}</span>
        </div>
      </div>

      <div className="gis-cov-result" role="status" aria-live="polite">
        <span className="gis-cov-result-num">{n(cov.total)}</span>
        <span className="gis-cov-result-label">meters within {n(radiusM)} m of this gateway</span>
        <div className="gis-cov-bar" aria-hidden>
          {bar(cov.connected, METER_STATUS_STYLE.connected.color)}
          {bar(cov.disconnected, METER_STATUS_STYLE.disconnected.color)}
          {bar(cov.never, METER_STATUS_STYLE.never.color)}
        </div>
        <div className="gis-cov-breakdown">
          <span><i style={{ background: METER_STATUS_STYLE.connected.color }} />Connected {n(cov.connected)}</span>
          <span><i style={{ background: METER_STATUS_STYLE.disconnected.color }} />Disconnected {n(cov.disconnected)}</span>
          <span><i style={{ background: METER_STATUS_STYLE.never.color }} />Never seen {n(cov.never)}</span>
        </div>
        <div className="gis-cov-split-title">Which gateway they report through</div>
        <ul className="gis-cov-split">
          <li title="Their latest frames came in through this gateway">
            <b>{n(cov.onThisGateway)}</b>
            <span>
              <strong>This gateway</strong>
              <em>already report through it</em>
            </span>
          </li>
          <li title="Inside this circle, but their latest frames came in through a different gateway">
            <b>{n(cov.onOtherGateway)}</b>
            <span>
              <strong>A different gateway</strong>
              <em>in range, but use another one</em>
            </span>
          </li>
          <li title="No frame has ever been received from them, so no gateway is known">
            <b>{n(cov.noGateway)}</b>
            <span>
              <strong>No gateway yet</strong>
              <em>never reported, so none is known</em>
            </span>
          </li>
        </ul>
      </div>
    </aside>
  );
}
