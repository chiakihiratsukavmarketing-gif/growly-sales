import { readApiError } from './apiError.js';

const API_BASE = '';

export interface SignatureRefreshPreviewItem {
  leadId: string;
  companyName: string;
  currentSignatureEmail: string | null;
  expectedSignatureEmail: string;
  hadDraft: boolean;
}

export interface SignatureRefreshPreviewResponse {
  targets: SignatureRefreshPreviewItem[];
  totalCount: number;
  generatedAt: string;
  note: string;
}

export interface SignatureRefreshResultResponse {
  refreshed: SignatureRefreshPreviewItem[];
  clearedDrafts: string[];
  skippedSentCount: number;
  expectedSignatureEmail: string;
  refreshedCount: number;
  message: string;
}

export async function fetchSignatureRefreshPreview(): Promise<SignatureRefreshPreviewResponse> {
  const res = await fetch(`${API_BASE}/api/signature-refresh-preview`);
  if (!res.ok) {
    throw new Error(
      await readApiError(res, 'GET /api/signature-refresh-preview', '署名更新プレビューの取得に失敗しました')
    );
  }
  return (await res.json()) as SignatureRefreshPreviewResponse;
}

export async function refreshUnsentSignaturesApi(): Promise<SignatureRefreshResultResponse> {
  const res = await fetch(`${API_BASE}/api/refresh-unsent-signatures`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    throw new Error(
      await readApiError(res, 'POST /api/refresh-unsent-signatures', '署名の一括更新に失敗しました')
    );
  }
  return (await res.json()) as SignatureRefreshResultResponse;
}
