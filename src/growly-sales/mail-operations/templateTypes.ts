export type OutreachTemplateStatus = 'draft' | 'active' | 'archived';

export type OutreachTemplateTone = 'formal' | 'friendly' | 'consultative' | 'concise';

export const OUTREACH_TEMPLATE_AI_SLOTS = [
  'companyName',
  'customOpening',
  'proposalAngle',
  'area',
  'industry',
  'offerName',
  'entryOffer',
  'diagnosisBlock',
  'customCTA',
  'signature',
] as const;

export type OutreachTemplateAiSlot = (typeof OUTREACH_TEMPLATE_AI_SLOTS)[number];

export const OUTREACH_TEMPLATE_HUMAN_BLOCKS = [
  'subjectTemplate',
  'openingBlock',
  'companyIntroBlock',
  'proposalBlock',
  'proofBlock',
  'ctaBlock',
  'signatureBlock',
  'unsubscribeBlock',
] as const;

export type OutreachTemplateHumanBlock = (typeof OUTREACH_TEMPLATE_HUMAN_BLOCKS)[number];

export interface OutreachTemplate {
  templateId: string;
  name: string;
  status: OutreachTemplateStatus;
  version: number;
  tone: OutreachTemplateTone;
  subjectTemplate: string;
  openingBlock: string;
  companyIntroBlock: string;
  proposalBlock: string;
  proofBlock: string;
  ctaBlock: string;
  signatureBlock: string;
  unsubscribeBlock: string;
  requiredPhrases: string[];
  prohibitedPhrases: string[];
  maxBodyLength?: number;
  aiEditableSlots: string[];
  humanLockedBlocks: string[];
  createdAt: string;
  updatedAt: string;
  activatedAt?: string;
}

export interface OutreachTemplateStore {
  version: 1;
  templates: OutreachTemplate[];
  activeTemplateId: string | null;
  updatedAt: string;
}

export interface TemplatePreviewInput {
  companyName?: string;
  area?: string;
  industry?: string;
  customHook?: string;
  salesAngle?: string;
}
