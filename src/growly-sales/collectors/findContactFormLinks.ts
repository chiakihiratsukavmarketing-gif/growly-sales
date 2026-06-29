import { extractLinks, matchesKeywords, uniqueNormalizedUrls, type ExtractedLink } from './htmlUtils.js';
import {
  hasExcludedContactPath,
  hasStrongContactPath,
  isSameSiteUrl,
  isSocialMediaUrl,
} from './urlClassification.js';

const STRONG_CONTACT_TEXT_KEYWORDS = [
  'お問い合わせ',
  '問い合わせ',
  '問合せ',
  '資料請求',
  '来場予約',
  '相談予約',
  '無料相談',
  '見学予約',
  'contact',
  'inquiry',
  'inquiries',
];

const CONTACT_PATH_KEYWORDS = [
  '/contact',
  '/inquiry',
  '/form',
  '/toiawase',
  '/otoiawase',
  '/ask',
  '/request',
  '/reserve',
  '/reservation',
  '/consultation',
  '/yoyaku',
  '/moushikomi',
];

const MIN_CONTACT_SCORE = 5;

function scoreContactLink(link: ExtractedLink, baseUrl: string): number {
  if (isSocialMediaUrl(link.resolvedUrl)) return -1;
  if (!isSameSiteUrl(link.resolvedUrl, baseUrl)) return -1;

  const path = (() => {
    try {
      return new URL(link.resolvedUrl).pathname.toLowerCase();
    } catch {
      return '';
    }
  })();

  const hasStrongPath = hasStrongContactPath(link.resolvedUrl) ||
    CONTACT_PATH_KEYWORDS.some((kw) => path.includes(kw));
  const hasExcludedPath = hasExcludedContactPath(link.resolvedUrl);

  if (hasExcludedPath && !hasStrongPath) {
    return -1;
  }

  let score = 0;

  if (path.includes('/contact')) score += 15;
  if (path.includes('/inquiry') || path.includes('/toiawase') || path.includes('/otoiawase')) score += 14;
  if (path.includes('/request')) score += 13;
  if (path.includes('/reserve') || path.includes('/reservation') || path.includes('/yoyaku')) score += 12;
  if (path.includes('/consultation') || path.includes('/form')) score += 10;

  if (matchesKeywords(link.text, STRONG_CONTACT_TEXT_KEYWORDS)) {
    score += hasStrongPath ? 8 : 3;
  }

  if (!hasStrongPath && score < MIN_CONTACT_SCORE) {
    return -1;
  }

  return score;
}

export function findContactFormLinks(html: string, baseUrl: string): string[] {
  const links = extractLinks(html, baseUrl);
  const scored: Array<{ url: string; score: number }> = [];

  for (const link of links) {
    const score = scoreContactLink(link, baseUrl);
    if (score >= MIN_CONTACT_SCORE) {
      scored.push({ url: link.resolvedUrl, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return uniqueNormalizedUrls(scored.map((s) => s.url));
}

export function findBestContactFormUrl(html: string, baseUrl: string): string | null {
  const links = extractLinks(html, baseUrl);
  let best: { url: string; score: number } | null = null;

  for (const link of links) {
    const score = scoreContactLink(link, baseUrl);
    if (score >= MIN_CONTACT_SCORE && (!best || score > best.score)) {
      best = { url: link.resolvedUrl, score };
    }
  }

  return best?.url ?? null;
}
