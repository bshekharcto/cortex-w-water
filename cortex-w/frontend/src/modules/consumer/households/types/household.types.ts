export interface AttachmentDTO {
  documentId?: number;
  name: string;
  category: string;
  expirationDate?: string;
  s3BucketURL: string;
  uploadDateTime: string;
  deleteDateTime?: string;
}

export interface HouseholdDTO {
  id: number;
  customId?: string;
  name: string;
  location: string;
  pinCode: string;
  status: string;
  registrationDate: string;
  countryCode: string;
  mobile: string;
  siteId: number;
  assetId?: number;
  email?: string;
  siteName?: string;
  createdBy?: string;
  zone?: string;
  locality?: string;
  ward?: string;
  aadharNo?: string;
  dma?: string;
  guardianName?: string;
  guardianRelation?: 'S/O' | 'D/O' | 'W/O' | 'C/O';
  city?: string;
  attachments?: AttachmentDTO[];
}
