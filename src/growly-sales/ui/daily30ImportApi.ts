import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { Daily30DraftPipelineProgress } from '../candidates/buildDaily30DraftPipelineProgress.js';
import { readApiError } from './apiError.js';

const API_BASE = '';

export const IMPORT_DAILY_30_DRAFT_CANDIDATES_GATE_LABEL = 'IMPORT_DAILY_30_DRAFT_CANDIDATES';

export interface Daily30ReadyForDraftItem {
  candidate: ExternalLeadCandidate;
  importBlockReason: string | null;
  qualityCheckPassed: boolean;
}

export interface Daily30ReadyForDraftResponse {
  items: Daily30ReadyForDraftItem[];
  draftPipeline: Daily30DraftPipelineProgress;
  generatedAt: string;
  note: string;
}

export interface Daily30ImportDraftResponse {
  imported: Array<{ lead: { id: string; companyName: string }; candidate: ExternalLeadCandidate }>;
  skipped: Array<{ candidate: ExternalLeadCandidate; reason: string }>;
  draftPipeline: Daily30DraftPipelineProgress;
  generatedAt: string;
  message: string;
}

export async function fetchDaily30ReadyForDraft(): Promise<Daily30ReadyForDraftResponse> {
  const res = await fetch(`${API_BASE}/api/daily30-ready-for-draft`);
  if (!res.ok) {
    throw new Error(
      await readApiError(res, 'GET /api/daily30-ready-for-draft', 'ready_for_draft 候補の取得に失敗しました')
    );
  }
  return (await res.json()) as Daily30ReadyForDraftResponse;
}

export async function importDaily30DraftCandidate(
  externalCandidateId: string
): Promise<{ lead: { id: string; companyName: string }; candidate: ExternalLeadCandidate }> {
  const res = await fetch(
    `${API_BASE}/api/external-candidates/${encodeURIComponent(externalCandidateId)}/import-as-draft-candidate`,
    { method: 'POST' }
  );
  if (!res.ok) {
    throw new Error(
      await readApiError(res, 'POST import-as-draft-candidate', '下書き候補への取り込みに失敗しました')
    );
  }
  return (await res.json()) as { lead: { id: string; companyName: string }; candidate: ExternalLeadCandidate };
}

export async function importDaily30DraftCandidatesBulk(
  confirmToken: string
): Promise<Daily30ImportDraftResponse> {
  const res = await fetch(`${API_BASE}/api/daily30-import-draft-candidates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmToken }),
  });
  if (!res.ok) {
    throw new Error(
      await readApiError(res, 'POST /api/daily30-import-draft-candidates', '一括取り込みに失敗しました')
    );
  }
  return (await res.json()) as Daily30ImportDraftResponse;
}
