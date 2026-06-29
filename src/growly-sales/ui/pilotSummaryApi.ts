import { readApiError } from './apiError.js';
import type { PilotSummary } from '../analytics/buildPilotSummary.js';

export interface PilotSummaryResponse {
  summary: PilotSummary;
  generatedAt: string;
  leadsPath?: string;
}

const API_BASE = '';

export async function fetchPilotSummary(): Promise<PilotSummaryResponse> {
  const res = await fetch(`${API_BASE}/api/pilot-summary`);
  if (!res.ok) {
    throw new Error(await readApiError(res, 'GET /api/pilot-summary', 'パイロットサマリーの取得に失敗しました'));
  }
  return (await res.json()) as PilotSummaryResponse;
}
