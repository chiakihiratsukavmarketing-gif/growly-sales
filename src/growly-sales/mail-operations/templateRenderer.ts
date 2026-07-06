import type { Lead } from '../types/lead.js';
import type { OfferProfile } from '../config/offerProfile.js';
import {
  buildSalesEmailSignature,
  buildCtaLine,
  extractImpressionTailForEmail,
} from '../generation/salesEmailParts.js';
import { extractLeadSignals } from '../generation/generationUtils.js';
import type { OutreachTemplate, TemplatePreviewInput } from './templateTypes.js';

export interface TemplateRenderContext {
  customHook: string;
  salesAngle: string;
  offer: OfferProfile;
}

export interface SalesEmailResult {
  emailSubject: string;
  emailBody: string;
}

function buildDiagnosisItems(lead: Lead, signals: ReturnType<typeof extractLeadSignals>): string[] {
  const items = ['Instagramプロフィールの見え方', '施工事例・実績の見せ方', '問い合わせ導線の分かりやすさ'];
  if (signals.hasRecruit) items.push('採用情報とSNSのつながり');
  if (signals.hasReservationPath) items.push('来場予約・資料請求への導線');
  return items;
}

function formatHomepageImpression(lead: Lead, customHook: string): string {
  const tail = extractImpressionTailForEmail(customHook);
  return `${lead.companyName}様のホームページを拝見し、${tail}`;
}

function buildCtaLine(companyName: string): string {
  return [
    `もしご興味がございましたら、「希望」とだけご返信いただけましたら、${companyName}様向けに簡単な診断レポートを作成いたします。`,
    '無理なご案内やしつこい営業はいたしませんので、ご安心ください。',
  ].join('\n');
}

export function buildTemplateAiSlots(
  lead: Lead,
  context: TemplateRenderContext
): Record<string, string> {
  const signals = extractLeadSignals(lead);
  const diagnosisItems = buildDiagnosisItems(lead, signals);
  return {
    companyName: lead.companyName,
    customOpening: formatHomepageImpression(lead, context.customHook),
    proposalAngle: context.salesAngle,
    area: lead.area,
    industry: lead.industry,
    offerName: context.offer.offerName,
    entryOffer: context.offer.entryOffer,
    diagnosisBlock: diagnosisItems.map((item) => `・${item}`).join('\n'),
    customCTA: buildCtaLine(lead.companyName),
    signature: buildSalesEmailSignature(),
  };
}

export function buildPreviewAiSlots(
  input: TemplatePreviewInput,
  offer: OfferProfile
): Record<string, string> {
  const companyName = input.companyName?.trim() || 'サンプル住宅株式会社';
  const customHook = input.customHook?.trim() || '施工事例の見せ方に工夫を感じました。';
  const area = input.area?.trim() || '仙台市';
  const industry = input.industry?.trim() || '工務店';
  const tail = extractImpressionTailForEmail(customHook);
  return {
    companyName,
    customOpening: `${companyName}様のホームページを拝見し、${tail}`,
    proposalAngle: input.salesAngle?.trim() || 'SNS診断レポート',
    area,
    industry,
    offerName: offer.offerName,
    entryOffer: offer.entryOffer,
    diagnosisBlock: [
      '・Instagramプロフィールの見え方',
      '・施工事例・実績の見せ方',
      '・問い合わせ導線の分かりやすさ',
    ].join('\n'),
    customCTA: buildCtaLine(companyName),
    signature: buildSalesEmailSignature(),
  };
}

function interpolate(template: string, slots: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => slots[key] ?? `{{${key}}}`);
}

export function renderOutreachTemplate(
  template: OutreachTemplate,
  lead: Lead,
  context: TemplateRenderContext
): SalesEmailResult {
  const slots = buildTemplateAiSlots(lead, context);
  const emailSubject = interpolate(template.subjectTemplate, slots).trim();
  const bodyParts = [
    interpolate(template.openingBlock, slots),
    interpolate(template.companyIntroBlock, slots),
    interpolate(template.proposalBlock, slots),
    interpolate(template.proofBlock, slots),
    interpolate(template.ctaBlock, slots),
    interpolate(template.signatureBlock, slots),
  ];
  if (template.unsubscribeBlock.trim()) {
    bodyParts.push(interpolate(template.unsubscribeBlock, slots));
  }
  const emailBody = bodyParts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
  return { emailSubject, emailBody };
}

export function renderOutreachTemplatePreview(
  template: OutreachTemplate,
  input: TemplatePreviewInput,
  offer: OfferProfile
): SalesEmailResult {
  const slots = buildPreviewAiSlots(input, offer);
  const emailSubject = interpolate(template.subjectTemplate, slots).trim();
  const bodyParts = [
    interpolate(template.openingBlock, slots),
    interpolate(template.companyIntroBlock, slots),
    interpolate(template.proposalBlock, slots),
    interpolate(template.proofBlock, slots),
    interpolate(template.ctaBlock, slots),
    interpolate(template.signatureBlock, slots),
  ];
  if (template.unsubscribeBlock.trim()) {
    bodyParts.push(interpolate(template.unsubscribeBlock, slots));
  }
  const emailBody = bodyParts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
  return { emailSubject, emailBody };
}
