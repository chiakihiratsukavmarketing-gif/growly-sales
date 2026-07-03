import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import {
  hostMatchesOrIsSubdomain,
  hostsMatchUrl,
  isKnownJobSiteHost,
  isKnownRakutenHost,
  isUrlOnKnownExternalReferenceHost,
  normalizeHostFromUrl,
} from '../adapters/discovery/externalReferenceHosts.js';
import { isReferenceOnlyDiscoverySource } from '../adapters/discovery/index.js';
import { isDaily30PrefectureExcluded } from './daily30PrefectureRegistry.js';
import type { Daily30SourceComplianceStatus } from './daily30CollectionProfile.js';
import {
  isPersonalEmailAddress,
  isPlaceholderEmailAddress,
} from './resolveEmailSourceDisplay.js';

export interface SourceComplianceEvaluation {
  status: Daily30SourceComplianceStatus;
  note: string | null;
}

export const SOURCE_COMPLIANCE_LABELS: Record<Daily30SourceComplianceStatus, string> = {
  official_site_verified: '公式サイトメール確認済み',
  official_site_not_found: '公式サイト未確認',
  email_not_found: 'メール未確認',
  blocked_by_policy: 'ポリシーによりブロック',
  needs_human_review: '要人間確認',
};

export function getOfficialSiteUrl(
  candidate: Pick<ExternalLeadCandidate, 'officialSiteUrl' | 'websiteUrl'>
): string | null {
  return candidate.officialSiteUrl?.trim() || candidate.websiteUrl?.trim() || null;
}

export function getOfficialSiteHost(
  candidate: Pick<ExternalLeadCandidate, 'officialSiteUrl' | 'websiteUrl'>
): string | null {
  return normalizeHostFromUrl(getOfficialSiteUrl(candidate));
}

export function getDiscoverySourceUrl(
  candidate: Pick<ExternalLeadCandidate, 'discoverySourceUrl' | 'sourceUrl'>
): string | null {
  return candidate.discoverySourceUrl?.trim() || null;
}

export function getPrimaryEmail(
  candidate: Pick<ExternalLeadCandidate, 'targetEmail' | 'emailCandidates'>
): string {
  return (
    candidate.targetEmail?.trim() ||
    candidate.emailCandidates.find((e) => e.trim())?.trim() ||
    ''
  );
}

export function getPrimaryEmailSourceUrl(
  candidate: Pick<ExternalLeadCandidate, 'emailCandidateSourceUrl' | 'emailCandidateSourceUrls'>
): string | null {
  return (
    candidate.emailCandidateSourceUrl?.trim() ||
    candidate.emailCandidateSourceUrls.find((u) => u.trim())?.trim() ||
    null
  );
}

/** メール確認元 URL が公式サイト配下か（サブドメイン含む） */
export function isUrlOnOfficialSiteDomain(
  url: string | null | undefined,
  candidate: Pick<ExternalLeadCandidate, 'officialSiteUrl' | 'websiteUrl'>
): boolean {
  const official = getOfficialSiteUrl(candidate);
  if (!url?.trim() || !official) return false;
  if (hostsMatchUrl(url, official)) return true;
  const urlHost = normalizeHostFromUrl(url);
  const officialHost = normalizeHostFromUrl(official);
  if (!urlHost || !officialHost) return false;
  return (
    hostMatchesOrIsSubdomain(urlHost, officialHost) ||
    hostMatchesOrIsSubdomain(officialHost, urlHost)
  );
}

/** URL が discoverySourceUrl と同一ホストか */
export function isUrlOnDiscoverySourceDomain(
  url: string | null | undefined,
  candidate: Pick<ExternalLeadCandidate, 'discoverySourceUrl' | 'sourceUrl'>
): boolean {
  const discoveryUrl = getDiscoverySourceUrl(candidate);
  if (!url?.trim() || !discoveryUrl) return false;
  return hostsMatchUrl(url, discoveryUrl);
}

/** 公式サイト URL がなく discovery URL のみ */
export function hasDiscoveryUrlWithoutOfficialSite(
  candidate: Pick<
    ExternalLeadCandidate,
    'discoverySourceUrl' | 'sourceUrl' | 'officialSiteUrl' | 'websiteUrl' | 'discoverySource'
  >
): boolean {
  const discoveryUrl = getDiscoverySourceUrl(candidate);
  if (!discoveryUrl) return false;
  if (getOfficialSiteUrl(candidate)) return false;
  return isReferenceOnlyDiscoverySource(candidate.discoverySource ?? null);
}

