import type { SeedProvenance } from '../provenance';

export const DASHBOARD_DRILLDOWN_SEED_PROVENANCE: SeedProvenance = 'SYNTHETIC_DEMO';

/**
 * Geographical Seed Data for Odisha:
 * - Bhubaneswar Zone (DMA 1 to 5)
 * - Cuttack Zone (DMA 1 to 5)
 * - Puri Zone (DMA 1 to 5)
 */

export interface SeedMeter {
  deviceId: string;
  meterId: string;
  meterType: string;
  consumerId: string;
  consumerName: string;
  address: string;
  meterSize: string;
  totalizerM3: number;
  latestReadingAt: string;
  connectivityStatus: 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN';
}

export interface SeedDma {
  dmaId: string;
  dmaName: string;
  totalDevices: number;
  connected: number;
  disconnected: number;
  neverSeen: number;
  yesterdayFlowM3: number;
  todayFlowM3: number;
  monthToDateFlowM3: number;
  meters: SeedMeter[];
}

export interface SeedZone {
  zoneId: string;
  zoneName: string;
  totalDevices: number;
  connected: number;
  disconnected: number;
  neverSeen: number;
  yesterdayFlowM3: number;
  todayFlowM3: number;
  monthToDateFlowM3: number;
  dmas: SeedDma[];
}

export interface DashboardDrilldownSeedData {
  zones: SeedZone[];
}

