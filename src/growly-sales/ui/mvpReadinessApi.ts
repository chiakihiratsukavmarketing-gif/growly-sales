import { readApiError } from './apiError.js';
import type { MvpReadinessResult } from '../mvp/checkLocalMvpReadiness.js';

export interface MvpReadinessResponse extends MvpReadinessResult {
  generatedAt: string;
  leadsPath?: string;
}

const API_BASE = '';

export async function fetchMvpReadiness(): Promise<MvpReadinessResponse> {
  const res = await fetch(`${API_BASE}/api/mvp-readiness`);
  if (!res.ok) {
    throw new Error(await readApiError(res, 'GET /api/mvp-readiness', 'MVPチェックの取得に失敗しました'));
  }
  return (await res.json()) as MvpReadinessResponse;
}

