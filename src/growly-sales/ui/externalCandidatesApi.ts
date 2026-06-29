import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { ContactPathAnalytics } from '../analytics/buildContactPathAnalytics.js';

export interface ExternalCandidatesResponse {
  candidates: ExternalLeadCandidate[];
  generatedAt: string;
  note: string;
}

export async function fetchExternalCandidates(): Promise<ExternalCandidatesResponse> {
  const res = await fetch('/api/external-candidates');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `外部候補の取得に失敗 (${res.status})`);
  }
  return (await res.json()) as ExternalCandidatesResponse;
}

export async function approveExternalCandidate(externalCandidateId: string): Promise<ExternalLeadCandidate> {
  const res = await fetch(`/api/external-candidates/${encodeURIComponent(externalCandidateId)}/approve-for-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `取り込み承認に失敗 (${res.status})`);
  }
  const data = (await res.json()) as { candidate: ExternalLeadCandidate };
  return data.candidate;
}

export interface ContactPathAnalyticsResponse {
  analytics: ContactPathAnalytics;
  generatedAt: string;
  leadsPath: string;
}

export async function fetchContactPathAnalytics(): Promise<ContactPathAnalyticsResponse> {
  const res = await fetch('/api/contact-path-analytics');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `連絡導線分析の取得に失敗 (${res.status})`);
  }
  return (await res.json()) as ContactPathAnalyticsResponse;
}
