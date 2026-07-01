import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { Daily30Dashboard } from '../candidates/buildDaily30Dashboard.js';
import type { Daily30DraftPipelineProgress } from '../candidates/buildDaily30DraftPipelineProgress.js';
import type { Daily30OperationsSummary } from '../candidates/buildDaily30OperationsSummary.js';
import type { Daily30CloudDashboardPayload } from '../candidates/buildDaily30CloudDashboard.js';
import type { Daily30LeadApprovalBlockHint } from '../candidates/getDaily30LeadApprovalBlockReason.js';
import { readApiError } from './apiError.js';

const API_BASE = '';

export const FETCH_DAILY_30_GATE_LABEL = 'FETCH_DAILY_30';

export interface Daily30DashboardResponse extends Daily30CloudDashboardPayload {
  dashboard: Daily30Dashboard;
  draftPipeline?: Daily30DraftPipelineProgress;
  operations?: Daily30OperationsSummary;
  areaExpansion: string;
  plan: { target: number; areas: { prefecture: string; regionGroup: string }[]; note: string };
  approvalBlockHints?: Record<string, Daily30LeadApprovalBlockHint>;
  humanExcludedCount?: number;
  humanExcludedCandidates?: ExternalLeadCandidate[];
  generatedAt: string;
  note: string;
}

export interface Daily30FetchResponse {
  stats: {
    batchId: string;
    acceptedNew: number;
    emailFound: number;
    emailNotFound: number;
    areasUsed: string[];
  };
  dashboard: Daily30Dashboard;
  generatedAt: string;
  message: string;
}

export interface GrowlyStorageStatusResponse {
  storageBackend: 'local' | 'gcs';
  gcsBucket: string | null;
  gcsPrefix: string;
  schedulerConfigured: boolean;
  cloudRunUrlConfigured: boolean;
  pilotModeLabel: string;
  storageLabel: string;
  generatedAt: string;
}

export async function fetchGrowlyStorageStatus(): Promise<GrowlyStorageStatusResponse> {
  const res = await fetch(`${API_BASE}/api/storage-status`);
  if (!res.ok) {
    throw new Error(await readApiError(res, 'GET /api/storage-status', 'ストレージ設定の取得に失敗しました'));
  }
  return (await res.json()) as GrowlyStorageStatusResponse;
}

export async function fetchDaily30Dashboard(): Promise<Daily30DashboardResponse> {
  const res = await fetch(`${API_BASE}/api/daily30-dashboard`);
  if (!res.ok) {
    throw new Error(await readApiError(res, 'GET /api/daily30-dashboard', 'Daily 30 ダッシュボードの取得に失敗しました'));
  }
  return (await res.json()) as Daily30DashboardResponse;
}

export async function runDaily30Fetch(confirmToken: string): Promise<Daily30FetchResponse> {
  const res = await fetch(`${API_BASE}/api/daily30-fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmToken }),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'POST /api/daily30-fetch', 'Daily 30 収集に失敗しました'));
  }
  return (await res.json()) as Daily30FetchResponse;
}

export type { ExternalLeadCandidate };
