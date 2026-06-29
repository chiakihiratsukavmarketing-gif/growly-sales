import type { Lead, ManualSendMethod, ReplyStatus, DealStatus } from '../../types/lead.js';
import { readApiError } from './apiError.js';

const API_BASE = '';

export async function markManualSentApi(
  leadId: string,
  payload: { method: ManualSendMethod; memo?: string; sentAt?: string }
): Promise<Lead> {
  const res = await fetch(`${API_BASE}/api/leads/${encodeURIComponent(leadId)}/manual-sent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readApiError(res, `POST /api/leads/${leadId}/manual-sent`, '手動送信の記録に失敗しました'));
  const data = (await res.json()) as { lead: Lead };
  return data.lead;
}

export async function updateLeadReplyManagementApi(
  leadId: string,
  payload: {
    replyStatus?: ReplyStatus;
    replySummary?: string;
    nextAction?: string;
    repliedAt?: string | null;
    followUpDueAt?: string | null;
    communicationMemo?: string;
  }
): Promise<Lead> {
  const res = await fetch(`${API_BASE}/api/leads/${encodeURIComponent(leadId)}/reply-management`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(
      await readApiError(res, `POST /api/leads/${leadId}/reply-management`, '返信管理の更新に失敗しました')
    );
  }
  const data = (await res.json()) as { lead: Lead };
  return data.lead;
}

export async function markReplyStatusApi(
  leadId: string,
  payload: { replyStatus: ReplyStatus; memo?: string }
): Promise<Lead> {
  const res = await fetch(`${API_BASE}/api/leads/${encodeURIComponent(leadId)}/reply-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readApiError(res, `POST /api/leads/${leadId}/reply-status`, '返信ステータス更新に失敗しました'));
  const data = (await res.json()) as { lead: Lead };
  return data.lead;
}

export async function markFollowUpApi(
  leadId: string,
  payload: { followUpDate: string; memo?: string }
): Promise<Lead> {
  const res = await fetch(`${API_BASE}/api/leads/${encodeURIComponent(leadId)}/follow-up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readApiError(res, `POST /api/leads/${leadId}/follow-up`, 'フォロー予定の更新に失敗しました'));
  const data = (await res.json()) as { lead: Lead };
  return data.lead;
}

export async function markDealStatusApi(
  leadId: string,
  payload: { dealStatus: DealStatus; memo?: string }
): Promise<Lead> {
  const res = await fetch(`${API_BASE}/api/leads/${encodeURIComponent(leadId)}/deal-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readApiError(res, `POST /api/leads/${leadId}/deal-status`, '商談ステータス更新に失敗しました'));
  const data = (await res.json()) as { lead: Lead };
  return data.lead;
}

export async function updateCommunicationMemoApi(leadId: string, memo: string): Promise<Lead> {
  const res = await fetch(`${API_BASE}/api/leads/${encodeURIComponent(leadId)}/communication-memo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memo }),
  });
  if (!res.ok) throw new Error(await readApiError(res, `POST /api/leads/${leadId}/communication-memo`, 'メモの更新に失敗しました'));
  const data = (await res.json()) as { lead: Lead };
  return data.lead;
}

