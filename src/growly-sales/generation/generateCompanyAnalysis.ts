import type { Lead } from '../types/lead.js';
import type { OfferProfile } from '../config/offerProfile.js';
import type { TargetProfile } from '../config/targetProfile.js';
import { extractLeadSignals } from './generationUtils.js';

export interface CompanyAnalysisContext {
  salesAngle: string;
  offer?: OfferProfile;
  target?: TargetProfile;
}

function yesNo(value: boolean): string {
  return value ? 'あり' : 'なし';
}

function inferSnsChallenges(lead: Lead, signals: ReturnType<typeof extractLeadSignals>): string[] {
  const challenges: string[] = [];

  if (!signals.hasInstagram) {
    challenges.push('Instagram上での施工事例・家づくりの魅力の見せ方が未確認');
  } else if (signals.hasCaseStudy && signals.hasInstagram) {
    challenges.push('施工事例とInstagramの導線をより分かりやすくつなげる余地');
  } else if (signals.hasInstagram) {
    challenges.push('Instagram上で事例や強みをさらに伝えられる余地');
  }

  if (!signals.hasContact) {
    challenges.push('問い合わせ導線の特定が難しく、初回アプローチは慎重に');
  }

  if (signals.hasRecruit && signals.hasInstagram) {
    challenges.push('集客と採用の両面でSNS活用の整理余地');
  }

  if (challenges.length === 0) {
    challenges.push('公開情報ベースでは大きな欠落は見えないが、投稿設計の細部は要確認');
  }

  return challenges;
}

function inferCautions(lead: Lead, signals: ReturnType<typeof extractLeadSignals>): string[] {
  const cautions: string[] = ['公開情報のみに基づく分析であり、断定は避ける'];

  if (lead.riskLevel === 'medium') {
    cautions.push('連絡先の確度が中程度のため、送信前に人間確認');
  }
  if (!signals.hasContact) {
    cautions.push('問い合わせフォーム・法人メールが未確認');
  }
  if (lead.sourceUrls.length < 2) {
    cautions.push('参照URLが少ないため、追加確認を推奨');
  }

  return cautions;
}

export function generateCompanyAnalysis(
  lead: Lead,
  context: CompanyAnalysisContext
): string {
  const signals = extractLeadSignals(lead);
  const challenges = inferSnsChallenges(lead, signals);
  const cautions = inferCautions(lead, signals);
  const entryOffer = context.offer?.entryOffer ?? '無料SNS診断レポート';

  const lines: string[] = [
    `【企業概要】`,
    `${lead.companyName}（${lead.area} / ${lead.industry}）`,
    `公式サイト: ${lead.websiteUrl || '不明'}`,
    ``,
    `【公開情報の確認結果】`,
    `- Instagram: ${yesNo(signals.hasInstagram)}${signals.hasInstagram ? `（${lead.instagramUrl}）` : ''}`,
    `- 問い合わせフォーム: ${yesNo(signals.hasContact)}${lead.contactFormUrl ? `（${lead.contactFormUrl}）` : ''}`,
    `- 施工事例ページ: ${yesNo(signals.hasCaseStudy)}${lead.caseStudyUrl ? `（${lead.caseStudyUrl}）` : ''}`,
    `- 採用ページ: ${yesNo(signals.hasRecruit)}${lead.recruitUrl ? `（${lead.recruitUrl}）` : ''}`,
    `- 来場予約・資料請求導線: ${yesNo(signals.hasReservationPath)}`,
    ``,
    `【想定されるSNS課題（公開情報ベース）】`,
    ...challenges.map((c) => `- ${c}`),
    ``,
    `【営業で使えそうな切り口】`,
    `- ${context.salesAngle}`,
    `- 入口オファー: ${entryOffer}`,
    ``,
    `【注意点】`,
    ...cautions.map((c) => `- ${c}`),
  ];

  return lines.join('\n').trim();
}
