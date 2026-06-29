import { readApiError } from './apiError.js';

export interface DraftStats {
  totalLeads: number;
  approvedCount: number;
  draftCandidateCount: number;
  notSentCount: number;
  doNotContactCount: number;
  excludedCount?: number;
  generatedAt?: string;
  note: string;
  leadsPath?: string;
}

const API_BASE = '';

export async function fetchDraftStats(): Promise<DraftStats> {
  const res = await fetch(`${API_BASE}/api/draft-stats`);
  if (!res.ok) {
    throw new Error(await readApiError(res, 'GET /api/draft-stats', '下書き統計の取得に失敗しました'));
  }
  return (await res.json()) as DraftStats;
}
