import { readApiError } from './apiError.js';

export interface ExternalReferenceApprovalSummaryItem {
  configId: string;
  displayName: string;
  discoverySource: string;
  discoverySourceSite: string | null;
  enabled: boolean;
  humanApproved: boolean;
  approvalStatus: string;
  mode: string;
  canRun: boolean;
  canRunDryRun: boolean;
  reason: string;
  maxRequestsPerRun: number;
  maxCandidatesPerRun: number;
  minIntervalMs: number;
  robotsChecked: boolean;
  termsChecked: boolean;
  requiresLogin: boolean;
  hasCaptchaRisk: boolean;
  notes: string;
}

export interface ExternalReferenceApprovalSummaryResponse {
  ok: boolean;
  items: ExternalReferenceApprovalSummaryItem[];
  generatedAt: string;
  note: string;
}

export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  not_requested: '承認未申請',
  approved_for_manual_url: '手動URLのみ',
  approved_for_dry_run: 'dry-run まで承認',
  approved_for_low_frequency: '低頻度実行承認',
  blocked: 'ブロック',
};

export const EXECUTION_MODE_LABELS: Record<string, string> = {
  manual_only: '手動のみ',
  dry_run_only: 'dry-run のみ',
  low_frequency_allowed: '低頻度可',
  blocked: 'ブロック',
};

export async function fetchExternalReferenceApprovalStatus(): Promise<ExternalReferenceApprovalSummaryResponse> {
  const res = await fetch('/api/daily30-external-reference/approval-status');
  if (!res.ok) {
    throw new Error(
      await readApiError(
        res,
        'GET /api/daily30-external-reference/approval-status',
        '外部参照承認状態の取得に失敗しました'
      )
    );
  }
  return (await res.json()) as ExternalReferenceApprovalSummaryResponse;
}
