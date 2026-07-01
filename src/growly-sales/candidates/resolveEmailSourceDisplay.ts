import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { classifyEmailCandidate } from '../collectors/classifyEmailCandidate.js';
import { isRejectedEmail, isFreeEmailDomain, looksLikePersonalEmail } from '../safety/contactPolicy.js';
import type { Lead } from '../types/lead.js';

export type EmailSourcePageType =
  | 'contact'
  | 'official_home'
  | 'company_profile'
  | 'privacy'
  | 'form'
  | 'recruit'
  | 'other'
  | 'unknown';

export interface EmailSourceDisplayInfo {
  email: string;
  emailSourceUrl: string | null;
  /** 表示用フルラベル（例: 公式サイト / お問い合わせページ） */
  emailSourceLabel: string;
  /** カード内短縮ラベル（例: 公式サイト / お問い合わせ） */
  emailSourceCompactLabel: string;
  sourcePageType: EmailSourcePageType;
  officialSiteUrl: string | null;
  isOfficialSiteOrigin: boolean;
  /** emailCandidateSourceUrls 等の明示記録があるか */
  emailSourceConfirmed: boolean;
  isPlaceholderEmail: boolean;
  isPersonalEmail: boolean;
  checkedUrls: string[];
  batchId: string | null;
  source: string | null;
}

const CONTACT_PATH_HINTS = [
  '/contact',
  '/toiawase',
  '/inquiry',
  '/form',
  '/request',
  '/consultation',
  'お問い合わせ',
  '問い合わせ',
] as const;

const COMPANY_PATH_HINTS = ['/company', '/about', '/profile', '/corporate', '会社概要', '企業情報'] as const;

function normalizeUrl(url: string): string {
  return url.trim().replace(/\s+/g, '');
}

function normalizeHost(url: string): string | null {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function hostsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ha = normalizeHost(a);
  const hb = normalizeHost(b);
  return Boolean(ha && hb && ha === hb);
}

function isHomepagePath(pathname: string): boolean {
  const p = pathname.replace(/\/$/, '') || '/';
  return p === '/' || p === '';
}

function inferPageType(url: string): EmailSourcePageType {
  const normalized = normalizeUrl(url);
  let pathname = '';
  try {
    pathname = new URL(normalized).pathname.toLowerCase();
  } catch {
    return 'unknown';
  }

  if (CONTACT_PATH_HINTS.some((h) => pathname.includes(h.toLowerCase()) || normalized.includes(h))) {
    return 'contact';
  }
  if (pathname.includes('privacy') || pathname.includes('policy')) return 'privacy';
  if (COMPANY_PATH_HINTS.some((h) => pathname.includes(h.toLowerCase()) || normalized.includes(h))) {
    return 'company_profile';
  }
  if (pathname.includes('recruit') || pathname.includes('job') || pathname.includes('saiyou')) {
    return 'recruit';
  }
  if (isHomepagePath(pathname)) return 'official_home';
  return 'other';
}

function pageTypeJapanese(pageType: EmailSourcePageType, compact: boolean): string {
  switch (pageType) {
    case 'contact':
    case 'form':
      return compact ? 'お問い合わせ' : 'お問い合わせページ';
    case 'company_profile':
      return compact ? '会社概要' : '会社概要ページ';
    case 'privacy':
      return compact ? 'プライバシーポリシー' : 'プライバシーポリシー';
    case 'official_home':
      return compact ? 'トップ' : 'トップページ';
    case 'recruit':
      return compact ? '採用' : '採用ページ';
    case 'other':
      return compact ? 'その他' : 'その他ページ';
    default:
      return '未確認';
  }
}

export function buildEmailSourceLabels(
  pageType: EmailSourcePageType,
  isOfficialSiteOrigin: boolean,
  confirmed: boolean
): { full: string; compact: string } {
  if (!confirmed || pageType === 'unknown') {
    return { full: '未確認', compact: '未確認' };
  }
  const pageFull = pageTypeJapanese(pageType, false);
  const pageCompact = pageTypeJapanese(pageType, true);
  if (isOfficialSiteOrigin) {
    return {
      full: `公式サイト / ${pageFull}`,
      compact: `公式サイト / ${pageCompact}`,
    };
  }
  return { full: pageFull, compact: pageCompact };
}

export function isPlaceholderEmailAddress(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  if (isRejectedEmail(normalized)) return true;
  if (/@xxx\.com$/i.test(normalized)) return true;
  if (/^xxx@/i.test(normalized)) return true;
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return false;
  if (local === 'xxx' || local === 'example' || local === 'sample' || local === 'test') {
    return true;
  }
  if (domain === 'xxx.com' || domain === 'example.com' || domain === 'example.co.jp') {
    return true;
  }
  if (/dummy|placeholder/.test(normalized)) return true;
  return false;
}

export function isPersonalEmailAddress(
  email: string,
  emailContactType?: Lead['emailContactType']
): boolean {
  if (emailContactType === 'personal_rejected') return true;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  if (isFreeEmailDomain(normalized)) return true;
  if (looksLikePersonalEmail(normalized)) return true;
  const classified = classifyEmailCandidate(normalized, '', 'visible');
  return classified.rejected && classified.contactType === 'personal_rejected';
}

