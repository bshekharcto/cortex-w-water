import type { SeedProvenance } from '../provenance';

export const HYDRAULIC_SEED_PROVENANCE: SeedProvenance = 'SYNTHETIC_DEMO';

/** Spec 14.7 — demo DMA seed data. This is SYNTHETIC; there is NO backend
 * contract for hydraulic data yet (spec 14.1). Show a clear demo indicator. */
export const hydraulicSeed = {
  waterBalance: {
    totalInputM3: 12_400,
    authorizedConsumptionM3: 9_800,
    nonRevenueWaterM3: 2_600,
    nrwPercent: 21.0,
  },
  demandProfile: {
    hourly: Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      demandM3: Math.round(180 + 320 * Math.sin((h - 6) * Math.PI / 12) * (h >= 5 && h <= 22 ? 1 : 0.3)),
    })),
  },
  dmaRanking: [
    { dmaId: 'DMA-01', name: 'Old Town', meterCount: 820, avgConsumptionKL: 1.2, nrwPercent: 28, pressureBar: 2.1, anomalies: 3 },
    { dmaId: 'DMA-02', name: 'Nayapalli', meterCount: 640, avgConsumptionKL: 0.9, nrwPercent: 18, pressureBar: 2.8, anomalies: 1 },
    { dmaId: 'DMA-03', name: 'Saheed Nagar', meterCount: 510, avgConsumptionKL: 1.1, nrwPercent: 15, pressureBar: 3.0, anomalies: 0 },
    { dmaId: 'DMA-04', name: 'Patia', meterCount: 380, avgConsumptionKL: 0.7, nrwPercent: 24, pressureBar: 2.3, anomalies: 2 },
    { dmaId: 'DMA-05', name: 'Chandrasekharpur', meterCount: 290, avgConsumptionKL: 0.8, nrwPercent: 12, pressureBar: 3.2, anomalies: 0 },
  ],
};
