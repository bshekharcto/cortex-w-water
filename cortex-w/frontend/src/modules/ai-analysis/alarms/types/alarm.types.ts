export interface AlertAttachment {
  documentId?: string | null;
  name: string;
  category: string;
  s3BucketURL: string;
  uploadDateTime?: string;
  deleteDateTime?: string | null;
}

export interface AlertDTO {
  id: number;
  alertId: number;
  alertCode: string;
  alertDescription: string;
  alertType: string;
  category: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'RESOLVED' | 'CLOSED';
  alertStatus: string;
  severity: string;
  siteId: number;
  siteName: string;
  city?: string;
  assetId: number;
  assetName: string;
  meterId: string;
  assetClassName?: string;
  alertValue?: string;
  createdBy?: string;
  createdDate: string;
  assigneeName?: string;
  attachments?: AlertAttachment[];
}

export interface AlertListFilter {
  page: number;
  size: number;
  search?: string;
  priority?: string;
  status?: string;
  city?: string;
}

export interface AlertStats {
  totalAlerts: number;
  openAlerts: number;
  validateReadingCount: number;
  mediumCount: number;
  highCount: number;
  criticalCount: number;
}

export interface AlertDetailResponse {
  alert: AlertDTO;
  meter: {
    meterId: string;
    assetId: number;
    assetClassName: string;
    activeGisMeter: any;
    currentReadingM3: number;
    lat?: number | null;
    lng?: number | null;
  };
  consumer: {
    name: string;
    customId: string;
    location: string;
    city: string;
    ward: string;
  };
  attachments: AlertAttachment[];
  history: Array<{
    timestamp: string;
    action: string;
    user: string;
    note: string;
  }>;
  aiDiagnostic: {
    classification: string;
    confidenceScore: number;
    ruleTriggered: string;
    recommendedAction: string;
  };
}
