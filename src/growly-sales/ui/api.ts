import type { Lead } from '../../types/lead.js';
import { readApiError } from './apiError.js';

const API_BASE = '';

export async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch(`${API_BASE}/api/leads`);
  if (!res.ok) {
    throw new Error(await readApiError(res, 'GET /api/leads', 'リード一覧の取得に失敗しました'));
  }
  const data = (await res.json()) as { leads: Lead[] };
  return data.leads;
}

export async function approveLead(leadId: string): Promise<Lead> {
  const res = await fetch(`${API_BASE}/api/leads/${encodeURIComponent(leadId)}/approve`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(await readApiError(res, `POST /api/leads/${leadId}/approve`, '承認に失敗しました'));
  const data = (await res.json()) as { lead: Lead };
  return data.lead;
}

export async function needsRevisionLead(leadId: string, comment: string): Promise<Lead> {
  const res = await fetch(`${API_BASE}/api/leads/${encodeURIComponent(leadId)}/needs-revision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, `POST /api/leads/${leadId}/needs-revision`, '修正依頼に失敗しました'));
  }
  const data = (await res.json()) as { lead: Lead };
  return data.lead;
}

export async function rejectLeadApi(leadId: string, reason: string): Promise<Lead> {
  const res = await fetch(`${API_BASE}/api/leads/${encodeURIComponent(leadId)}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(await readApiError(res, `POST /api/leads/${leadId}/reject`, '却下に失敗しました'));
  const data = (await res.json()) as { lead: Lead };
  return data.lead;
}

export async function doNotContactLead(leadId: string, reason: string): Promise<Lead> {
  const res = await fetch(`${API_BASE}/api/leads/${encodeURIComponent(leadId)}/do-not-contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, `POST /api/leads/${leadId}/do-not-contact`, '連絡禁止の設定に失敗しました'));
  }
  const data = (await res.json()) as { lead: Lead };
  return data.lead;
}

export async function saveEmailDraft(
  leadId: string,
  payload: {
    emailSubject: string;
    emailBody: string;
    reviewComment?: string;
    nextAction?: string;
  }
): Promise<Lead> {
  const res = await fetch(`${API_BASE}/api/leads/${encodeURIComponent(leadId)}/email-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, `POST /api/leads/${leadId}/email-draft`, 'メール文の保存に失敗しました'));
  }
  const data = (await res.json()) as { lead: Lead };
  return data.lead;
}
