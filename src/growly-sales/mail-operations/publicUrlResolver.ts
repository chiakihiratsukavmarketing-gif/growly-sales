import { requireMailOperationsTenant } from './tenantResolver.js';

export function resolveMailOperationsPublicBaseUrl(tenantId: string): string {
  const tenant = requireMailOperationsTenant(tenantId);
  return tenant.publicBaseUrl.trim().replace(/\/+$/, '');
}

export function buildUnsubscribeUrl(input: { tenantId: string; token: string }): string {
  const base = resolveMailOperationsPublicBaseUrl(input.tenantId);
  const token = input.token.trim();
  if (!token) throw new Error('token が空です');
  return `${base}/u/${encodeURIComponent(token)}`;
}
