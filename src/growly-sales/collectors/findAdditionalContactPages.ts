import { extractLinks, matchesKeywords, normalizeUrl, uniqueNormalizedUrls } from './htmlUtils.js';
import { isSameSiteUrl, isSocialMediaUrl } from './urlClassification.js';

/** 1 Lead あたりの追加解析ページ上限（トップページ除く） */
export const MAX_ADDITIONAL_CONTACT_PAGES = 4;

const CONTACT_PRIORITY_KEYWORDS = [
  'お問い合わせ',
  '問い合わせ',
  '問合せ',
  'ご相談',
  '資料請求',
  'contact',
  'inquiry',
  'inquiries',
  'toiawase',
  'otoiawase',
];

const COMPANY_PRIORITY_KEYWORDS = [
  '会社概要',
  '企業情報',
  'company',
  'about',
  'corporate',
  'profile',
];

const ACCESS_PRIORITY_KEYWORDS = ['アクセス', '店舗', '営業所', 'access', 'office', 'shop', 'showroom'];

const PRIVACY_PRIORITY_KEYWORDS = [
  'プライバシー',
  'privacy',
  '個人情報',
  'personal',
];

const RECRUIT_PRIORITY_KEYWORDS = ['採用', 'recruit', '求人', 'career', 'jobs'];

const TOKUSHO_PRIORITY_KEYWORDS = [
  '特定商取引',
  'tokusho',
  '特商法',
  'legal',
];

const PRIVACY_PATH_KEYWORDS = ['/privacy', '/policy', '/kojin', '/personal'];

const RECRUIT_PATH_KEYWORDS = ['/recruit', '/saiyo', '/career', '/jobs', '/employment'];

const TOKUSHO_PATH_KEYWORDS = ['/tokusho', '/law', '/legal', '/trade', '/specified'];

const CONTACT_PATH_KEYWORDS = [
  '/contact',
  '/inquiry',
  '/toiawase',
  '/otoiawase',
  '/form',
  '/request',
  '/consultation',
  '/ask',
  '/moushikomi',
];

const COMPANY_PATH_KEYWORDS = ['/company', '/about', '/corporate', '/profile', '/gaiyou'];

const ACCESS_PATH_KEYWORDS = ['/access', '/shop', '/office', '/tenpo', '/showroom'];

function pathOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return '';
  }
}

function scoreAdditionalPage(linkText: string, url: string, baseUrl: string): number {
  if (isSocialMediaUrl(url)) return -1;
  if (!isSameSiteUrl(url, baseUrl)) return -1;

  const path = pathOf(url);
  const normalizedBase = normalizeUrl(baseUrl);
  if (normalizeUrl(url) === normalizedBase) return -1;

  let score = 0;

  if (CONTACT_PATH_KEYWORDS.some((kw) => path.includes(kw))) score += 30;
  if (COMPANY_PATH_KEYWORDS.some((kw) => path.includes(kw))) score += 20;
  if (ACCESS_PATH_KEYWORDS.some((kw) => path.includes(kw))) score += 15;
  if (PRIVACY_PATH_KEYWORDS.some((kw) => path.includes(kw))) score += 14;
  if (RECRUIT_PATH_KEYWORDS.some((kw) => path.includes(kw))) score += 12;
  if (TOKUSHO_PATH_KEYWORDS.some((kw) => path.includes(kw))) score += 12;

  if (matchesKeywords(linkText, CONTACT_PRIORITY_KEYWORDS)) score += 25;
  else if (matchesKeywords(linkText, COMPANY_PRIORITY_KEYWORDS)) score += 18;
  else if (matchesKeywords(linkText, ACCESS_PRIORITY_KEYWORDS)) score += 12;
  else if (matchesKeywords(linkText, PRIVACY_PRIORITY_KEYWORDS)) score += 11;
  else if (matchesKeywords(linkText, RECRUIT_PRIORITY_KEYWORDS)) score += 10;
  else if (matchesKeywords(linkText, TOKUSHO_PRIORITY_KEYWORDS)) score += 10;

  return score > 0 ? score : -1;
}

/**
 * 同一ドメイン内の問い合わせ系・会社概要系ページ URL を優先度順に返す（最大 MAX_ADDITIONAL_CONTACT_PAGES）。
 */
export function findAdditionalContactPageUrls(html: string, baseUrl: string): string[] {
  const links = extractLinks(html, baseUrl);
  const scored: Array<{ url: string; score: number }> = [];

  for (const link of links) {
    const score = scoreAdditionalPage(link.text, link.resolvedUrl, baseUrl);
    if (score > 0) {
      scored.push({ url: link.resolvedUrl, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return uniqueNormalizedUrls(scored.map((s) => s.url)).slice(0, MAX_ADDITIONAL_CONTACT_PAGES);
}
