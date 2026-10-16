import type { GatewayPlacementResult, RelocationResult } from '../shared/mapTypes';

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

/** What the relocation plan did and why it stopped, in words. */
export function explainRelocation(r: RelocationResult): string | null {
  const radius = r.coverageRadiusM;
  const moved = r.moves > 0 ? `Moving ${plural(r.moves, 'gateway')} raises coverage from ${r.coverageBeforePercent}% to ${r.coverageAfterPercent}%.` : '';
  const removed =
    r.removals > 0
      ? ` ${plural(r.removals, 'gateway')} ${r.removals === 1 ? 'is' : 'are'} redundant: ${r.removals === 1 ? 'it' : 'they'} can be removed or reused${
          r.removalLoss ? ` (losing ${plural(r.removalLoss, 'meter')} in all)` : ' at no loss'
        }.`
      : '';
  switch (r.stopReason) {
    case 'no-meters':
      return r.coordinatesStatus === 'unavailable'
        ? 'Meter positions are not available right now, so nothing can be worked out.'
        : 'No meter in this selection has a position, so there is nothing to optimise.';
    case 'nothing-movable':
      return r.locked > 0
        ? `All ${plural(r.locked, 'gateway')} here ${r.locked === 1 ? 'is' : 'are'} locked (by you, or because ${r.locked === 1 ? 'it stands in or also serves' : 'they stand in or also serve'} a site outside the selection), so nothing can be moved.`
        : 'There is no existing gateway with a position in this selection.';
    case 'already-covered':
      return `Every meter is already within ${radius} m of ${r.existingMode === 'all' ? 'an existing' : 'a working'} gateway: nothing needs to move.${removed}`;
    case 'all-covered':
      return `${moved} Every meter is now within ${radius} m of a gateway.${removed}`;
    case 'no-worthwhile-move':
      return r.moves > 0
        ? `${moved} No further move is worth it: the next best would net only ${plural(r.nextNet ?? 0, 'meter')}, below the minimum of ${r.minGainUsed}.${removed}`
        : `No move is worth making: the best would net only ${plural(r.nextNet ?? 0, 'meter')}, below the minimum of ${r.minGainUsed}.${removed}`;
    case 'max-moves':
      return `${moved} The allowed number of moves is used and more would still help: the next would net ${plural(r.nextNet ?? 0, 'meter')}.`;
    case 'all-moved':
      return `${moved} Every movable gateway is moved.${removed}`;
    default:
      return null;
  }
}
