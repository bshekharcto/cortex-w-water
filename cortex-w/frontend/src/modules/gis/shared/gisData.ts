export interface GisGateway {
  gatewayId: string;
  alias: string;
  lat: number;
  lng: number;
  metersObserved: number;
  avgRssi: number;
  avgSnr: number;
  radiusMeters: number;
  status: 'reporting' | 'degraded' | 'stale';
}

export interface MeterDailyReading {
  date: string;
  shortDate: string;
  consumptionL: number;
  consumptionM3: number;
  readingM3: number;
  minFlowLph: number;
  maxFlowLph: number;
  uplinksReceived: number;
  uplinksExpected: number;
  flag: 'Normal' | 'Peak' | 'Leak Risk' | 'Zero Flow';
}

export interface MeterAlert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'Leakage' | 'Hardware' | 'RF Link' | 'Billing' | 'Tamper';
  title: string;
  description: string;
  timestamp: string;
  status: 'Active' | 'Investigating' | 'Resolved';
}

export interface GisMeter {
  id?: string | number;
  assetId?: number;
  meterId: string;
  devEui: string;
  householdId: string;
  householdShortId: string;
  householdName: string;
  locality: string;
  lat: number;
  lng: number;
  gatewayId: string;
  gatewayAlias: string;
  distanceMeters: number;
  rssi: number;
  snr: number;
  status: 'active' | 'weak' | 'silent';
  batteryStatus: 'Normal' | 'Abnormal';
  batteryVoltage: number;
  batteryPercentage: number;
  valveStatus: 'Normal' | 'Abnormal';
  valveState: 'Open' | 'Closed' | 'Throttled';
  lastSeen: string;
  pipeDiameter: string;
  connectionType: string;
  installDate: string;
  currentReadingM3: number;
  yesterdayConsumptionL: number;
  yesterdayConsumptionM3: number;
  monthConsumptionL: number;
  monthConsumptionM3: number;
  estimatedBillInr: number;
  currentFlowRateLph: number;
  dailyAvgL: number;
  last10DaysReadings: MeterDailyReading[];
  alerts: MeterAlert[];
  city?: 'Bhubaneswar' | 'Puri' | 'Cuttack' | string;
}

export const BHUBANESWAR_CENTER = {
  lat: 20.2961,
  lng: 85.8245,
};

export const ODISHA_CENTER = {
  lat: 20.1500,
  lng: 85.8200,
};

export const ODISHA_CITIES = [
  { id: 'ALL', name: 'All Odisha Cities', center: { lat: 20.1500, lng: 85.8200 }, zoom: 10 },
  { id: 'Bhubaneswar', name: 'Bhubaneswar', center: { lat: 20.2961, lng: 85.8245 }, zoom: 13 },
  { id: 'Puri', name: 'Puri', center: { lat: 19.8050, lng: 85.8180 }, zoom: 14 },
  { id: 'Cuttack', name: 'Cuttack', center: { lat: 20.4810, lng: 85.8200 }, zoom: 14 },
];

