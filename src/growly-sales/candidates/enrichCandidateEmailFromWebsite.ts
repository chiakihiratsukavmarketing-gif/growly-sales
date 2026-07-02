import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { extractWebsiteContacts } from '../collectors/extractWebsiteContacts.js';
import { DAILY_30_DOMAIN_DELAY_MS } from './daily30CandidateStatus.js';
import { normalizeWebsiteUrl } from '../adapters/normalizeExternalLeadCandidate.js';
import {
  filterUrlsToOfficialSiteDomain,
  getDiscoverySourceUrl,
  sanitizeCandidateEmailSources,
} from './sourceCompliance.js';

const lastDomainAccess = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

async function waitForDomain(hostname: string): Promise<void> {
  const last = lastDomainAccess.get(hostname) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < DAILY_30_DOMAIN_DELAY_MS) {
    await sleep(DAILY_30_DOMAIN_DELAY_MS - elapsed);
  }
  lastDomainAccess.set(hostname, Date.now());
}

/**
 * 公開サイトからメール候補を確認（トップ/会社概要/お問い合わせ等は extractWebsiteContacts が担当）。
 * Phase 40.6: メール取得は公式サイト URL ドメイン内のみ。discoverySourceUrl ドメインは採用しない。
 */
export async function enrichCandidateEmailFromWebsite(
  candidate: ExternalLeadCandidate
): Promise<ExternalLeadCandidate> {
  const websiteUrl = normalizeWebsiteUrl(candidate.websiteUrl ?? candidate.officialSiteUrl);
  if (!websiteUrl) {
    return sanitizeCandidateEmailSources({
      ...candidate,
      pipelineStatus: candidate.pipelineStatus === 'duplicate' ? 'duplicate' : 'email_not_found',
      updatedAt: new Date().toISOString(),
      notes: [candidate.notes, '公式サイトURLなしのためメール確認不可'].filter(Boolean).join(' / '),
    });
  }

  const discoveryUrl = getDiscoverySourceUrl(candidate);
  if (discoveryUrl && discoveryUrl === websiteUrl) {
    return sanitizeCandidateEmailSources({
      ...candidate,
      pipelineStatus: candidate.pipelineStatus === 'duplicate' ? 'duplicate' : 'email_not_found',
      updatedAt: new Date().toISOString(),
      notes: [candidate.notes, '発見元 URL を公式サイトとしてメール確認しません'].filter(Boolean).join(' / '),
    });
  }

  const host = hostnameFromUrl(websiteUrl);
  if (host) await waitForDomain(host);

  try {
    const extraction = await extractWebsiteContacts(websiteUrl);
    const emails = extraction.emailCandidates ?? [];
    const hasCorporateEmail =
      emails.length > 0 && extraction.emailContactType !== 'personal_rejected';

    const pipelineStatus =
      candidate.pipelineStatus === 'duplicate'
        ? 'duplicate'
        : hasCorporateEmail
          ? 'email_found'
          : 'email_not_found';

    const sourceUrls = filterUrlsToOfficialSiteDomain(
      [
        ...(candidate.emailCandidateSourceUrls ?? []),
        ...(extraction.emailCandidateSourceUrls ?? []),
        ...(extraction.sourceUrls ?? []),
      ],
      { officialSiteUrl: candidate.officialSiteUrl ?? extraction.websiteUrl ?? websiteUrl, websiteUrl }
    );

    const merged = sanitizeCandidateEmailSources({
      ...candidate,
      websiteUrl: extraction.websiteUrl || websiteUrl,
      officialSiteUrl: candidate.officialSiteUrl ?? extraction.websiteUrl ?? websiteUrl,
      emailCandidates: emails,
      emailCandidateSourceUrls: sourceUrls,
      contactFormUrl: extraction.contactFormUrl ?? candidate.contactFormUrl,
      pipelineStatus,
      emailVerifiedAt: new Date().toISOString(),
      confidenceScore: hasCorporateEmail
        ? Math.min(1, Number((candidate.confidenceScore + 0.15).toFixed(2)))
        : candidate.confidenceScore,
      updatedAt: new Date().toISOString(),
      notes: [
        candidate.notes,
        extraction.collectionStatus === 'failed' ? `メール確認失敗: ${extraction.error ?? ''}` : '',
        sourceUrls.length === 0 && (extraction.emailCandidateSourceUrls?.length ?? 0) > 0
          ? '外部掲載サイト由来 URL はメール取得元から除外'
          : '',
      ]
        .filter(Boolean)
        .join(' / '),
    });

    return merged;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return sanitizeCandidateEmailSources({
      ...candidate,
      pipelineStatus:
        candidate.pipelineStatus === 'duplicate' ? 'duplicate' : 'email_not_found',
      updatedAt: new Date().toISOString(),
      notes: [candidate.notes, `メール確認エラー: ${message}`].filter(Boolean).join(' / '),
    });
  }
}
