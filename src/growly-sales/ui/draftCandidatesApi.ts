import type { UiDraftCandidate } from '../drafts/buildUiDraftCandidates.js';
import { readApiError } from './apiError.js';

export type { UiDraftCandidate };

export interface DraftCandidatesResponse {
  candidates: UiDraftCandidate[];
  excludedCount: number;
  generatedAt: string;
  leadsPath?: string;
}

export interface ExportDraftsResponse {
  candidates: UiDraftCandidate[];
  excludedCount: number;
  generatedAt: string;
  outputFiles: string[];
  message: string;
  leadsPath?: string;
}

const API_BASE = '';

export async function fetchDraftCandidates(): Promise<DraftCandidatesResponse> {
  const res = await fetch(`${API_BASE}/api/draft-candidates`);
  if (!res.ok) {
    throw new Error(await readApiError(res, 'GET /api/draft-candidates', '下書き候補の取得に失敗しました'));
  }
  return (await res.json()) as DraftCandidatesResponse;
}

export async function runExportDrafts(): Promise<ExportDraftsResponse> {
  const res = await fetch(`${API_BASE}/api/export-drafts`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'POST /api/export-drafts', '下書きファイルの再生成に失敗しました'));
  }
  return (await res.json()) as ExportDraftsResponse;
}