/** メール取得元が外部掲載サイト（discovery ドメイン / 既知求人・楽天等） */
export function isEmailSourceFromExternalListingSite(
  candidate: Pick<
    ExternalLeadCandidate,
    | 'emailCandidateSourceUrl'
    | 'emailCandidateSourceUrls'
    | 'discoverySourceUrl'
    | 'sourceUrl'
    | 'officialSiteUrl'
    | 'websiteUrl'
  >
): boolean {
  const emailSourceUrl = getPrimaryEmailSourceUrl(candidate);
  if (!emailSourceUrl) return false;

  if (isUrlOnDiscoverySourceDomain(emailSourceUrl, candidate)) return true;
  if (isUrlOnKnownExternalReferenceHost(emailSourceUrl)) return true;

  const host = normalizeHostFromUrl(emailSourceUrl);
  if (host && isKnownJobSiteHost(host)) return true;
  if (host && isKnownRakutenHost(host)) return true;

  return false;
}

/** 公式サイトドメイン内の URL のみ残す */
export function filterUrlsToOfficialSiteDomain(
  urls: string[],
  candidate: Pick<ExternalLeadCandidate, 'officialSiteUrl' | 'websiteUrl'>
): string[] {
  const official = getOfficialSiteUrl(candidate);
  if (!official) return [];
  return [...new Set(urls.filter((u) => isUrlOnOfficialSiteDomain(u, candidate)))];
}

export function classifyExternalEmailBlockReason(
  candidate: Pick<
    ExternalLeadCandidate,
    | 'emailCandidateSourceUrl'
    | 'emailCandidateSourceUrls'
    | 'discoverySourceUrl'
    | 'sourceUrl'
    | 'officialSiteUrl'
    | 'websiteUrl'
  >
): string | null {
  const emailSourceUrl = getPrimaryEmailSourceUrl(candidate);
  if (!emailSourceUrl) return null;
  const host = normalizeHostFromUrl(emailSourceUrl);

  if (isUrlOnDiscoverySourceDomain(emailSourceUrl, candidate)) {
    return '外部掲載サイト（発見元）上のメール';
  }
  if (host && isKnownJobSiteHost(host)) {
    return '求人サイト上のメール';
  }
  if (host && isKnownRakutenHost(host)) {
    return '楽天市場上のメール';
  }
  if (isUrlOnKnownExternalReferenceHost(emailSourceUrl)) {
    return '外部掲載サイト上のメール';
  }
  return null;
}

/** 候補の sourceComplianceStatus を判定 */
export function evaluateSourceCompliance(
  candidate: Pick<
    ExternalLeadCandidate,
    | 'officialSiteUrl'
    | 'websiteUrl'
    | 'targetEmail'
    | 'emailCandidates'
    | 'emailCandidateSourceUrl'
    | 'emailCandidateSourceUrls'
    | 'discoverySourceUrl'
    | 'sourceUrl'
    | 'discoverySource'
    | 'prefecture'
  >
): SourceComplianceEvaluation {
  const email = getPrimaryEmail(candidate);
  const emailSourceUrl = getPrimaryEmailSourceUrl(candidate);
  const officialSite = getOfficialSiteUrl(candidate);

  if (candidate.prefecture?.trim() && isDaily30PrefectureExcluded(candidate.prefecture.trim())) {
    return {
      status: 'blocked_by_policy',
      note: '東京都は対象外',
    };
  }

  if (email && isPlaceholderEmailAddress(email)) {
    return {
      status: 'blocked_by_policy',
      note: 'プレースホルダメール',
    };
  }
  if (email && isPersonalEmailAddress(email)) {
    return {
      status: 'blocked_by_policy',
      note: '個人メール',
    };
  }

  const externalBlock = classifyExternalEmailBlockReason(candidate);
  if (externalBlock) {
    return {
      status: 'blocked_by_policy',
      note: externalBlock,
    };
  }

  if (hasDiscoveryUrlWithoutOfficialSite(candidate)) {
    return {
      status: 'official_site_not_found',
      note: '発見元 URL のみ（公式サイト未確認）',
    };
  }

  if (!officialSite) {
    return {
      status: 'official_site_not_found',
      note: null,
    };
  }

  if (email && emailSourceUrl && isUrlOnOfficialSiteDomain(emailSourceUrl, candidate)) {
    return {
      status: 'official_site_verified',
      note: null,
    };
  }

  if (email && !emailSourceUrl) {
    return {
      status: 'needs_human_review',
      note: 'メールあり・確認元 URL 未記録',
    };
  }

  if (email && emailSourceUrl && !isUrlOnOfficialSiteDomain(emailSourceUrl, candidate)) {
    return {
      status: 'needs_human_review',
      note: 'メール取得元が公式サイト配下ではない',
    };
  }

  if (!email) {
    return {
      status: 'email_not_found',
      note: null,
    };
  }

  return {
    status: 'email_not_found',
    note: null,
  };
}

export function applySourceComplianceFields<
  T extends Pick<ExternalLeadCandidate, 'sourceComplianceStatus' | 'sourceComplianceNote'>,
>(candidate: T): T {
  const evaluation = evaluateSourceCompliance(candidate as ExternalLeadCandidate);
  return {
    ...candidate,
    sourceComplianceStatus: evaluation.status,
    sourceComplianceNote: evaluation.note,
  };
}

