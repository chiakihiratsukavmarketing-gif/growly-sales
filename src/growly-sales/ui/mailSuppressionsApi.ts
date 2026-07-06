import { readApiError } from './apiError.js';
import type { MailSuppression } from '../mail-operations/suppressionTypes.js';

const API_BASE = '';

export interface MailSuppressionsResponse {
  records: MailSuppression[];
  generatedAt: string;
  mode: 'mock' | 'live';
  note: string;
}

export interface SuppressionCheckResponse {
  allowed: boolean;
  blockReason: string | null;
  statusLabel: string | null;
  blockedAt: string | null;
}

export async function fetchMailSuppressions(tenantId: string): Promise<MailSuppressionsResponse> {
  const res = await fetch(`${API_BASE}/api/mail-suppressions?tenantId=${encodeURIComponent(tenantId)}`);
  if (!res.ok) {
    throw new Error(await readApiError(res, 'GET /api/mail-suppressions', '配信禁止リストの取得に失敗しました'));
  }
  return (await res.json()) as MailSuppressionsResponse;
}

export async function addManualSuppressionApi(input: {
  tenantId: string;
  emailAddress: string;
  leadId?: string;
  companyId?: string;
  reason: string;
  confirmToken: string;
}): Promise<{ record: MailSuppression; message: string }> {
  const res = await fetch(`${API_BASE}/api/mail-suppressions/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'POST /api/mail-suppressions/manual', '手動登録に失敗しました'));
  }
  return (await res.json()) as { record: MailSuppression; message: string };
}

export async function reactivateSuppressionApi(input: {
  suppressionId: string;
  reactivationMemo: string;
  confirmToken: string;
}): Promise<{ record: MailSuppression; message: string }> {
  const res = await fetch(`${API_BASE}/api/mail-suppressions/reactivate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'POST /api/mail-suppressions/reactivate', '解除に失敗しました'));
  }
  return (await res.json()) as { record: MailSuppression; message: string };
}

export async function checkSuppressionApi(input: {
  tenantId: string;
  leadId?: string;
  emailAddress?: string;
}): Promise<SuppressionCheckResponse> {
  const params = new URLSearchParams();
  params.set('tenantId', input.tenantId);
  if (input.leadId) params.set('leadId', input.leadId);
  if (input.emailAddress) params.set('emailAddress', input.emailAddress);
  const res = await fetch(`${API_BASE}/api/mail-suppressions/check?${params.toString()}`);
  if (!res.ok) {
    throw new Error(await readApiError(res, 'GET /api/mail-suppressions/check', '配信禁止チェックに失敗しました'));
  }
  return (await res.json()) as SuppressionCheckResponse;
}

export interface MockUnsubscribePreviewResponse {
  status: 'ready' | 'invalid_token' | 'expired_token';
  message: string;
  emailMasked?: string;
  mock: true;
}

export async function previewMockUnsubscribe(token: string): Promise<MockUnsubscribePreviewResponse> {
  const res = await fetch(`${API_BASE}/api/mock/unsubscribe/${encodeURIComponent(token)}`);
  if (!res.ok) {
    throw new Error(await readApiError(res, 'GET /api/mock/unsubscribe', '配信停止プレビューに失敗しました'));
  }
  return (await res.json()) as MockUnsubscribePreviewResponse;
}

export async function confirmMockUnsubscribeApi(
  token: string
): Promise<{ ok: boolean; status: string; message: string; alreadySuppressed?: boolean }> {
  const res = await fetch(`${API_BASE}/api/mock/unsubscribe/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'POST /api/mock/unsubscribe', '配信停止の確定に失敗しました'));
  }
  return (await res.json()) as { ok: boolean; status: string; message: string; alreadySuppressed?: boolean };
}

export const SUPPRESSION_MANUAL_CONFIRM_TOKEN = 'SUPPRESSION_MANUAL';
export const SUPPRESSION_REACTIVATE_CONFIRM_TOKEN = 'SUPPRESSION_REACTIVATE';
