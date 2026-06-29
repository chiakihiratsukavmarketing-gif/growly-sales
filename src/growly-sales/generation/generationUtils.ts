import type { Lead } from '../types/lead.js';

/** 成果保証・断定・否定表現（校閲・生成共通） */
export const PROHIBITED_PHRASES = [
  '必ず成果が出ます',
  '必ず成果が出る',
  '必ず問い合わせが増えます',
  '必ず問い合わせが増える',
  '売上保証',
  '売上が上がります',
  '集客できます',
  '採用できます',
  '御社はSNSが弱い',
  'SNSが弱いです',
  '問題があります',
  '今すぐ改善すべき',
  '自動送信',
  '自動でお送り',
] as const;

/** 営業メール印象行で避ける機械的・事実羅列の表現 */
export const MECHANICAL_IMPRESSION_PHRASES = [
  'Instagram公式プロフィールが公開',
  'Instagramも拝見し',
  'がとても印象的でした',
] as const;

export const MAX_EMAIL_BODY_LENGTH = 1200;
export const REVISE_EMAIL_BODY_LENGTH = 800;

export function hasJapaneseText(text: string): boolean {
  return /[\u3040-\u30ff\u4e00-\u9faf]/.test(text);
}

export function containsProhibitedPhrase(text: string, extra: string[] = []): string | null {
  const all = [...PROHIBITED_PHRASES, ...extra];
  for (const phrase of all) {
    if (text.includes(phrase)) return phrase;
  }
  return null;
}

export function hasReservationOrRequestPath(lead: Lead): boolean {
  const url = lead.contactFormUrl?.toLowerCase() ?? '';
  return /\/(request|reserve|reservation|yoyaku|consultation)/.test(url) ||
    url.includes('資料') ||
    url.includes('来場');
}

/** URLパス部分を小文字で返す（解析用） */
export function extractUrlPath(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** 地域ラベル（宮城県XX市 → XX市） */
export function extractAreaLabel(area: string): string {
  const trimmed = area.trim();
  const withoutPref = trimmed.replace(/^宮城県/, '');
  return withoutPref || trimmed;
}

export function isOutreachEligible(lead: Lead): boolean {
  return (
    !lead.doNotContact &&
    lead.riskLevel !== 'high' &&
    lead.collectionStatus !== 'needs_review' &&
    lead.collectionStatus !== 'failed'
  );
}

export interface LeadSignals {
  hasWebsite: boolean;
  hasContact: boolean;
  hasInstagram: boolean;
  hasCaseStudy: boolean;
  hasRecruit: boolean;
  hasReservationPath: boolean;
  hasEmail: boolean;
}

export function extractLeadSignals(lead: Lead): LeadSignals {
  return {
    hasWebsite: Boolean(lead.websiteUrl?.trim()),
    hasContact: Boolean(lead.contactFormUrl) || lead.emailCandidates.length > 0,
    hasInstagram: Boolean(lead.instagramUrl),
    hasCaseStudy: Boolean(lead.caseStudyUrl),
    hasRecruit: Boolean(lead.recruitUrl),
    hasReservationPath: hasReservationOrRequestPath(lead),
    hasEmail: lead.emailCandidates.length > 0,
  };
}