export const GIS_GATEWAYS: GisGateway[] = [
  { gatewayId: '506f9800000002a5', alias: 'GW-Alpha (2A5)', lat: 20.2961, lng: 85.8245, metersObserved: 738, avgRssi: -88.6, avgSnr: -8.2, radiusMeters: 850, status: 'reporting' },
  { gatewayId: '506f9800000002a6', alias: 'GW-Bravo (2A6)', lat: 20.2750, lng: 85.8400, metersObserved: 403, avgRssi: -89.7, avgSnr: -11.5, radiusMeters: 750, status: 'reporting' },
  { gatewayId: '506f98000000029a', alias: 'GW-Charlie (29A)', lat: 20.3100, lng: 85.8500, metersObserved: 280, avgRssi: -86.7, avgSnr: -9.5, radiusMeters: 700, status: 'reporting' },
  { gatewayId: '506f980000000262', alias: 'GW-Delta (262)', lat: 20.2800, lng: 85.8100, metersObserved: 251, avgRssi: -94.4, avgSnr: -16.9, radiusMeters: 650, status: 'degraded' },
  { gatewayId: '506f980000000340', alias: 'GW-Echo (340)', lat: 20.3200, lng: 85.8700, metersObserved: 155, avgRssi: -90.9, avgSnr: -15.1, radiusMeters: 600, status: 'reporting' },
  { gatewayId: '506f98000000029e', alias: 'GW-Foxtrot (29E)', lat: 20.2650, lng: 85.8350, metersObserved: 153, avgRssi: -86.2, avgSnr: -12.1, radiusMeters: 600, status: 'reporting' },
  { gatewayId: '506f980000000261', alias: 'GW-Golf (261)', lat: 20.3050, lng: 85.8000, metersObserved: 149, avgRssi: -97.3, avgSnr: -16.5, radiusMeters: 600, status: 'reporting' },
  { gatewayId: '506f9800000002a8', alias: 'GW-Hotel (2A8)', lat: 20.2900, lng: 85.8600, metersObserved: 134, avgRssi: -87.1, avgSnr: -12.6, radiusMeters: 550, status: 'reporting' },
  { gatewayId: '506f980000000299', alias: 'GW-India (299)', lat: 20.2700, lng: 85.8150, metersObserved: 130, avgRssi: -85.0, avgSnr: -9.7, radiusMeters: 550, status: 'reporting' },
  { gatewayId: '506f9800000002a3', alias: 'GW-Juliet (2A3)', lat: 20.3150, lng: 85.8450, metersObserved: 107, avgRssi: -91.3, avgSnr: -14.1, radiusMeters: 500, status: 'reporting' },
  { gatewayId: '506f98000000029d', alias: 'GW-Kilo (29D)', lat: 20.2550, lng: 85.8550, metersObserved: 24, avgRssi: -85.8, avgSnr: -15.4, radiusMeters: 450, status: 'degraded' },
  { gatewayId: '506f980000000341', alias: 'GW-Lima (341)', lat: 20.3300, lng: 85.7900, metersObserved: 5, avgRssi: -89.2, avgSnr: -18.6, radiusMeters: 400, status: 'stale' },
  { gatewayId: '506f980000000346', alias: 'GW-Mike (346)', lat: 20.2400, lng: 85.8800, metersObserved: 2, avgRssi: -81.0, avgSnr: -18.1, radiusMeters: 400, status: 'stale' },
  { gatewayId: '506f980000000297', alias: 'GW-November (297)', lat: 20.3400, lng: 85.8050, metersObserved: 1, avgRssi: -90.0, avgSnr: -12.5, radiusMeters: 350, status: 'stale' },
];

function build10DayReadings(
  endingReadingM3: number,
  dailyBaseL: number,
  dailyVariance: number[],
  isSilent = false
): MeterDailyReading[] {
  const dates = [
    { date: '04 Sep 2026', shortDate: '04 Sep' },
    { date: '03 Sep 2026', shortDate: '03 Sep' },
    { date: '02 Sep 2026', shortDate: '02 Sep' },
    { date: '01 Sep 2026', shortDate: '01 Sep' },
    { date: '31 Aug 2026', shortDate: '31 Aug' },
    { date: '30 Aug 2026', shortDate: '30 Aug' },
    { date: '29 Aug 2026', shortDate: '29 Aug' },
    { date: '28 Aug 2026', shortDate: '28 Aug' },
    { date: '27 Aug 2026', shortDate: '27 Aug' },
    { date: '26 Aug 2026', shortDate: '26 Aug' },
  ];

  let currentCum = endingReadingM3;
  const result: MeterDailyReading[] = [];

  for (let i = 0; i < dates.length; i++) {
    const variance = dailyVariance[i] ?? 0;
    const consumption = isSilent && i < 3 ? 0 : Math.max(0, Math.round(dailyBaseL + variance));
    const consumptionM3 = parseFloat((consumption / 1000).toFixed(3));
    const readingM3 = parseFloat(currentCum.toFixed(3));
    
    // Decrement cumulative for the previous day
    currentCum = Math.max(0, currentCum - consumptionM3);

    const uplinksReceived = isSilent && i < 2 ? 0 : isSilent && i === 2 ? 4 : Math.min(24, Math.max(22, 24 - (i % 2)));
    let flag: MeterDailyReading['flag'] = 'Normal';
    if (consumption === 0) flag = 'Zero Flow';
    else if (consumption > dailyBaseL * 1.35) flag = 'Peak';
    else if (consumption > dailyBaseL * 1.6) flag = 'Leak Risk';

    result.push({
      date: dates[i].date,
      shortDate: dates[i].shortDate,
      consumptionL: consumption,
      consumptionM3,
      readingM3,
      minFlowLph: consumption > 0 ? (flag === 'Leak Risk' ? 14.2 : 0.0) : 0.0,
      maxFlowLph: parseFloat((consumption / 10 + 8.5).toFixed(1)),
      uplinksReceived,
      uplinksExpected: 24,
      flag,
    });
  }

  return result;
}

