import { readApiError } from './apiError.js';
import type { OperationSummary } from '../analytics/buildOperationSummary.js';

export interface OperationSummaryResponse {
  summary: OperationSummary;
  generatedAt: string;
  leadsPath?: string;
  note?: string;
}

const API_BASE = '';

export async function fetchOperationSummary(): Promise<OperationSummaryResponse> {
  const res = await fetch(`${API_BASE}/api/operation-summary`);
  if (!res.ok) {
    throw new Error(await readApiError(res, 'GET /api/operation-summary', '運用サマリーの取得に失敗しました'));
  }
  return (await res.json()) as OperationSummaryResponse;
}

