import type { Daily30DiscoverySourceSite } from '../../candidates/daily30CollectionProfile.js';

/** 外部掲載サイト上のメール取得を禁止する既知ホスト（公式サイト enrich ガード用） */
export const KNOWN_JOB_SITE_HOSTS: readonly string[] = [
  'wantedly.com',
  'indeed.com',
  'jp.indeed.com',
  'kyujinbox.com',
  'engage.en-japan.com',
  'green-japan.com',
  'doda.jp',
  'mynavi.jp',
  'tenshoku.mynavi.jp',
  'rikunabi.com',
  'next.rikunabi.com',
];

export const KNOWN_RAKUTEN_HOSTS: readonly string[] = ['rakuten.co.jp', 'item.rakuten.co.jp'];

export const KNOWN_EXTERNAL_REFERENCE_HOSTS: readonly string[] = [
  ...KNOWN_JOB_SITE_HOSTS,
  ...KNOWN_RAKUTEN_HOSTS,
];

const SITE_TO_HOSTS: Partial<Record<Daily30DiscoverySourceSite, readonly string[]>> = {
  wantedly: ['wantedly.com'],
  indeed: ['indeed.com', 'jp.indeed.com'],
  kyujinbox: ['kyujinbox.com'],
  engage: ['engage.en-japan.com'],
  green: ['green-japan.com'],
  doda: ['doda.jp'],
  mynavi_tenshoku: ['mynavi.jp', 'tenshoku.mynavi.jp'],
  rikunabi_next: ['rikunabi.com', 'next.rikunabi.com'],
};

export function normalizeHostFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim()).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export function hostsMatchUrl(
  urlA: string | null | undefined,
  urlB: string | null | undefined
): boolean {
  const ha = normalizeHostFromUrl(urlA);
  const hb = normalizeHostFromUrl(urlB);
  return Boolean(ha && hb && ha === hb);
}

/** サブドメイン一致（example.co.jp が corp.example.co.jp にマッチ） */
export function hostMatchesOrIsSubdomain(host: string, referenceHost: string): boolean {
  const h = host.toLowerCase();
  const ref = referenceHost.toLowerCase();
  return h === ref || h.endsWith(`.${ref}`);
}

export function isKnownExternalReferenceHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return KNOWN_EXTERNAL_REFERENCE_HOSTS.some((ref) => hostMatchesOrIsSubdomain(host, ref));
}

export function isKnownJobSiteHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return KNOWN_JOB_SITE_HOSTS.some((ref) => hostMatchesOrIsSubdomain(host, ref));
}

export function isKnownRakutenHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return KNOWN_RAKUTEN_HOSTS.some((ref) => hostMatchesOrIsSubdomain(host, ref));
}

export function isUrlOnKnownExternalReferenceHost(url: string | null | undefined): boolean {
  return isKnownExternalReferenceHost(normalizeHostFromUrl(url));
}

export function hostsForDiscoverySourceSite(
  site: Daily30DiscoverySourceSite | null | undefined
): readonly string[] {
  if (!site || site === 'other') return KNOWN_EXTERNAL_REFERENCE_HOSTS;
  return SITE_TO_HOSTS[site] ?? KNOWN_EXTERNAL_REFERENCE_HOSTS;
}
