export type BillingStatus = 'Paid' | 'Pending' | 'Overdue';

export interface BillDTO {
  id: number;
  assetId: string;
  householdId: string;
  siteId: number;
  billDate: string;
  dueDate: string;
  prevReading: number;
  currentReading: number;
  consumption: number;      // currentReading - prevReading, display only, spec 26.8
  amount: number;           // server-computed, never calculated client-side
  billCharges: Array<{ label: string; amount: number }>;
  status: BillingStatus;
}

export interface BillingSlabDTO {
  id: number;
  siteId: number;
  minUnits: number;
  maxUnits: number | null;
  ratePerUnit: number;
}
