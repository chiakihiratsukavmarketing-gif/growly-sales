import type { OutreachTemplate } from './templateTypes.js';
import { OUTREACH_TEMPLATE_AI_SLOTS } from './templateTypes.js';
import { containsProhibitedPhrase } from '../generation/generationUtils.js';

export interface TemplateValidationResult {
  ok: boolean;
  errors: string[];
}

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

export function findUnresolvedTemplatePlaceholders(template: OutreachTemplate): string[] {
  const combined = [
    template.subjectTemplate,
    template.openingBlock,
    template.companyIntroBlock,
    template.proposalBlock,
    template.proofBlock,
    template.ctaBlock,
    template.signatureBlock,
    template.unsubscribeBlock,
  ].join('\n');
  const allowed = new Set<string>([...OUTREACH_TEMPLATE_AI_SLOTS, 'slot']);
  const unknown: string[] = [];
  for (const match of combined.matchAll(PLACEHOLDER_RE)) {
    const key = match[1];
    if (!allowed.has(key)) unknown.push(key);
  }
  return [...new Set(unknown)];
}

export function validateOutreachTemplate(template: OutreachTemplate): TemplateValidationResult {
  const errors: string[] = [];
  if (!template.name.trim()) errors.push('テンプレート名が空です');
  if (!template.subjectTemplate.trim()) errors.push('件名テンプレートが空です');
  if (!template.openingBlock.trim()) errors.push('冒頭ブロックが空です');
  if (!template.signatureBlock.trim()) errors.push('署名ブロックが空です');

  const unresolved = findUnresolvedTemplatePlaceholders(template);
  if (unresolved.length > 0) {
    errors.push(`未解決プレースホルダ: ${unresolved.map((k) => `{{${k}}}`).join(', ')}`);
  }

  const combined = [
    template.subjectTemplate,
    template.openingBlock,
    template.companyIntroBlock,
    template.proposalBlock,
    template.proofBlock,
    template.ctaBlock,
    template.signatureBlock,
    template.unsubscribeBlock,
  ].join('\n');

  for (const phrase of template.prohibitedPhrases) {
    if (phrase.trim() && combined.includes(phrase.trim())) {
      errors.push(`禁止表現を含みます: ${phrase}`);
    }
  }

  for (const phrase of template.requiredPhrases) {
    if (phrase.trim() && !combined.includes(phrase.trim())) {
      errors.push(`必須文が不足しています: ${phrase}`);
    }
  }

  const prohibitedHit = containsProhibitedPhrase(combined, template.prohibitedPhrases);
  if (prohibitedHit) {
    errors.push(`禁止表現を検出: ${prohibitedHit}`);
  }

  if (template.maxBodyLength && combined.length > template.maxBodyLength) {
    errors.push(`最大文字数（${template.maxBodyLength}）を超えています`);
  }

  return { ok: errors.length === 0, errors };
}

export function validateOutreachTemplateForActivation(template: OutreachTemplate): TemplateValidationResult {
  const base = validateOutreachTemplate(template);
  const errors = [...base.errors];
  if (!template.unsubscribeBlock.trim()) {
    errors.push('配信停止案内ブロックが未設定です（有効化には必須）');
  }
  return { ok: errors.length === 0, errors };
}

export function shouldApplyActiveTemplate(): boolean {
  return process.env.MAIL_OPS_MODE?.trim().toLowerCase() !== 'live-disabled-template';
}
