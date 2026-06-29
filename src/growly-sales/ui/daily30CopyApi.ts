import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { Daily30Dashboard } from '../candidates/buildDaily30Dashboard.js';
import { readApiError } from './apiError.js';

const API_BASE = '';

export const GENERATE_DAILY_30_COPY_GATE_LABEL = 'GENERATE_DAILY_30_COPY';

export interface Daily30LeadCandidatesResponse {
  reviewCandidates: ExternalLeadCandidate[];
  approvalPending: ExternalLeadCandidate[];
  approvedForLead: ExternalLeadCandidate[];
  generatedAt: string;
  note: string;
}

export interface Daily30GenerateCopyResponse {
  stats: {
    processed: number;
    generated: number;
    passed: number;
    needsReview: number;
    excluded: number;
    skipped: number;
  };
  dashboard: Daily30Dashboard;
  generatedAt: string;
  message: string;
}

export async function fetchDaily30LeadCandidates(): Promise<Daily30LeadCandidatesResponse> {
  const res = await fetch(`${API_BASE}/api/daily30-lead-candidates`);
  if (!res.ok) {
    throw new Error(
      await readApiError(res, 'GET /api/daily30-lead-candidates', 'Lead化候補の取得に失敗しました')
    );
  }
  return (await res.json()) as Daily30LeadCandidatesResponse;
}

export async function approveExternalCandidateForLead(
  externalCandidateId: string
): Promise<ExternalLeadCandidate> {
  const res = await fetch(
    `${API_BASE}/api/external-candidates/${encodeURIComponent(externalCandidateId)}/approve-for-lead`,
    { method: 'POST' }
  );
  if (!res.ok) {
    throw new Error(
      await readApiError(res, 'POST approve-for-lead', 'Lead化承認に失敗しました')
    );
  }
  const data = (await res.json()) as { candidate: ExternalLeadCandidate };
  return data.candidate;
}

export async function runDaily30GenerateCopy(
  confirmToken: string
): Promise<Daily30GenerateCopyResponse> {
  const res = await fetch(`${API_BASE}/api/daily30-generate-copy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmToken }),
  });
  if (!res.ok) {
    throw new Error(
      await readApiError(res, 'POST /api/daily30-generate-copy', '営業文生成に失敗しました')
    );
  }
  return (await res.json()) as Daily30GenerateCopyResponse;
}
