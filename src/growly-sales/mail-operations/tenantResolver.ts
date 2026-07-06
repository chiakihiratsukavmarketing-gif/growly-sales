import type { MailOperationsTenant } from './tenantTypes.js';

export const DEFAULT_TENANT_ID = 'want-reach';

const NOW = new Date().toISOString();

// IMPORTANT: Do not guess contactEmail; keep explicit empty placeholder for now.
const DEFAULT_TENANT: MailOperationsTenant = {
  tenantId: DEFAULT_TENANT_ID,
  displayName: '合同会社Want Reach',
  legalName: '合同会社Want Reach',
  publicBaseUrl: 'https://mailops.wantreach.jp',
  contactEmail: '',
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW,
};

export function getDefaultMailOperationsTenantId(): string {
  return DEFAULT_TENANT_ID;
}

export function resolveMailOperationsTenant(tenantId: string): MailOperationsTenant | null {
  if (tenantId.trim() === DEFAULT_TENANT_ID) return DEFAULT_TENANT;
  return null;
}

export function requireMailOperationsTenant(tenantId: string): MailOperationsTenant {
  const tenant = resolveMailOperationsTenant(tenantId);
  if (!tenant) {
    throw new Error(`不明な tenantId: ${tenantId}`);
  }
  if (tenant.status !== 'active') {
    throw new Error(`tenant が有効ではありません: ${tenantId}`);
  }
  return tenant;
}
