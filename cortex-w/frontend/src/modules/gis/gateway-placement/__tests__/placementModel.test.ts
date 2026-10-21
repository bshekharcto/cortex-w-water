import { describe, expect, it } from 'vitest';
import { explainPlan, explainRelocation } from '../placementModel';
import type { GatewayCandidate, GatewayPlacementResult, RelocationResult } from '../../shared/mapTypes';

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

const reloc = (over: Partial<RelocationResult>): RelocationResult => ({
  siteId: '6394', coverageRadiusM: 800, existingMode: 'working', metersInSelection: 1000, totalMeters: 1000, excludedMeterCount: 0,
  coveredBefore: 556, coveredAfter: 899, coverageBeforePercent: 55.6, coverageAfterPercent: 89.9, uncovered: 101, existingCounted: 20,
  movable: 24, locked: 2, moves: 13, removals: 0, minGainUsed: 79, stopReason: 'no-worthwhile-move', nextNet: 57, steps: [], items: [], ...over,
});

describe('explainRelocation', () => {
  it('says what moving did and why it stopped', () => {
    expect(explainRelocation(reloc({}))).toBe(
      'Moving 13 gateways raises coverage from 55.6% to 89.9%. No further move is worth it: the next best would net only 57 meters, below the minimum of 79.'
    );
  });
  it('says when no move is worth making', () => {
    expect(explainRelocation(reloc({ moves: 0, nextNet: 12 }))).toBe('No move is worth making: the best would net only 12 meters, below the minimum of 79.');
  });
  it('says the move limit is the reason', () => {
    expect(explainRelocation(reloc({ stopReason: 'max-moves', moves: 3, nextNet: 552 }))).toBe(
      'Moving 3 gateways raises coverage from 55.6% to 89.9%. The allowed number of moves is used and more would still help: the next would net 552 meters.'
    );
  });
  it('mentions redundant gateways, singular and plural', () => {
    expect(explainRelocation(reloc({ stopReason: 'already-covered', moves: 0, removals: 1 }))).toBe(
      'Every meter is already within 800 m of a working gateway: nothing needs to move. 1 gateway is redundant: it can be removed or reused at no loss.'
    );
    expect(explainRelocation(reloc({ stopReason: 'already-covered', moves: 0, removals: 2 }))).toContain('2 gateways are redundant: they can be removed');
    expect(explainRelocation(reloc({ stopReason: 'already-covered', moves: 0, removals: 2, removalLoss: 7 }))).toContain('(losing 7 meters in all)');
  });
  it('says the moves reached every meter (never "nothing needs to move" after moves)', () => {
    expect(explainRelocation(reloc({ stopReason: 'all-covered', moves: 2, coverageAfterPercent: 100 }))).toBe(
      'Moving 2 gateways raises coverage from 55.6% to 100%. Every meter is now within 800 m of a gateway.'
    );
  });
  it('words "already reached" by how existing gateways are counted', () => {
    expect(explainRelocation(reloc({ stopReason: 'already-covered', moves: 0, existingMode: 'all' }))).toContain('of an existing gateway');
    expect(explainRelocation(reloc({ stopReason: 'already-covered', moves: 0 }))).toContain('of a working gateway');
  });
  it('explains locked and missing gateways', () => {
    expect(explainRelocation(reloc({ stopReason: 'nothing-movable', moves: 0, movable: 0, locked: 4 }))).toContain('All 4 gateways here are locked');
    expect(explainRelocation(reloc({ stopReason: 'nothing-movable', moves: 0, movable: 0, locked: 0 }))).toContain('no existing gateway');
    expect(explainRelocation(reloc({ stopReason: 'no-meters', coordinatesStatus: 'unavailable' }))).toContain('not available');
  });
});
