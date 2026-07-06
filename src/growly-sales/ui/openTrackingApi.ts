import type { LeadOpenStats } from '../mail-operations/openTrackingTypes.js';
import { readApiError } from './apiError.js';

const API_BASE = '';

export interface SentLeadsOpenStatsResponse {
  stats: LeadOpenStats[];
  note: string;
  mock: boolean;
}

export interface LeadOpenStatsResponse {
  leadId: string;
  stats: LeadOpenStats;
  note: string;
  mock: boolean;
}

export async function fetchOpenStatsForSentLeads(
  leadIds: string[]
): Promise<SentLeadsOpenStatsResponse> {
  const query = leadIds.length > 0 ? `?leadIds=${encodeURIComponent(leadIds.join(','))}` : '';
  const res = await fetch(`${API_BASE}/api/open-tracking/sent-leads${query}`);
  if (!res.ok) {
    throw new Error(
      await readApiError(res, 'GET /api/open-tracking/sent-leads', '開封参考値の取得に失敗しました')
    );
  }
  return (await res.json()) as SentLeadsOpenStatsResponse;
}

export async function fetchLeadOpenStats(leadId: string): Promise<LeadOpenStatsResponse> {
  const res = await fetch(
    `${API_BASE}/api/send-records/${encodeURIComponent(leadId)}/open-stats`
  );
  if (!res.ok) {
    throw new Error(
      await readApiError(
        res,
        `GET /api/send-records/${leadId}/open-stats`,
        '開封参考値の取得に失敗しました'
      )
    );
  }
  return (await res.json()) as LeadOpenStatsResponse;
}

export async function recordMockOpenEventApi(input: {
  token: string;
  userAgent?: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/api/mock/open-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(
      await readApiError(res, 'POST /api/mock/open-events', 'mock開封イベントの記録に失敗しました')
    );
  }
}