// 14 Mapped meters in Bhubaneswar wards around gateways with full 360 history
export const GIS_METERS: GisMeter[] = [
  {
    meterId: '0024004061',
    devEui: '70B3D57ED005A321',
    householdId: 'WS/BMC/1520247',
    householdShortId: '1520247',
    householdName: 'Ramesh Patel',
    locality: 'Old Town, Ward 12',
    lat: 20.2982,
    lng: 85.8231,
    gatewayId: '506f9800000002a5',
    gatewayAlias: 'GW-Alpha',
    distanceMeters: 280,
    rssi: -88.6,
    snr: -8.2,
    status: 'active',
    batteryStatus: 'Normal',
    batteryVoltage: 3.62,
    batteryPercentage: 96,
    valveStatus: 'Normal',
    valveState: 'Open',
    lastSeen: '12 sec ago',
    pipeDiameter: 'DN15 (1/2")',
    connectionType: 'Domestic Residential',
    installDate: '2024-06-15',
    currentReadingM3: 229.97,
    yesterdayConsumptionL: 384,
    yesterdayConsumptionM3: 0.384,
    monthConsumptionL: 12400,
    monthConsumptionM3: 12.4,
    estimatedBillInr: 186.0,
    currentFlowRateLph: 0.0,
    dailyAvgL: 378,
    last10DaysReadings: build10DayReadings(229.97, 380, [4, 32, -5, 80, 10, 40, -70, 70, 15, 0]),
    alerts: [
      {
        id: 'ALM-084',
        severity: 'medium',
        category: 'Hardware',
        title: 'Minor Reverse Flow Spike Corrected',
        description: 'Temporary 1.8 L reverse flow flag triggered during municipal line maintenance. Self-cleared.',
        timestamp: '02 Sep 2026, 04:15 AM',
        status: 'Resolved',
      },
      {
        id: 'ALM-071',
        severity: 'low',
        category: 'RF Link',
        title: 'Signal Level Notice',
        description: 'RSSI dipped to -91.4 dBm during heavy rain. Restored to -88.6 dBm.',
        timestamp: '29 Aug 2026, 06:30 PM',
        status: 'Resolved',
      },
    ],
  },
  {
    meterId: '0024004067',
    devEui: '70B3D57ED005A340',
    householdId: 'WS/BMC/1490971',
    householdShortId: '1490971',
    householdName: 'Sunita Mohanty',
    locality: 'Nayapalli, Ward 8',
    lat: 20.3185,
    lng: 85.8672,
    gatewayId: '506f980000000340',
    gatewayAlias: 'GW-Echo',
    distanceMeters: 340,
    rssi: -90.9,
    snr: -15.1,
    status: 'weak',
    batteryStatus: 'Normal',
    batteryVoltage: 3.58,
    batteryPercentage: 88,
    valveStatus: 'Abnormal',
    valveState: 'Throttled',
    lastSeen: '2 min ago',
    pipeDiameter: 'DN15 (1/2")',
    connectionType: 'Domestic Residential',
    installDate: '2024-07-20',
    currentReadingM3: 27.93,
    yesterdayConsumptionL: 680,
    yesterdayConsumptionM3: 0.68,
    monthConsumptionL: 8200,
    monthConsumptionM3: 8.2,
    estimatedBillInr: 123.0,
    currentFlowRateLph: 12.4,
    dailyAvgL: 340,
    last10DaysReadings: build10DayReadings(27.93, 340, [340, 310, 290, 80, 20, 10, -30, 40, -10, 0]),
    alerts: [
      {
        id: 'ALM-091',
        severity: 'high',
        category: 'Leakage',
        title: 'Continuous Night Flow Detected (12.4 L/h)',
        description: 'Non-zero flow sustained between 01:00 AM and 05:00 AM. Probable internal toilet flapper or cistern leak.',
        timestamp: '04 Sep 2026, 02:45 AM',
        status: 'Active',
      },
      {
        id: 'ALM-089',
        severity: 'medium',
        category: 'Hardware',
        title: 'Valve Actuator Resistance High',
        description: 'Valve motor current drew 42 mA exceeding nominal 25 mA. Sediment buildup suspected.',
        timestamp: '03 Sep 2026, 11:20 AM',
        status: 'Active',
      },
      {
        id: 'ALM-074',
        severity: 'medium',
        category: 'RF Link',
        title: 'Weak SNR Link (-15.1 dB)',
        description: 'High packet retransmission rate to GW-Echo. Recommend secondary gateway relay.',
        timestamp: '01 Sep 2026, 09:12 AM',
        status: 'Active',
      },
    ],
  },
  {
    meterId: '0024004068',
    devEui: '70B3D57ED005A328',
    householdId: 'WS/BMC/1488809',
    householdShortId: '1488809',
    householdName: 'Ajay Sahoo',
    locality: 'Saheed Nagar, Ward 5',
    lat: 20.2925,
    lng: 85.8580,
    gatewayId: '506f9800000002a8',
    gatewayAlias: 'GW-Hotel',
    distanceMeters: 320,
    rssi: -87.1,
    snr: -12.6,
    status: 'active',
    batteryStatus: 'Abnormal',
    batteryVoltage: 3.12,
    batteryPercentage: 24,
    valveStatus: 'Normal',
    valveState: 'Closed',
    lastSeen: '5 min ago',
    pipeDiameter: 'DN20 (3/4")',
    connectionType: 'Commercial / Small Business',
    installDate: '2024-08-01',
    currentReadingM3: 46.12,
    yesterdayConsumptionL: 520,
    yesterdayConsumptionM3: 0.52,
    monthConsumptionL: 15700,
    monthConsumptionM3: 15.7,
    estimatedBillInr: 235.5,
    currentFlowRateLph: 0.0,
    dailyAvgL: 510,
    last10DaysReadings: build10DayReadings(46.12, 510, [10, 40, -30, 20, 90, -40, 10, 60, -20, 0]),
    alerts: [
      {
        id: 'ALM-082',
        severity: 'high',
        category: 'Hardware',
        title: 'Low Battery Voltage Critical (< 3.2V)',
        description: 'Internal cell reached 3.12V. Replace LiSOCl2 battery pack within 14 days.',
        timestamp: '04 Sep 2026, 06:10 AM',
        status: 'Active',
      },
      {
        id: 'ALM-006',
        severity: 'medium',
        category: 'Hardware',
        title: 'Meter RTC Clock Anomaly (Year 2074)',
        description: 'Meter clock synchronization offset detected. Remote time sync packet dispatched.',
        timestamp: '02 Sep 2026, 14:00 PM',
        status: 'Active',
      },
    ],
  },
  {
    meterId: '0024004081',
    devEui: '70B3D57ED005A325',
    householdId: 'WS/BMC/2500692',
    householdShortId: '2500692',
    householdName: 'Priya Das',
    locality: 'Patia, Ward 14',
    lat: 20.294,
    lng: 85.826,
    gatewayId: '506f9800000002a5',
    gatewayAlias: 'GW-Alpha',
    distanceMeters: 260,
    rssi: -87.0,
    snr: -14.0,
    status: 'active',
    batteryStatus: 'Normal',
    batteryVoltage: 3.65,
    batteryPercentage: 98,
    valveStatus: 'Normal',
    valveState: 'Open',
    lastSeen: '45 sec ago',
    pipeDiameter: 'DN15 (1/2")',
    connectionType: 'Domestic Residential',
    installDate: '2024-05-10',
    currentReadingM3: 38.63,
    yesterdayConsumptionL: 345,
    yesterdayConsumptionM3: 0.345,
    monthConsumptionL: 9800,
    monthConsumptionM3: 9.8,
    estimatedBillInr: 147.0,
    currentFlowRateLph: 0.0,
    dailyAvgL: 330,
    last10DaysReadings: build10DayReadings(38.63, 330, [15, -20, 40, 10, -30, 25, 60, -10, 5, 0]),
    alerts: [],
  },
  {
    meterId: '0024004083',
    devEui: '70B3D57ED005A2A3',
    householdId: 'WS/BMC/2490326',
    householdShortId: '2490326',
    householdName: 'Manoj Behera',
    locality: 'Chandrasekharpur, Ward 3',
    lat: 20.3135,
    lng: 85.843,
    gatewayId: '506f9800000002a3',
    gatewayAlias: 'GW-Juliet',
    distanceMeters: 290,
    rssi: -91.3,
    snr: -14.1,
    status: 'weak',
    batteryStatus: 'Normal',
    batteryVoltage: 3.61,
    batteryPercentage: 92,
    valveStatus: 'Abnormal',
    valveState: 'Throttled',
    lastSeen: '9 min ago',
    pipeDiameter: 'DN15 (1/2")',
    connectionType: 'Domestic Residential',
    installDate: '2024-09-01',
    currentReadingM3: 0.07,
    yesterdayConsumptionL: 45,
    yesterdayConsumptionM3: 0.045,
    monthConsumptionL: 950,
    monthConsumptionM3: 0.95,
    estimatedBillInr: 50.0,
    currentFlowRateLph: 0.0,
    dailyAvgL: 40,
    last10DaysReadings: build10DayReadings(0.07, 40, [5, -10, 15, -5, 0, 10, -15, 20, 0, 0]),
    alerts: [
      {
        id: 'ALM-005',
        severity: 'medium',
        category: 'Hardware',
        title: 'Meter Clock Implausible (Year 20142)',
        description: 'Corrupted timestamp in uplink payload header. Requires firmware RTC reset.',
        timestamp: '04 Sep 2026, 04:09 AM',
        status: 'Active',
      },
    ],
  },
  {
    meterId: '0024004086',
    devEui: '70B3D57ED005A326',
    householdId: 'WS/BMC/1446931',
    householdShortId: '1446931',
    householdName: 'Deepak Mishra',
    locality: 'Khandagiri, Ward 22',
    lat: 20.3028,
    lng: 85.8025,
    gatewayId: '506f980000000261',
    gatewayAlias: 'GW-Golf',
    distanceMeters: 360,
    rssi: -97.3,
    snr: -16.5,
    status: 'weak',
    batteryStatus: 'Normal',
    batteryVoltage: 3.6,
    batteryPercentage: 91,
    valveStatus: 'Normal',
    valveState: 'Open',
    lastSeen: '4 min ago',
    pipeDiameter: 'DN20 (3/4")',
    connectionType: 'Domestic Residential',
    installDate: '2024-03-18',
    currentReadingM3: 58.7,
    yesterdayConsumptionL: 490,
    yesterdayConsumptionM3: 0.49,
    monthConsumptionL: 14200,
    monthConsumptionM3: 14.2,
    estimatedBillInr: 213.0,
    currentFlowRateLph: 0.0,
    dailyAvgL: 470,
    last10DaysReadings: build10DayReadings(58.7, 470, [20, -10, 30, 50, -40, 10, 30, -20, 10, 0]),
    alerts: [
      {
        id: 'ALM-076',
        severity: 'medium',
        category: 'RF Link',
        title: 'Marginal Signal Link (RSSI -97.3 dBm)',
        description: 'Sub-optimal path loss due to terrain elevation. Frame loss rate at 8.3%.',
        timestamp: '04 Sep 2026, 05:25 AM',
        status: 'Active',
      },
    ],
  },
  {
    meterId: '0024004092',
    devEui: '70B3D57ED005A342',
    householdId: 'WS/BMC/1490019',
    householdShortId: '1490019',
    householdName: 'Alok Jena',
    locality: 'Nayapalli, Ward 8',
    lat: 20.322,
    lng: 85.8725,
    gatewayId: '506f980000000340',
    gatewayAlias: 'GW-Echo',
    distanceMeters: 310,
    rssi: -92.0,
    snr: -9.8,
    status: 'active',
    batteryStatus: 'Abnormal',
    batteryVoltage: 3.19,
    batteryPercentage: 29,
    valveStatus: 'Abnormal',
    valveState: 'Closed',
    lastSeen: '18 min ago',
    pipeDiameter: 'DN15 (1/2")',
    connectionType: 'Domestic Residential',
    installDate: '2024-04-12',
    currentReadingM3: 26.86,
    yesterdayConsumptionL: 280,
    yesterdayConsumptionM3: 0.28,
    monthConsumptionL: 7900,
    monthConsumptionM3: 7.9,
    estimatedBillInr: 118.5,
    currentFlowRateLph: 0.0,
    dailyAvgL: 270,
    last10DaysReadings: build10DayReadings(26.86, 270, [10, -20, 15, -10, 40, -15, 20, -10, 10, 0]),
    alerts: [
      {
        id: 'ALM-085',
        severity: 'high',
        category: 'Hardware',
        title: 'Dual Hardware Warning (Battery & Valve)',
        description: 'Battery 3.19V and valve motor position sensor mismatch.',
        timestamp: '04 Sep 2026, 03:46 AM',
        status: 'Active',
      },
    ],
  },
  {
    meterId: '0024004094',
    devEui: '70B3D57ED005A343',
    householdId: 'WS/BMC/2379686',
    householdShortId: '2379686',
    householdName: 'Kavita Nayak',
    locality: 'Jayadev Vihar',
    lat: 20.2975,
    lng: 85.827,
    gatewayId: '506f9800000002a5',
    gatewayAlias: 'GW-Alpha',
    distanceMeters: 310,
    rssi: -86.5,
    snr: -7.5,
    status: 'active',
    batteryStatus: 'Normal',
    batteryVoltage: 3.64,
    batteryPercentage: 97,
    valveStatus: 'Normal',
    valveState: 'Open',
    lastSeen: '1 min ago',
    pipeDiameter: 'DN25 (1")',
    connectionType: 'Institutional / School',
    installDate: '2023-11-04',
    currentReadingM3: 612.35,
    yesterdayConsumptionL: 1420,
    yesterdayConsumptionM3: 1.42,
    monthConsumptionL: 42800,
    monthConsumptionM3: 42.8,
    estimatedBillInr: 642.0,
    currentFlowRateLph: 28.5,
    dailyAvgL: 1390,
    last10DaysReadings: build10DayReadings(612.35, 1390, [30, -50, 80, -20, 110, -60, 40, 70, -30, 0]),
    alerts: [],
  },
  {
    meterId: '0024004099',
    devEui: '70B3D57ED005A299',
    householdId: 'WS/BMC/1507661',
    householdShortId: '1507661',
    householdName: 'Bikash Tripathy',
    locality: 'Bapuji Nagar',
    lat: 20.2685,
    lng: 85.8165,
    gatewayId: '506f980000000299',
    gatewayAlias: 'GW-India',
    distanceMeters: 230,
    rssi: -85.0,
    snr: -9.7,
    status: 'active',
    batteryStatus: 'Normal',
    batteryVoltage: 3.63,
    batteryPercentage: 95,
    valveStatus: 'Normal',
    valveState: 'Open',
    lastSeen: '8 min ago',
    pipeDiameter: 'DN15 (1/2")',
    connectionType: 'Domestic Residential',
    installDate: '2024-02-14',
    currentReadingM3: 172.09,
    yesterdayConsumptionL: 410,
    yesterdayConsumptionM3: 0.41,
    monthConsumptionL: 11900,
    monthConsumptionM3: 11.9,
    estimatedBillInr: 178.5,
    currentFlowRateLph: 0.0,
    dailyAvgL: 395,
    last10DaysReadings: build10DayReadings(172.09, 395, [15, -25, 30, -10, 45, -30, 20, 15, -10, 0]),
    alerts: [],
  },
  {
    meterId: '0024004110',
    devEui: '70B3D57ED005A29E',
    householdId: 'WS/BMC/2501194',
    householdShortId: '2501194',
    householdName: 'Sasmita Rout',
    locality: 'Unit 4',
    lat: 20.2635,
    lng: 85.8368,
    gatewayId: '506f98000000029e',
    gatewayAlias: 'GW-Foxtrot',
    distanceMeters: 250,
    rssi: -86.2,
    snr: -12.1,
    status: 'active',
    batteryStatus: 'Normal',
    batteryVoltage: 3.61,
    batteryPercentage: 93,
    valveStatus: 'Normal',
    valveState: 'Open',
    lastSeen: '1 min ago',
    pipeDiameter: 'DN15 (1/2")',
    connectionType: 'Domestic Residential',
    installDate: '2024-08-10',
    currentReadingM3: 1.66,
    yesterdayConsumptionL: 210,
    yesterdayConsumptionM3: 0.21,
    monthConsumptionL: 1660,
    monthConsumptionM3: 1.66,
    estimatedBillInr: 60.0,
    currentFlowRateLph: 0.0,
    dailyAvgL: 200,
    last10DaysReadings: build10DayReadings(1.66, 200, [10, -15, 20, -10, 25, -20, 15, 10, -5, 0]),
    alerts: [],
  },
  {
    meterId: '0024004115',
    devEui: '70B3D57ED005A262',
    householdId: 'WS/BMC/2501230',
    householdShortId: '2501230',
    householdName: 'Ashok Mohapatra',
    locality: 'Baramunda, Ward 17',
    lat: 20.2785,
    lng: 85.808,
    gatewayId: '506f980000000262',
    gatewayAlias: 'GW-Delta',
    distanceMeters: 280,
    rssi: -94.4,
    snr: -16.9,
    status: 'silent',
    batteryStatus: 'Abnormal',
    batteryVoltage: 2.92,
    batteryPercentage: 8,
    valveStatus: 'Normal',
    valveState: 'Closed',
    lastSeen: '42 min ago',
    pipeDiameter: 'DN15 (1/2")',
    connectionType: 'Domestic Residential',
    installDate: '2024-01-19',
    currentReadingM3: 184.2,
    yesterdayConsumptionL: 0,
    yesterdayConsumptionM3: 0.0,
    monthConsumptionL: 4100,
    monthConsumptionM3: 4.1,
    estimatedBillInr: 61.5,
    currentFlowRateLph: 0.0,
    dailyAvgL: 280,
    last10DaysReadings: build10DayReadings(184.2, 280, [0, 0, -200, 20, 15, -10, 25, 10, -5, 0], true),
    alerts: [
      {
        id: 'ALM-095',
        severity: 'critical',
        category: 'RF Link',
        title: 'Meter Silent: Missing Uplinks > 42 Hours',
        description: 'Device stopped transmitting periodic telemetry packets. Gateway GW-Delta has not heard keepalive.',
        timestamp: '04 Sep 2026, 01:10 AM',
        status: 'Active',
      },
      {
        id: 'ALM-094',
        severity: 'critical',
        category: 'Hardware',
        title: 'Battery Exhaustion Critical (< 3.0V)',
        description: 'Terminal cell voltage 2.92V. Radio transmit lockout active.',
        timestamp: '03 Sep 2026, 14:22 PM',
        status: 'Active',
      },
    ],
  },
  {
    meterId: '0024004120',
    devEui: '70B3D57ED005A2A6',
    householdId: 'WS/BMC/2501440',
    householdShortId: '2501440',
    householdName: 'Niranjan Swain',
    locality: 'Ashok Nagar',
    lat: 20.273,
    lng: 85.842,
    gatewayId: '506f9800000002a6',
    gatewayAlias: 'GW-Bravo',
    distanceMeters: 310,
    rssi: -89.7,
    snr: -11.5,
    status: 'active',
    batteryStatus: 'Normal',
    batteryVoltage: 3.63,
    batteryPercentage: 94,
    valveStatus: 'Normal',
    valveState: 'Open',
    lastSeen: '18 sec ago',
    pipeDiameter: 'DN15 (1/2")',
    connectionType: 'Domestic Residential',
    installDate: '2024-06-25',
    currentReadingM3: 94.15,
    yesterdayConsumptionL: 360,
    yesterdayConsumptionM3: 0.36,
    monthConsumptionL: 10400,
    monthConsumptionM3: 10.4,
    estimatedBillInr: 156.0,
    currentFlowRateLph: 0.0,
    dailyAvgL: 350,
    last10DaysReadings: build10DayReadings(94.15, 350, [10, -15, 25, -10, 30, -20, 15, 10, -5, 0]),
    alerts: [],
  },
  {
    meterId: '0024004125',
    devEui: '70B3D57ED005A29A',
    householdId: 'WS/BMC/2501890',
    householdShortId: '2501890',
    householdName: 'Prabhat Panda',
    locality: 'VSS Nagar',
    lat: 20.308,
    lng: 85.852,
    gatewayId: '506f98000000029a',
    gatewayAlias: 'GW-Charlie',
    distanceMeters: 290,
    rssi: -86.7,
    snr: -9.5,
    status: 'active',
    batteryStatus: 'Normal',
    batteryVoltage: 3.65,
    batteryPercentage: 98,
    valveStatus: 'Normal',
    valveState: 'Open',
    lastSeen: '45 sec ago',
    pipeDiameter: 'DN15 (1/2")',
    connectionType: 'Domestic Residential',
    installDate: '2024-07-02',
    currentReadingM3: 88.42,
    yesterdayConsumptionL: 395,
    yesterdayConsumptionM3: 0.395,
    monthConsumptionL: 11200,
    monthConsumptionM3: 11.2,
    estimatedBillInr: 168.0,
    currentFlowRateLph: 0.0,
    dailyAvgL: 380,
    last10DaysReadings: build10DayReadings(88.42, 380, [15, -20, 30, -15, 40, -25, 20, 15, -10, 0]),
    alerts: [],
  },
  {
    meterId: '0024004130',
    devEui: '70B3D57ED005A29D',
    householdId: 'WS/BMC/2502100',
    householdShortId: '2502100',
    householdName: 'Subhasree Senapati',
    locality: 'Kapilaprasad',
    lat: 20.253,
    lng: 85.857,
    gatewayId: '506f98000000029d',
    gatewayAlias: 'GW-Kilo',
    distanceMeters: 310,
    rssi: -85.8,
    snr: -15.4,
    status: 'silent',
    batteryStatus: 'Normal',
    batteryVoltage: 3.52,
    batteryPercentage: 79,
    valveStatus: 'Abnormal',
    valveState: 'Throttled',
    lastSeen: '35 min ago',
    pipeDiameter: 'DN15 (1/2")',
    connectionType: 'Domestic Residential',
    installDate: '2024-03-30',
    currentReadingM3: 63.28,
    yesterdayConsumptionL: 0,
    yesterdayConsumptionM3: 0.0,
    monthConsumptionL: 5200,
    monthConsumptionM3: 5.2,
    estimatedBillInr: 78.0,
    currentFlowRateLph: 0.0,
    dailyAvgL: 260,
    last10DaysReadings: build10DayReadings(63.28, 260, [0, 0, -180, 20, 15, -10, 25, 10, -5, 0], true),
    alerts: [
      {
        id: 'ALM-097',
        severity: 'high',
        category: 'RF Link',
        title: 'Intermittent Keepalive Packet Drops',
        description: 'Gateway GW-Kilo report high packet drop rate (45%) over last 48 hours.',
        timestamp: '04 Sep 2026, 05:00 AM',
        status: 'Active',
      },
    ],
  },
];

