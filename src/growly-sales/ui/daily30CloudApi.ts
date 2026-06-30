import type { Daily30CloudStatus } from '../candidates/runDaily30CloudAutoFetch.js';
import { readApiError } from './apiError.js';

const API_BASE = '';

export interface Daily30CloudStatusResponse extends Daily30CloudStatus {
  generatedAt: string;
  note: string;
}

export async function fetchDaily30CloudStatus(): Promise<Daily30CloudStatusResponse> {
  const res = await fetch(`${API_BASE}/api/cloud/daily30/status`);
  if (!res.ok) {
    throw new Error(
      await readApiError(res, 'GET /api/cloud/daily30/status', 'Cloud 状態の取得に失敗しました')
    );
  }
  return (await res.json()) as Daily30CloudStatusResponse;
}
