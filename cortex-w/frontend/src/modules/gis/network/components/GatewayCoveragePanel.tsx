import { Minus, Plus, RotateCcw, X } from 'lucide-react';
import type { NetGateway } from '@/services/api/networkApi';
import { formatDistance, type GatewayReach } from '../coverage';
import { gatewayLabel, METER_STATUS_STYLE } from '../networkModel';

interface Props {
  gateway: NetGateway;
  /** What the gateway reaches, from every meter with a position in the area (not narrowed by the page's filters). */
  reach: GatewayReach;
  radiusM: number;
  onRadiusChange: (radiusM: number) => void;
  onClose: () => void;
}

export const MIN_RADIUS_M = 50;
const STEP_M = 10;
const NUDGE_M = 50;

export function defaultRadius(gateway: NetGateway): number {
  return gateway.radiusM && gateway.radiusM > 0 ? gateway.radiusM : 500;
}

const n = (v: number) => v.toLocaleString();

/**
 * What a gateway reaches, drawn over the map: the circle of the chosen radius, how many meters report through the gateway,
 * its nearest and farthest meter, and how many meters a given radius would cover. The slider only changes the picture and
 * the numbers: it never changes the gateway's stored radius.
 */
export function GatewayCoveragePanel({ gateway, reach, radiusM, onRadiusChange, onClose }: Props) {
  const cov = reach.coverageAt(radiusM);
  const stored = defaultRadius(gateway);
  const max = Math.max(3000, Math.ceil((stored * 2) / 500) * 500);
  const pct = Math.min(100, Math.max(0, ((radiusM - MIN_RADIUS_M) / (max - MIN_RADIUS_M)) * 100));
  const clamp = (v: number) => Math.min(max, Math.max(MIN_RADIUS_M, Math.round(v)));

  const bar = (value: number, color: string) => (
    <span className="gis-cov-bar-seg" style={{ width: cov.total ? `${(value / cov.total) * 100}%` : 0, background: color }} />
  );

  const chip = (color: string, label: string, value: number, title?: string) => (
    <span className="gis-cov-chip" title={title}>
      <i style={{ background: color }} />
      {label} <b>{n(value)}</b>
    </span>
  );

  return (
    <aside className="gis-cov-panel" aria-label="Gateway coverage">
      <div className="gis-cov-id">
        <span className="gis-cov-name" title={gatewayLabel(gateway)}>{gatewayLabel(gateway)}</span>
        <span className="gis-cov-count"><b>{n(reach.metersOnGateway)}</b> meters on this gateway</span>
      </div>
      <button className="gis-cov-close" onClick={onClose} aria-label="Close coverage">
        <X size={15} />
      </button>

      <div className="gis-cov-ctl">
        <div className="gis-cov-ctl-top">
          <span className="gis-cov-section">Radius</span>
          <div className="gis-cov-stepper">
            <button onClick={() => onRadiusChange(clamp(radiusM - NUDGE_M))} disabled={radiusM <= MIN_RADIUS_M} aria-label="Decrease radius">
              <Minus size={11} />
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
              <Plus size={11} />
            </button>
          </div>
          <button
            className="gis-cov-reset"
            onClick={() => onRadiusChange(clamp(stored))}
            disabled={radiusM === clamp(stored)}
            title="Back to the radius stored for this gateway"
          >
            <RotateCcw size={11} /> {n(stored)} m
          </button>
          {gateway.radiusM ? (
            <span className="gis-cov-legend" title="The orange ring on the map is the stored radius and stays fixed; the blue circle follows the slider">
              <i className="gis-cov-key gis-cov-key--stored" />stored
              <i className="gis-cov-key gis-cov-key--chosen" />chosen
            </span>
          ) : null}
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
          aria-label={`Coverage radius, ${MIN_RADIUS_M} m to ${formatDistance(max)}`}
          title={`${MIN_RADIUS_M} m to ${formatDistance(max)}`}
        />
      </div>

      {/* row 2: what that radius covers */}
      <div className="gis-cov-result-wrap" role="status" aria-live="polite">
        <span className="gis-cov-result">
          <b>{n(cov.total)}</b> meters within {n(radiusM)} m
        </span>
        <div className="gis-cov-bar" aria-hidden>
          {bar(cov.connected, METER_STATUS_STYLE.connected.color)}
          {bar(cov.disconnected, METER_STATUS_STYLE.disconnected.color)}
          {bar(cov.never, METER_STATUS_STYLE.never.color)}
        </div>
        <div className="gis-cov-chips">
          {chip(METER_STATUS_STYLE.connected.color, 'Connected', cov.connected)}
          {chip(METER_STATUS_STYLE.disconnected.color, 'Disconnected', cov.disconnected)}
          {chip(METER_STATUS_STYLE.never.color, 'Never seen', cov.never)}
          <span className="gis-cov-sep" />
          {chip('#2563EB', 'This gateway', cov.onThisGateway, 'Their latest frames came in through this gateway')}
          {chip('#F59E0B', 'Other gateway', cov.onOtherGateway, 'Inside this circle, but their latest frames came in through a different gateway')}
          {chip('#94A3B8', 'No gateway', cov.noGateway, 'No frame has ever been received from them, so no gateway is known')}
        </div>
      </div>
    </aside>
  );
}
