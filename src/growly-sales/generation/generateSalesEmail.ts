import type { Lead } from '../types/lead.js';
import type { OfferProfile } from '../config/offerProfile.js';
import { getOutreachSignatureEmail } from '../config/env.js';
import { extractLeadSignals } from './generationUtils.js';

export interface SalesEmailResult {
  emailSubject: string;
  emailBody: string;
}

export interface SalesEmailContext {
  customHook: string;
  salesAngle: string;
  offer: OfferProfile;
}

/** 標準テンプレート署名（改行詰め・Email は OUTREACH_SIGNATURE_EMAIL で変更可） */
export function buildSalesEmailSignature(signatureEmail?: string): string {
  const email = signatureEmail ?? getOutreachSignatureEmail();
  return [
    '====================',
    '合同会社Want Reach',
    '平塚千明 / Chiaki Hiratsuka',
    '〒983-0005',
    '宮城県仙台市宮城野区福室7-12-8',
    'TEL：070-9090-7155',
    `Email：${email}`,
    'URL：https://wantreach.jp/',
    '=========================',
  ].join('\n');
}

const DISCLAIMER_LINE =
  '売上や問い合わせ数を保証するものではなく、公開情報をもとに改善のヒントをお伝えする内容です。';

function buildDiagnosisItems(lead: Lead, signals: ReturnType<typeof extractLeadSignals>): string[] {
  const items = ['Instagramプロフィールの見え方', '施工事例・実績の見せ方', '問い合わせ導線の分かりやすさ'];

  if (signals.hasRecruit) {
    items.push('採用情報とSNSのつながり');
  }
  if (signals.hasReservationPath) {
    items.push('来場予約・資料請求への導線');
  }

  return items;
}

/** customHook からメール本文用の印象文（「と感じました。」で終わる1文）を抽出 */
export function extractImpressionTailForEmail(customHook: string): string {
  const hook = customHook.trim();
  const browseMatch = hook.match(/^[^。]+を拝見し、(.+)$/);
  if (browseMatch?.[1]) {
    const tail = browseMatch[1].trim();
    if (tail.length >= 10) {
      return tail.endsWith('。') ? tail : `${tail}。`;
    }
  }
  return hook.endsWith('。') ? hook : `${hook}。`;
}

function formatHomepageImpression(lead: Lead, customHook: string): string {
  const tail = extractImpressionTailForEmail(customHook);
  return `${lead.companyName}様のホームページを拝見し、${tail}`;
}

export function buildSalesEmailSubject(companyName: string): string {
  return `${companyName}様向け｜SNS無料診断レポートのご案内`;
}

function buildCtaLine(companyName: string): string {
  return [
    `もしご興味がございましたら、「希望」とだけご返信いただけましたら、${companyName}様向けに簡単な診断レポートを作成いたします。`,
    '無理なご案内やしつこい営業はいたしませんので、ご安心ください。',
  ].join('\n');
}

export function generateSalesEmail(lead: Lead, context: SalesEmailContext): SalesEmailResult {
  const signals = extractLeadSignals(lead);
  const entryOffer = context.offer.entryOffer;
  const diagnosisItems = buildDiagnosisItems(lead, signals);

  const emailSubject = buildSalesEmailSubject(lead.companyName);

  const diagnosisBlock = diagnosisItems.map((item) => `・${item}`).join('\n');

  const emailBody = [
    lead.companyName,
    'ご担当者様',
    '',
    '突然のご連絡失礼いたします。',
    'SNS運用サポートを行っております、合同会社Want Reachの平塚と申します。',
    '',
    `${formatHomepageImpression(lead, context.customHook)}`,
    '',
    `${lead.area}で${lead.industry}として活動されている${lead.companyName}様向けに、${context.offer.offerName}の${entryOffer}をご用意しております。`,
    '',
    `【${entryOffer}で見られる項目の例】`,
    diagnosisBlock,
    '',
    DISCLAIMER_LINE,
    buildCtaLine(lead.companyName),
    '',
    buildSalesEmailSignature(),
  ].join('\n');

  return { emailSubject, emailBody };
}