function pickBestFallbackUrl(
  officialSiteUrl: string | null,
  contactFormUrl: string | null,
  checkedUrls: string[]
): string | null {
  const officialHost = officialSiteUrl ? normalizeHost(officialSiteUrl) : null;

  const sameDomainContact = checkedUrls.find((u) => {
    if (!officialHost) return false;
    const host = normalizeHost(u);
    if (host !== officialHost) return false;
    const pt = inferPageType(u);
    return pt === 'contact' || pt === 'form';
  });
  if (sameDomainContact) return sameDomainContact;

  if (contactFormUrl?.trim()) return normalizeUrl(contactFormUrl);

  const sameDomainAny = checkedUrls.find((u) => officialHost && normalizeHost(u) === officialHost);
  if (sameDomainAny) return sameDomainAny;

  if (officialSiteUrl?.trim()) return normalizeUrl(officialSiteUrl);
  return checkedUrls.find((u) => u.trim()) ?? null;
}

function resolveCore(input: {
  email: string;
  emailSourceUrl?: string | null;
  emailCandidateSourceUrls?: string[];
  officialSiteUrl?: string | null;
  websiteUrl?: string | null;
  contactFormUrl?: string | null;
  sourceUrls?: string[];
  emailContactType?: Lead['emailContactType'];
  batchId?: string | null;
  source?: string | null;
}): EmailSourceDisplayInfo {
  const email = input.email.trim();
  const officialSiteUrl =
    (input.officialSiteUrl?.trim() || input.websiteUrl?.trim() || null) ?? null;
  const checkedUrls = [
    ...(input.emailCandidateSourceUrls ?? []).map(normalizeUrl),
    ...(input.sourceUrls ?? []).map(normalizeUrl),
    input.contactFormUrl ? normalizeUrl(input.contactFormUrl) : '',
    officialSiteUrl ?? '',
  ].filter(Boolean);

  const uniqueChecked = [...new Set(checkedUrls)];

  const explicitSourceUrl =
    input.emailSourceUrl?.trim() ||
    input.emailCandidateSourceUrls?.find((u) => u.trim())?.trim() ||
    null;
  const emailSourceConfirmed = Boolean(explicitSourceUrl);
  let emailSourceUrl = explicitSourceUrl ? normalizeUrl(explicitSourceUrl) : null;

  if (!emailSourceUrl) {
    emailSourceUrl = pickBestFallbackUrl(
      officialSiteUrl,
      input.contactFormUrl ?? null,
      uniqueChecked
    );
  }

  const sourcePageType = emailSourceUrl ? inferPageType(emailSourceUrl) : 'unknown';
  const isOfficialSiteOrigin = emailSourceUrl
    ? hostsMatch(emailSourceUrl, officialSiteUrl) ||
      (!officialSiteUrl && uniqueChecked.some((u) => hostsMatch(emailSourceUrl, u)))
    : false;

  const labels = buildEmailSourceLabels(sourcePageType, isOfficialSiteOrigin, emailSourceConfirmed);

  return {
    email,
    emailSourceUrl,
    emailSourceLabel: labels.full,
    emailSourceCompactLabel: labels.compact,
    sourcePageType,
    officialSiteUrl,
    isOfficialSiteOrigin,
    emailSourceConfirmed,
    isPlaceholderEmail: isPlaceholderEmailAddress(email),
    isPersonalEmail: isPersonalEmailAddress(email, input.emailContactType),
    checkedUrls: uniqueChecked,
    batchId: input.batchId?.trim() || null,
    source: input.source?.trim() || null,
  };
}

export function resolveEmailSourceFromLead(lead: Lead): EmailSourceDisplayInfo {
  const email = lead.emailCandidates.find((e) => e.trim())?.trim() ?? '';
  return resolveCore({
    email,
    emailSourceUrl: lead.emailSourceUrl ?? lead.emailCandidateSourceUrls[0] ?? null,
    emailCandidateSourceUrls: lead.emailCandidateSourceUrls,
    officialSiteUrl: lead.websiteUrl,
    websiteUrl: lead.websiteUrl,
    contactFormUrl: lead.contactFormUrl,
    sourceUrls: lead.sourceUrls,
    emailContactType: lead.emailContactType,
    batchId: lead.collectionBatchId ?? null,
    source: lead.source ?? null,
  });
}

export function resolveEmailSourceFromCandidate(
  candidate: ExternalLeadCandidate
): EmailSourceDisplayInfo {
  const email =
    candidate.targetEmail?.trim() ||
    candidate.emailCandidates.find((e) => e.trim())?.trim() ||
    '';
  return resolveCore({
    email,
    emailSourceUrl:
      candidate.emailCandidateSourceUrl ??
      candidate.emailCandidateSourceUrls[0] ??
      null,
    emailCandidateSourceUrls: candidate.emailCandidateSourceUrls,
    officialSiteUrl: candidate.officialSiteUrl ?? candidate.websiteUrl,
    websiteUrl: candidate.websiteUrl,
    contactFormUrl: candidate.contactFormUrl,
    sourceUrls: candidate.sourceUrl ? [candidate.sourceUrl] : [],
    batchId: candidate.collectionBatchId,
    source: 'daily30',
  });
}

export function shortenEmailSourceUrl(url: string, maxLen = 36): string {
  const trimmed = url.trim();
  if (!trimmed) return '—';
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname === '/' ? '' : u.pathname;
    const short = `${host}${path}`;
    if (short.length <= maxLen) return short;
    return `${short.slice(0, maxLen - 1)}…`;
  } catch {
    if (trimmed.length <= maxLen) return trimmed;
    return `${trimmed.slice(0, maxLen - 1)}…`;
  }
}

/** @deprecated Use buildEmailSourceLabels — kept for outreachPolicy memo compat */
export function labelForEmailSourcePageType(pageType: EmailSourcePageType): string {
  return buildEmailSourceLabels(pageType, true, true).full;
}