export const dashboardDrilldownSeed: DashboardDrilldownSeedData = {
  zones: [
    {
      zoneId: 'zone-bhubaneswar',
      zoneName: 'Bhubaneswar',
      totalDevices: 15330,
      connected: 6355,
      disconnected: 2666,
      neverSeen: 6309,
      yesterdayFlowM3: 305802.0,
      todayFlowM3: 104846.0,
      monthToDateFlowM3: 8737228.8,
      dmas: [
        {
          dmaId: 'dma-bbsr-1',
          dmaName: 'DMA 1 (Bhubaneswar North)',
          totalDevices: 4018,
          connected: 1757,
          disconnected: 785,
          neverSeen: 1476,
          yesterdayFlowM3: 80099.8,
          todayFlowM3: 27462.8,
          monthToDateFlowM3: 2288566.3,
          meters: [
            {
              deviceId: '506f980000240061',
              meterId: '0024006061',
              meterType: 'Axioma Qalcosonic W1',
              consumerId: 'WS/BMC/2260881',
              consumerName: 'Aditya Mohanty',
              address: 'Sub-DMA 1.1 (Niladri Vihar), Bhubaneswar',
              meterSize: '15mm',
              totalizerM3: 142.65,
              latestReadingAt: '2026-09-10T07:15:00Z',
              connectivityStatus: 'CONNECTED',
            },
            {
              deviceId: '506f980000240062',
              meterId: '0024006062',
              meterType: 'Axioma Qalcosonic W1',
              consumerId: 'WS/BMC/2260882',
              consumerName: 'Kavita Patnaik',
              address: 'Sub-DMA 1.2 (Godakana 1), Bhubaneswar',
              meterSize: '15mm',
              totalizerM3: 98.4,
              latestReadingAt: '2026-09-08T18:30:00Z',
              connectivityStatus: 'CONNECTED',
            },
            {
              deviceId: '506f980000240063',
              meterId: '0024006063',
              meterType: 'Axioma Qalcosonic W1',
              consumerId: 'WS/BMC/2260883',
              consumerName: 'Ramesh Senapati',
              address: 'Sub-DMA 1.3 (Godakana 2), Bhubaneswar',
              meterSize: '20mm',
              totalizerM3: 0.0,
              latestReadingAt: '2026-09-01T00:00:00Z',
              connectivityStatus: 'CONNECTED',
            },
          ],
        },
        {
          dmaId: 'dma-bbsr-2',
          dmaName: 'DMA 2 (Nayapalli & Central)',
          totalDevices: 2379,
          connected: 733,
          disconnected: 513,
          neverSeen: 1133,
          yesterdayFlowM3: 47579.8,
          todayFlowM3: 16313.1,
          monthToDateFlowM3: 1359424.5,
          meters: [],
        },
        {
          dmaId: 'dma-bbsr-3',
          dmaName: 'DMA 3 (GGP Colony & Laxmisagar)',
          totalDevices: 3497,
          connected: 2382,
          disconnected: 501,
          neverSeen: 614,
          yesterdayFlowM3: 70095.3,
          todayFlowM3: 24032.7,
          monthToDateFlowM3: 2002723.8,
          meters: [],
        },
        {
          dmaId: 'dma-bbsr-4',
          dmaName: 'DMA 4 (Old Town & Museum)',
          totalDevices: 2755,
          connected: 850,
          disconnected: 324,
          neverSeen: 1581,
          yesterdayFlowM3: 54191.4,
          todayFlowM3: 18579.9,
          monthToDateFlowM3: 1548326.1,
          meters: [],
        },
        {
          dmaId: 'dma-bbsr-5',
          dmaName: 'DMA 5 (Khandagiri & Units)',
          totalDevices: 2681,
          connected: 633,
          disconnected: 543,
          neverSeen: 1505,
          yesterdayFlowM3: 53837.2,
          todayFlowM3: 18458.5,
          monthToDateFlowM3: 1538207.4,
          meters: [],
        },
      ],
    },
    {
      zoneId: 'zone-puri',
      zoneName: 'Puri',
      totalDevices: 2911,
      connected: 0,
      disconnected: 0,
      neverSeen: 2911,
      yesterdayFlowM3: 58030.0,
      todayFlowM3: 19896.0,
      monthToDateFlowM3: 1658002.3,
      dmas: [
        {
          dmaId: 'dma-pri-1',
          dmaName: 'DMA 1 (Grand Road / Badadanda)',
          totalDevices: 28,
          connected: 0,
          disconnected: 0,
          neverSeen: 28,
          yesterdayFlowM3: 540.7,
          todayFlowM3: 185.4,
          monthToDateFlowM3: 15448.0,
          meters: [],
        },
        {
          dmaId: 'dma-pri-2',
          dmaName: 'DMA 2 (Sea Beach & Marine Drive)',
          totalDevices: 1110,
          connected: 0,
          disconnected: 0,
          neverSeen: 1110,
          yesterdayFlowM3: 22160.5,
          todayFlowM3: 7597.9,
          monthToDateFlowM3: 633156.7,
          meters: [],
        },
        {
          dmaId: 'dma-pri-3',
          dmaName: 'DMA 3 (VIP Road & Chakratirtha)',
          totalDevices: 1123,
          connected: 0,
          disconnected: 0,
          neverSeen: 1123,
          yesterdayFlowM3: 22455.5,
          todayFlowM3: 7699.0,
          monthToDateFlowM3: 641587.1,
          meters: [],
        },
        {
          dmaId: 'dma-pri-4',
          dmaName: 'DMA 4 (Balagandi & Town)',
          totalDevices: 24,
          connected: 0,
          disconnected: 0,
          neverSeen: 24,
          yesterdayFlowM3: 538.2,
          todayFlowM3: 184.5,
          monthToDateFlowM3: 15378.0,
          meters: [],
        },
        {
          dmaId: 'dma-pri-5',
          dmaName: 'DMA 5 (Talabania & Atharanala)',
          totalDevices: 626,
          connected: 0,
          disconnected: 0,
          neverSeen: 626,
          yesterdayFlowM3: 12335.2,
          todayFlowM3: 4229.2,
          monthToDateFlowM3: 352434.1,
          meters: [],
        },
      ],
    },
    {
      zoneId: 'zone-cuttack',
      zoneName: 'Cuttack',
      totalDevices: 290,
      connected: 88,
      disconnected: 116,
      neverSeen: 86,
      yesterdayFlowM3: 5677.6,
      todayFlowM3: 1946.6,
      monthToDateFlowM3: 162218.0,
      dmas: [
        {
          dmaId: 'dma-ctc-1',
          dmaName: 'DMA 1 (CDA Sector 11)',
          totalDevices: 244,
          connected: 71,
          disconnected: 97,
          neverSeen: 76,
          yesterdayFlowM3: 4800.0,
          todayFlowM3: 1645.0,
          monthToDateFlowM3: 137000.0,
          meters: [],
        },
        {
          dmaId: 'dma-ctc-2',
          dmaName: 'DMA 2 (Bidanasi)',
          totalDevices: 15,
          connected: 9,
          disconnected: 4,
          neverSeen: 2,
          yesterdayFlowM3: 290.0,
          todayFlowM3: 99.0,
          monthToDateFlowM3: 8200.0,
          meters: [],
        },
        {
          dmaId: 'dma-ctc-3',
          dmaName: 'DMA 3 (Cantonment)',
          totalDevices: 15,
          connected: 4,
          disconnected: 6,
          neverSeen: 5,
          yesterdayFlowM3: 290.0,
          todayFlowM3: 99.0,
          monthToDateFlowM3: 8200.0,
          meters: [],
        },
        {
          dmaId: 'dma-ctc-4',
          dmaName: 'DMA 4 (Badambadi)',
          totalDevices: 12,
          connected: 3,
          disconnected: 7,
          neverSeen: 2,
          yesterdayFlowM3: 205.0,
          todayFlowM3: 70.0,
          monthToDateFlowM3: 5857.0,
          meters: [],
        },
        {
          dmaId: 'dma-ctc-5',
          dmaName: 'DMA 5 (Mahanadi Barrage)',
          totalDevices: 4,
          connected: 1,
          disconnected: 2,
          neverSeen: 1,
          yesterdayFlowM3: 92.6,
          todayFlowM3: 32.6,
          monthToDateFlowM3: 3018.0,
          meters: [],
        },
      ],
    },
  ],
};
