import { describe, expect, it } from 'vitest';
import { explainPlan } from '../placementModel';
import type { GatewayCandidate, GatewayPlacementResult } from '../../shared/mapTypes';

const gw = (n: number): GatewayCandidate => ({
  gatewayNumber: n, latitude: 20.3, longitude: 85.8, metersAssigned: 100, metersCoveredCount: 90, avgDistanceM: 200, maxDistanceM: 480, assignedAssetIds: [],
});
const result = (over: Partial<GatewayPlacementResult>): GatewayPlacementResult => ({
  siteId: 'ALL', gatewayCount: 5, coverageRadiusM: 500, totalMeters: 1000, excludedMeterCount: 0, excludedAssetIds: [],
  totalMetersCovered: 900, minNewMetersUsed: 5, targetCoveragePercent: 100, gateways: [gw(1), gw(2)], ...over,
});

describe('explainPlan', () => {
  it('says fewer gateways than allowed were enough', () => {
    expect(explainPlan(result({ stopReason: 'all-covered' }))).toBe('2 new gateways bring every meter within 500 m (5 were allowed). More would add nothing.');
  });
  it('says why it stopped early when more would add too little', () => {
    expect(explainPlan(result({ stopReason: 'low-gain', nextGain: 3 }))).toBe(
      '2 new gateways are worth building (5 were allowed): one more would newly reach only 3 meters, below the minimum of 5.'
    );
  });
  it('says when no gateway is worth building at all', () => {
    expect(explainPlan(result({ stopReason: 'low-gain', nextGain: 1, gateways: [] }))).toContain('No new gateway is worth building');
  });
  it('says more gateways would still help when the limit was reached', () => {
    expect(explainPlan(result({ stopReason: 'max-gateways', gatewayCount: 2, nextGain: 140 }))).toBe(
      'All 2 allowed gateways are used and more would still help: the next one would newly reach 140 meters.'
    );
  });
  it('covers existing gateways and missing positions', () => {
    expect(explainPlan(result({ stopReason: 'already-covered', gateways: [] }))).toContain('no new gateway is needed');
    expect(explainPlan(result({ stopReason: 'no-meters', coordinatesStatus: 'unavailable', gateways: [] }))).toContain('not available');
    expect(explainPlan(result({ stopReason: 'target-reached', targetCoveragePercent: 95 }))).toBe('2 new gateways reach the 95% target (5 were allowed).');
  });
  it('singular wording for one gateway', () => {
    expect(explainPlan(result({ stopReason: 'low-gain', nextGain: 2, gateways: [gw(1)] }))).toMatch(/^1 new gateway is worth building/);
    expect(explainPlan(result({ stopReason: 'all-covered', gateways: [gw(1)] }))).toBe('1 new gateway brings every meter within 500 m (5 were allowed). More would add nothing.');
  });
});
