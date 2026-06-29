import type { Lead } from '../../types/lead.js';
import type { ManualGmailSendPreview } from '../workflow/recordManualGmailSent.js';
import { readApiError } from './apiError.js';

const API_BASE = '';

export interface SendRecordPendingResponse {
  pending: ManualGmailSendPreview[];
  generatedAt: string;
  leadsPath: string;
  note: string;
}

export interface RecordManualGmailSentResponse {
  lead: Lead;
  preview: ManualGmailSendPreview;
  message: string;
}

export async function fetchSendRecordPending(): Promise<SendRecordPendingResponse> {
  const res = await fetch(`${API_BASE}/api/send-record-pending`);
  if (!res.ok) {
    throw new Error(
      await readApiError(res, 'GET /api/send-record-pending', '送信記録待ち一覧の取得に失敗しました')
    );
  }
  return (await res.json()) as SendRecordPendingResponse;
}

export async function recordManualGmailSentApi(
  leadId: string,
  payload: { draftId: string }
): Promise<RecordManualGmailSentResponse> {
  const res = await fetch(
    `${API_BASE}/api/leads/${encodeURIComponent(leadId)}/record-manual-gmail-sent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    throw new Error(
      await readApiError(
        res,
        `POST /api/leads/${leadId}/record-manual-gmail-sent`,
        '手動送信の記録に失敗しました'
      )
    );
  }
  return (await res.json()) as RecordManualGmailSentResponse;
}
