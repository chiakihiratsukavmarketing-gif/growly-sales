import type {
  Daily30DiscoverySource,
  Daily30DiscoverySourceSite,
  Daily30IndustryCategory,
} from '../candidates/daily30CollectionProfile.js';
import type { ManualExternalReferenceCandidateSummary } from '../candidates/createManualExternalReferenceCandidate.js';
import { readApiError } from './apiError.js';

export interface ManualExternalReferenceRequest {
  discoverySourceUrl: string;
  discoverySource: Daily30DiscoverySource;
  discoverySourceSite?: Daily30DiscoverySourceSite | null;
  companyName: string;
  officialSiteUrl?: string | null;
  prefecture?: string | null;
  industryCategory?: Daily30IndustryCategory;
  manualNote?: string | null;
  shouldEnrichOfficialSiteEmail?: boolean;
}

export interface ManualExternalReferenceResponse {
  ok: boolean;
  candidate: ManualExternalReferenceCandidateSummary;
  warnings: string[];
  duplicateReason?: string | null;
  generatedAt?: string;
  note?: string;
}

export async function submitManualExternalReference(
  payload: ManualExternalReferenceRequest
): Promise<ManualExternalReferenceResponse> {
  const res = await fetch('/api/daily30-external-reference/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(
      await readApiError(
        res,
        'POST /api/daily30-external-reference/manual',
        '手動外部参照候補の保存に失敗しました'
      )
    );
  }
  return (await res.json()) as ManualExternalReferenceResponse;
}

export const MANUAL_EXTERNAL_REFERENCE_WARNING_LABELS: Record<string, string> = {
  external_reference_url_is_discovery_only:
    '掲載元URLは発見元として記録のみ（メール取得には使用しません）',
  email_source_must_be_official_site: 'メール取得元は公式サイト上の代表メールのみ許可されます',
  duplicate_candidate: '既存候補と重複の可能性があります',
  duplicate_lead: '既存Leadと重複の可能性があります',
  tokyo_excluded: '東京都は対象外です',
  discovery_url_same_as_official_skipped:
    '掲載元URLと公式サイトURLが同一のため、メール確認はスキップしました（候補は保存されます）',
  official_site_enrich_failed:
    '公式サイトのメール確認に失敗しました（候補は保存されます）',
};