/** Lead化承認ブロック理由（null = コンプライアンス上は問題なし） */
export function getLeadApprovalComplianceBlockReason(
  candidate: Pick<
    ExternalLeadCandidate,
    | 'officialSiteUrl'
    | 'websiteUrl'
    | 'targetEmail'
    | 'emailCandidates'
    | 'emailCandidateSourceUrl'
    | 'emailCandidateSourceUrls'
    | 'discoverySourceUrl'
    | 'sourceUrl'
    | 'discoverySource'
    | 'sourceComplianceStatus'
    | 'sourceComplianceNote'
  >
): string | null {
  const evaluation = evaluateSourceCompliance(candidate);
  const status = evaluation.status;

  if (status === 'blocked_by_policy') {
    const detail = evaluation.note ?? candidate.sourceComplianceNote;
    return detail
      ? `ポリシーによりLead化不可（${detail}）`
      : 'ポリシーによりLead化不可（外部掲載サイト由来メール等）';
  }

  if (hasDiscoveryUrlWithoutOfficialSite(candidate)) {
    return '公式サイト未確認（発見元 URL のみ）のためLead化不可';
  }

  if (status === 'needs_human_review') {
    return evaluation.note
      ? `要人間確認（${evaluation.note}）`
      : '要人間確認（公式サイトメール未確認）';
  }

  if (status === 'official_site_not_found') {
    return '公式サイト未確認のためLead化不可';
  }

  const email = getPrimaryEmail(candidate);
  const emailSourceUrl = getPrimaryEmailSourceUrl(candidate);

  if (email && emailSourceUrl && !isUrlOnOfficialSiteDomain(emailSourceUrl, candidate)) {
    return 'メール取得元が公式サイト配下ではありません';
  }

  if (email && !emailSourceUrl && getOfficialSiteUrl(candidate)) {
    return '公式サイトメールの確認元 URL がありません';
  }

  if (status !== 'official_site_verified' && email) {
    return '公式サイト上の代表メールが確認できていません';
  }

  return null;
}

/** enrich 後: 公式サイト外 URL / 外部掲載サイト由来メールを除去 */
export function sanitizeCandidateEmailSources(
  candidate: ExternalLeadCandidate
): ExternalLeadCandidate {
  const official = getOfficialSiteUrl(candidate);
  const filteredUrls = filterUrlsToOfficialSiteDomain(
    candidate.emailCandidateSourceUrls ?? [],
    candidate
  );

  let emails = [...(candidate.emailCandidates ?? [])];
  const externalBlock = classifyExternalEmailBlockReason(candidate);
  if (externalBlock) {
    emails = [];
  } else if (official) {
    emails = emails.filter((email) => {
      if (isPlaceholderEmailAddress(email) || isPersonalEmailAddress(email)) return false;
      return true;
    });
  }

  const primarySource =
    candidate.emailCandidateSourceUrl &&
    isUrlOnOfficialSiteDomain(candidate.emailCandidateSourceUrl, candidate) &&
    !isEmailSourceFromExternalListingSite({
      ...candidate,
      emailCandidateSourceUrl: candidate.emailCandidateSourceUrl,
    })
      ? candidate.emailCandidateSourceUrl
      : filteredUrls[0] ?? null;

  const targetEmail =
    emails[0] ??
    (candidate.targetEmail &&
    !isPlaceholderEmailAddress(candidate.targetEmail) &&
    !isPersonalEmailAddress(candidate.targetEmail) &&
    !externalBlock
      ? candidate.targetEmail
      : null);

  const sanitized: ExternalLeadCandidate = {
    ...candidate,
    emailCandidates: emails,
    emailCandidateSourceUrls: filteredUrls,
    emailCandidateSourceUrl: primarySource,
    targetEmail: targetEmail?.trim() || null,
    pipelineStatus:
      candidate.pipelineStatus === 'duplicate'
        ? 'duplicate'
        : emails.length > 0
          ? 'email_found'
          : 'email_not_found',
  };

  return applySourceComplianceFields(sanitized);
}

/** ログイン必須 / CAPTCHA / 規約 NG 等の将来フラグ用（Phase 40.6 スタブ） */
export type SourceComplianceAccessBlockReason =
  | 'login_required'
  | 'captcha_required'
  | 'terms_of_service_violation';

export function mapAccessBlockToComplianceStatus(
  reason: SourceComplianceAccessBlockReason
): SourceComplianceEvaluation {
  switch (reason) {
    case 'login_required':
      return { status: 'blocked_by_policy', note: 'ログイン必須ページ' };
    case 'captcha_required':
      return { status: 'blocked_by_policy', note: 'CAPTCHA ページ' };
    case 'terms_of_service_violation':
      return { status: 'blocked_by_policy', note: '規約上の自動収集不可' };
    default:
      return { status: 'blocked_by_policy', note: 'アクセスポリシー違反' };
  }
}
