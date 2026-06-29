import type { Lead, ReviewStatus } from '../types/lead.js';
import type { OfferProfile } from '../config/offerProfile.js';
import { MOJIBAKE_REPLACEMENT_CHAR } from '../storage/csvEncoding.js';
import {
  containsProhibitedPhrase,
  hasJapaneseText,
  isOutreachEligible,
  MAX_EMAIL_BODY_LENGTH,
  REVISE_EMAIL_BODY_LENGTH,
} from '../generation/generationUtils.js';
import { containsProhibitedClaim } from '../config/offerProfile.js';

export interface ReviewResult {
  reviewStatus: ReviewStatus;
  reviewComment: string;
  nextAction: string;
}

function buildResult(
  reviewStatus: ReviewStatus,
  reviewComment: string,
  nextAction: string
): ReviewResult {
  return { reviewStatus, reviewComment, nextAction };
}

export function reviewSalesEmail(lead: Lead, offer?: OfferProfile): ReviewResult {
  const prohibitedExtra = offer?.prohibitedClaims ?? [];

  if (lead.doNotContact) {
    return buildResult(
      'reject',
      'doNotContact=true のため営業対象外',
      '連絡しない。リストから除外を確認'
    );
  }

  if (lead.riskLevel === 'high') {
    return buildResult(
      'reject',
      'riskLevel=high のため自動営業文を付与しない',
      '人間がリスクを確認してから判断'
    );
  }

  if (!isOutreachEligible(lead)) {
    return buildResult(
      'reject',
      '収集ステータスまたは安全条件により営業文を生成しない',
      '人間確認後に再判断'
    );
  }

  if (!lead.emailBody?.trim()) {
    return buildResult('reject', 'emailBodyが空', 'generateを再実行するか手動で作成');
  }

  if (!hasJapaneseText(lead.emailBody)) {
    return buildResult('reject', 'emailBodyに日本語が含まれない', '文面を見直し');
  }

  if (lead.emailBody.includes(MOJIBAKE_REPLACEMENT_CHAR)) {
    return buildResult('reject', 'emailBodyに文字化けの可能性', '入力データと文面を確認');
  }

  const fullText = `${lead.emailSubject}\n${lead.emailBody}`;
  const prohibited = containsProhibitedPhrase(fullText, prohibitedExtra);
  if (prohibited) {
    return buildResult('reject', `禁止表現を検出: ${prohibited}`, '文面を修正して再生成');
  }

  if (offer && containsProhibitedClaim(fullText, offer)) {
    return buildResult('reject', 'offerProfileの禁止表現に該当', '文面を修正して再生成');
  }

  if (/自動送信|自動で送|auto\s*send/i.test(fullText)) {
    return buildResult('reject', '自動送信を示す文言', '文面を修正');
  }

  if (/様へ|さんへ|殿/.test(lead.emailBody) && !lead.emailBody.includes('ご担当者様')) {
    return buildResult('reject', '個人宛て前提の表現の可能性', '宛名をご担当者様に統一');
  }

  if (lead.emailBody.length > MAX_EMAIL_BODY_LENGTH) {
    return buildResult('reject', 'emailBodyが長すぎる', '文面を短くして再生成');
  }

  const reviseReasons: string[] = [];

  if (lead.emailBody.length > REVISE_EMAIL_BODY_LENGTH) {
    reviseReasons.push('文面がやや長い');
  }

  if (!lead.contactFormUrl) {
    reviseReasons.push('contactFormUrlがない');
  }

  if (!lead.companyName?.trim() || !lead.area?.trim()) {
    reviseReasons.push('会社名または地域が不明');
  }

  if (lead.sourceUrls.length < 2) {
    reviseReasons.push('根拠URLが少ない');
  }

  const strongCta = ['今すぐ', '必ず', 'お申し込みください', '今だけ'];
  if (strongCta.some((w) => fullText.includes(w))) {
    reviseReasons.push('CTAが強すぎる可能性');
  }

  if (reviseReasons.length > 0) {
    return buildResult(
      'revise',
      reviseReasons.join(' / '),
      '人間が文面を確認・短縮してから承認'
    );
  }

  return buildResult(
    'approve',
    '禁止表現なし。無料診断の案内に留まっている',
    '人間レビュー（humanReviewStatus）承認後にGmail下書き検討（将来）'
  );
}
