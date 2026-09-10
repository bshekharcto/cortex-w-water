import { describe, it, expect } from 'vitest';
import {
  calculatePercentages,
  convertLToM3,
  convertKlToM3,
  aggregateZoneKpis,
  aggregateGlobalKpis,
  validateDeviceInvariant,
} from '../services/dashboardAggregation';
import { dashboardDrilldownSeed } from '@/data/seed/dashboard/dashboardDrilldownSeed';
import type { ZoneRow, DmaRow } from '../models/dashboardRows';

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

  describe('Hierarchical Aggregations', () => {
    it('rolls up DMAs into Zone KPIs correctly', () => {
      const mockDmas: DmaRow[] = [
        {
          dmaId: 'dma-1',
          dmaName: 'DMA 1',
          zoneId: 'z-1',
          zoneName: 'Zone 1',
          totalDevices: 100,
          connected: 70,
          disconnected: 20,
          neverSeen: 10,
          yesterdayFlowM3: 50,
          todayFlowM3: 40,
          monthToDateFlowM3: 600,
        },
        {
          dmaId: 'dma-2',
          dmaName: 'DMA 2',
          zoneId: 'z-1',
          zoneName: 'Zone 1',
          totalDevices: 200,
          connected: 150,
          disconnected: 40,
          neverSeen: 10,
          yesterdayFlowM3: 100,
          todayFlowM3: 80,
          monthToDateFlowM3: 1200,
        },
      ];

      const zoneKpis = aggregateZoneKpis(mockDmas);
      expect(zoneKpis.totalDevices).toBe(300);
      expect(zoneKpis.connected).toBe(220);
      expect(zoneKpis.disconnected).toBe(60);
      expect(zoneKpis.neverSeen).toBe(20);
      expect(zoneKpis.connected + zoneKpis.disconnected + zoneKpis.neverSeen).toBe(zoneKpis.totalDevices);
      expect(zoneKpis.yesterdayFlowM3).toBe(150);
      expect(zoneKpis.todayFlowM3).toBe(120);
      expect(zoneKpis.monthToDateFlowM3).toBe(1800);
    });

    it('rolls up Zones into Global KPIs correctly', () => {
      const mockZones: ZoneRow[] = [
        {
          zoneId: 'z-1',
          zoneName: 'Zone 1',
          totalDevices: 300,
          connected: 220,
          disconnected: 60,
          neverSeen: 20,
          yesterdayFlowM3: 150,
          todayFlowM3: 120,
          monthToDateFlowM3: 1800,
        },
        {
          zoneId: 'z-2',
          zoneName: 'Zone 2',
          totalDevices: 200,
          connected: 180,
          disconnected: 10,
          neverSeen: 10,
          yesterdayFlowM3: 100,
          todayFlowM3: 90,
          monthToDateFlowM3: 1500,
        },
      ];

      const globalKpis = aggregateGlobalKpis(mockZones);
      expect(globalKpis.totalDevices).toBe(500);
      expect(globalKpis.connected).toBe(400);
      expect(globalKpis.disconnected).toBe(70);
      expect(globalKpis.neverSeen).toBe(30);
      expect(globalKpis.connected + globalKpis.disconnected + globalKpis.neverSeen).toBe(globalKpis.totalDevices);
      expect(globalKpis.yesterdayFlowM3).toBe(250);
      expect(globalKpis.todayFlowM3).toBe(210);
      expect(globalKpis.monthToDateFlowM3).toBe(3300);
    });
  });
});
