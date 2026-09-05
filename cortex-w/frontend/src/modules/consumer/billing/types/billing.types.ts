export type BillingStatus = 'PAID' | 'PENDING' | 'OVERDUE' | 'Paid' | 'Pending' | 'Overdue';

export interface BillChargeDTO {
  id: number;
  chargeName: string;
  type: string;
  rate: number;
  amountCharged: number;
}

export interface BillDTO {
  id: number;
  customId: string;
  date: string;
  dueDate: string;
  startDate: string;
  endDate: string;
  amount: number;
  prevReading: number;
  currentReading: number;
  consumption?: number;
  status: string;
  siteId: number;
  assetId: number;
  siteName: string;
  householdName?: string;
  householdCustomId?: string;
  address?: string;
  ward?: string;
  billCharges: BillChargeDTO[];
  meterId: string;
  city?: string;
}

export interface BillingSlabDTO {
  id: number;
  siteId: number;
  minUnits: number;
  maxUnits: number | null;
  ratePerUnit: number;
}

export interface BillingStats {
  totalBills: number;
  totalAmount: number;
  overdueAmount: number;
  paidAmount: number;
  overdueCount: number;
  paidCount: number;
  pendingCount: number;
  avgAmount: number;
  totalConsM3?: number;
  avgConsM3?: number;
}

export interface BillingListFilter {
  page: number;
  size: number;
  startDate?: string;
  endDate?: string;
  search?: string;
  status?: string;
  city?: string;
}

export interface BillDetailResponse {
  bill: BillDTO;
  consumer: {
    customId: string;
    name: string;
    address: string;
    city: string;
    ward: string;
    siteName: string;
    mobile?: string;
  };
  meter: {
    meterId: string;
    assetId: number;
    currentReading: number;
    prevReading: number;
    consumption: number;
    activeGisMeter: any;
  };
  charges: BillChargeDTO[];
  dailyReadings: Array<{
    date: string;
    shortDate: string;
    readingM3: number;
    reading: number;
    consumptionL: number;
    consumptionM3: number;
    consumption: number;
    flag?: string;
  }>;
  tariffs: Array<{
    slab: string;
    min: number;
    max: number | null;
    rate: number;
    unit: string;
  }>;
}
