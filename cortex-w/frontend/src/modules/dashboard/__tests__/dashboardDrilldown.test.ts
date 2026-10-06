import { describe, it, expect } from 'vitest';
import {
  calculatePercentages,
  convertLToM3,
  convertKlToM3,
  aggregateNodeKpis,
  aggregateMeterKpis,
  validateDeviceInvariant,
} from '../services/dashboardAggregation';
import { dashboardDrilldownSeed } from '@/data/seed/dashboard/dashboardDrilldownSeed';
import type { NodeRow } from '../models/dashboardRows';

describe('Dashboard Drill-down Aggregations & Invariants', () => {
  describe('Device Invariant: Connected + Disconnected + Never Seen = Total Devices', () => {
    it('validates correct device counts pass invariant check', () => {
      expect(validateDeviceInvariant(100, 70, 20, 10)).toBe(true);
      expect(validateDeviceInvariant(0, 0, 0, 0)).toBe(true);
    });

    it('fails when device counts do not add up', () => {
      expect(validateDeviceInvariant(100, 70, 20, 5)).toBe(false);
      expect(validateDeviceInvariant(100, 80, 30, 0)).toBe(false);
    });

    it('verifies that all synthetic demo zones satisfy the invariant', () => {
      dashboardDrilldownSeed.zones.forEach((zone) => {
        const isValid = validateDeviceInvariant(
          zone.totalDevices,
          zone.connected,
          zone.disconnected,
          zone.neverSeen
        );
        expect(isValid).toBe(true);
        expect(zone.connected + zone.disconnected + zone.neverSeen).toBe(zone.totalDevices);
      });
    });

    it('verifies that all synthetic demo DMAs satisfy the invariant', () => {
      dashboardDrilldownSeed.zones.forEach((zone) => {
        zone.dmas.forEach((dma) => {
          const isValid = validateDeviceInvariant(
            dma.totalDevices,
            dma.connected,
            dma.disconnected,
            dma.neverSeen
          );
          expect(isValid).toBe(true);
          expect(dma.connected + dma.disconnected + dma.neverSeen).toBe(dma.totalDevices);
        });
      });
    });
  });

  describe('Percentage Calculations', () => {
    it('computes exact percentages when total > 0', () => {
      const p = calculatePercentages(100, 60, 30, 10);
      expect(p.connectedPct).toBe(60);
      expect(p.disconnectedPct).toBe(30);
      expect(p.neverSeenPct).toBe(10);
    });

    it('returns zero percentages safely when total is 0 to avoid division by zero', () => {
      const p = calculatePercentages(0, 0, 0, 0);
      expect(p.connectedPct).toBe(0);
      expect(p.disconnectedPct).toBe(0);
      expect(p.neverSeenPct).toBe(0);
    });
  });

  describe('Unit Conversions', () => {
    it('converts liters to cubic meters (1000 L = 1 m³)', () => {
      expect(convertLToM3(1000)).toBe(1);
      expect(convertLToM3(2500)).toBe(2.5);
      expect(convertLToM3(0)).toBe(0);
    });

    it('converts kiloliters to cubic meters (1 KL = 1 m³)', () => {
      expect(convertKlToM3(1)).toBe(1);
      expect(convertKlToM3(45.67)).toBe(45.67);
      expect(convertKlToM3(0)).toBe(0);
    });
  });

  describe('Hierarchical Aggregations (generic over any node depth)', () => {
    it('does not count the synthetic "Others" group as a configured area', () => {
      const row = (id: string, synthetic?: boolean): NodeRow => ({
        id, name: id, level: 2, parentId: 'p', parentName: 'P', hasChildren: false, meterCount: 10,
        synthetic, totalDevices: 10, connected: 5, disconnected: 3, neverSeen: 2,
        yesterdayFlowM3: 0, todayFlowM3: 0, monthToDateFlowM3: 0,
      });
      const kpis = aggregateNodeKpis([row('a'), row('b'), row('others:p', true)]);
      expect(kpis.childAreaCount).toBe(2); // Others is excluded from the area count...
      expect(kpis.totalDevices).toBe(30); // ...but its meters still count toward the totals
    });

    it('computes meter KPIs from the list it is given and leaves flow totals to the caller', () => {
      const meters = [
        { meterId: 'm1', connectivityStatus: 'CONNECTED' as const },
        { meterId: 'm2', connectivityStatus: 'DISCONNECTED' as const },
        { meterId: 'm3', connectivityStatus: 'NEVER_SEEN' as const },
      ];
      const kpis = aggregateMeterKpis(meters, { yesterdayFlowM3: 7 });
      expect(kpis.totalDevices).toBe(3);
      expect(kpis.connected + kpis.disconnected + kpis.neverSeen).toBe(3);
      expect(kpis.yesterdayFlowM3).toBe(7);
      expect(kpis.dataTimestamp).toBeUndefined(); // no timestamp is invented when no meter has one
    });

    it('rolls up child nodes (e.g. DMAs under a zone) into parent KPIs correctly', () => {
      const mockChildren: NodeRow[] = [
        {
          id: 'dma-1', name: 'DMA 1', level: 3, parentId: 'zone-1', parentName: 'Zone 1',
          hasChildren: false, meterCount: 100,
          totalDevices: 100, connected: 70, disconnected: 20, neverSeen: 10,
          yesterdayFlowM3: 50, todayFlowM3: 40, monthToDateFlowM3: 600,
        },
        {
          id: 'dma-2', name: 'DMA 2', level: 3, parentId: 'zone-1', parentName: 'Zone 1',
          hasChildren: false, meterCount: 200,
          totalDevices: 200, connected: 150, disconnected: 40, neverSeen: 10,
          yesterdayFlowM3: 100, todayFlowM3: 80, monthToDateFlowM3: 1200,
        },
      ];

      const kpis = aggregateNodeKpis(mockChildren);
      expect(kpis.totalDevices).toBe(300);
      expect(kpis.connected).toBe(220);
      expect(kpis.disconnected).toBe(60);
      expect(kpis.neverSeen).toBe(20);
      expect(kpis.connected + kpis.disconnected + kpis.neverSeen).toBe(kpis.totalDevices);
      expect(kpis.yesterdayFlowM3).toBe(150);
      expect(kpis.todayFlowM3).toBe(120);
      expect(kpis.monthToDateFlowM3).toBe(1800);
    });

    it('rolls up root-level nodes (e.g. zones/districts) into global KPIs correctly', () => {
      const mockRoots: NodeRow[] = [
        {
          id: 'zone-1', name: 'Zone 1', level: 1, parentId: null, parentName: null,
          hasChildren: true, meterCount: 0,
          totalDevices: 300, connected: 220, disconnected: 60, neverSeen: 20,
          yesterdayFlowM3: 150, todayFlowM3: 120, monthToDateFlowM3: 1800,
        },
        {
          id: 'zone-2', name: 'Zone 2', level: 1, parentId: null, parentName: null,
          hasChildren: true, meterCount: 0,
          totalDevices: 200, connected: 180, disconnected: 10, neverSeen: 10,
          yesterdayFlowM3: 100, todayFlowM3: 90, monthToDateFlowM3: 1500,
        },
      ];

      const kpis = aggregateNodeKpis(mockRoots);
      expect(kpis.totalDevices).toBe(500);
      expect(kpis.connected).toBe(400);
      expect(kpis.disconnected).toBe(70);
      expect(kpis.neverSeen).toBe(30);
      expect(kpis.connected + kpis.disconnected + kpis.neverSeen).toBe(kpis.totalDevices);
      expect(kpis.yesterdayFlowM3).toBe(250);
      expect(kpis.todayFlowM3).toBe(210);
      expect(kpis.monthToDateFlowM3).toBe(3300);
    });
  });
});
