import type { Lead } from '../types/lead.js';
import type { OfferProfile } from '../config/offerProfile.js';
import { extractLeadSignals } from './generationUtils.js';
import {
  buildSalesEmailSignature,
  buildSalesEmailSubject,
  buildCtaLine,
  DISCLAIMER_LINE,
  extractImpressionTailForEmail,
} from './salesEmailParts.js';
import { loadActiveOutreachTemplateSync } from '../mail-operations/templateStore.js';
import { renderOutreachTemplate } from '../mail-operations/templateRenderer.js';
import { shouldApplyActiveTemplate } from '../mail-operations/templatePolicy.js';

export interface SalesEmailResult {
  emailSubject: string;
  emailBody: string;
}

export interface SalesEmailContext {
  customHook: string;
  salesAngle: string;
  offer: OfferProfile;
}

export { buildSalesEmailSignature, extractImpressionTailForEmail, buildSalesEmailSubject };

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

function formatHomepageImpression(lead: Lead, customHook: string): string {
  const tail = extractImpressionTailForEmail(customHook);
  return `${lead.companyName}様のホームページを拝見し、${tail}`;
}

export function generateSalesEmail(lead: Lead, context: SalesEmailContext): SalesEmailResult {
  const activeTemplate = loadActiveOutreachTemplateSync();
  if (activeTemplate && shouldApplyActiveTemplate()) {
    return renderOutreachTemplate(activeTemplate, lead, context);
  }

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
