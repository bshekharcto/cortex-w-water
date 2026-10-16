import type { GatewayPlacementResult } from '../shared/mapTypes';

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** Why the plan has as many gateways as it has, in words. */
export function explainPlan(r: GatewayPlacementResult): string | null {
  const n = r.gateways.length;
  const max = r.gatewayCount ?? n;
  const radius = r.coverageRadiusM ?? 0;
  const ofMax = n < max ? ` (${max} were allowed)` : '';
  const verb = (one: string, many: string) => (n === 1 ? one : many);
  switch (r.stopReason) {
    case 'no-meters':
      return r.coordinatesStatus === 'unavailable'
        ? 'Meter positions are not available right now, so no placement can be worked out.'
        : 'No meter in this selection has a position, so there is nothing to place gateways for.';
    case 'already-covered':
      return `Every meter is already within ${radius} m of an existing gateway: no new gateway is needed.`;
    case 'all-covered':
      return `${plural(n, 'new gateway')} ${verb('brings', 'bring')} every meter within ${radius} m${ofMax}. More would add nothing.`;
    case 'target-reached':
      return `${plural(n, 'new gateway')} ${verb('reaches', 'reach')} the ${r.targetCoveragePercent}% target${ofMax}.`;
    case 'low-gain':
      return n === 0
        ? `No new gateway is worth building: the best spot would newly reach only ${plural(r.nextGain ?? 0, 'meter')} (the minimum is ${r.minNewMetersUsed}).`
        : `${plural(n, 'new gateway')} ${verb('is', 'are')} worth building${ofMax}: one more would newly reach only ${plural(r.nextGain ?? 0, 'meter')}, below the minimum of ${r.minNewMetersUsed}.`;
    case 'max-gateways':
      return `All ${max} allowed gateways are used and more would still help: the next one would newly reach ${plural(r.nextGain ?? 0, 'meter')}.`;
    default:
      return null;
  }
}
