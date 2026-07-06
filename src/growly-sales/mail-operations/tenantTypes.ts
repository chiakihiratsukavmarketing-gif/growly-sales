export type MailOperationsTenantStatus = 'active' | 'suspended';

export interface MailOperationsTenant {
  tenantId: string;
  displayName: string;
  legalName: string;
  publicBaseUrl: string;
  contactEmail: string;
  privacyPolicyUrl?: string;
  logoUrl?: string;
  status: MailOperationsTenantStatus;
  createdAt: string;
  updatedAt: string;
}
