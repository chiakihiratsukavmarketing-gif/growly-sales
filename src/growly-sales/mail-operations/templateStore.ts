import { readFileSync, existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { getOutreachTemplateDefaultsPath, getOutreachTemplatesPath } from '../config/paths.js';
import type {
  OutreachTemplate,
  OutreachTemplateStore,
  OutreachTemplateTone,
} from './templateTypes.js';
import { OUTREACH_TEMPLATE_AI_SLOTS, OUTREACH_TEMPLATE_HUMAN_BLOCKS } from './templateTypes.js';

const EMPTY_STORE: OutreachTemplateStore = {
  version: 1,
  templates: [],
  activeTemplateId: null,
  updatedAt: new Date().toISOString(),
};

let storeOverride: OutreachTemplateStore | null = null;

export function setOutreachTemplateStoreOverrideForTests(store: OutreachTemplateStore | null): void {
  storeOverride = store;
}

function defaultTemplateFields(): Omit<
  OutreachTemplate,
  'templateId' | 'name' | 'status' | 'version' | 'createdAt' | 'updatedAt'
> {
  return {
    tone: 'formal',
    subjectTemplate: '{{companyName}}様向け｜SNS無料診断レポートのご案内',
    openingBlock: [
      '{{companyName}}',
      'ご担当者様',
      '',
      '突然のご連絡失礼いたします。',
      'SNS運用サポートを行っております、合同会社Want Reachの平塚と申します。',
    ].join('\n'),
    companyIntroBlock:
      '{{customOpening}}',
    proposalBlock: [
      '{{area}}で{{industry}}として活動されている{{companyName}}様向けに、{{offerName}}の{{entryOffer}}をご用意しております。',
      '',
      '【{{entryOffer}}で見られる項目の例】',
      '{{diagnosisBlock}}',
    ].join('\n'),
    proofBlock:
      '売上や問い合わせ数を保証するものではなく、公開情報をもとに改善のヒントをお伝えする内容です。',
    ctaBlock: '{{customCTA}}',
    signatureBlock: '{{signature}}',
    unsubscribeBlock: '',
    requiredPhrases: [],
    prohibitedPhrases: [],
    maxBodyLength: 4000,
    aiEditableSlots: [...OUTREACH_TEMPLATE_AI_SLOTS],
    humanLockedBlocks: [...OUTREACH_TEMPLATE_HUMAN_BLOCKS],
  };
}

export function buildBuiltinDefaultTemplate(): OutreachTemplate {
  const now = new Date().toISOString();
  return {
    templateId: 'builtin-default',
    name: '標準テンプレート（コード既定）',
    status: 'archived',
    version: 1,
    ...defaultTemplateFields(),
    createdAt: now,
    updatedAt: now,
  };
}

export async function loadDefaultTemplateFromConfig(): Promise<OutreachTemplate | null> {
  const path = getOutreachTemplateDefaultsPath();
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<OutreachTemplate>;
    const now = new Date().toISOString();
    return {
      templateId: parsed.templateId ?? 'default-v1',
      name: parsed.name ?? '標準テンプレート',
      status: 'draft',
      version: parsed.version ?? 1,
      tone: (parsed.tone as OutreachTemplateTone) ?? 'formal',
      subjectTemplate: parsed.subjectTemplate ?? defaultTemplateFields().subjectTemplate,
      openingBlock: parsed.openingBlock ?? defaultTemplateFields().openingBlock,
      companyIntroBlock: parsed.companyIntroBlock ?? defaultTemplateFields().companyIntroBlock,
      proposalBlock: parsed.proposalBlock ?? defaultTemplateFields().proposalBlock,
      proofBlock: parsed.proofBlock ?? defaultTemplateFields().proofBlock,
      ctaBlock: parsed.ctaBlock ?? defaultTemplateFields().ctaBlock,
      signatureBlock: parsed.signatureBlock ?? defaultTemplateFields().signatureBlock,
      unsubscribeBlock: parsed.unsubscribeBlock ?? '',
      requiredPhrases: parsed.requiredPhrases ?? [],
      prohibitedPhrases: parsed.prohibitedPhrases ?? [],
      maxBodyLength: parsed.maxBodyLength ?? 4000,
      aiEditableSlots: parsed.aiEditableSlots ?? [...OUTREACH_TEMPLATE_AI_SLOTS],
      humanLockedBlocks: parsed.humanLockedBlocks ?? [...OUTREACH_TEMPLATE_HUMAN_BLOCKS],
      createdAt: parsed.createdAt ?? now,
      updatedAt: now,
    };
  } catch {
    return null;
  }
}

async function ensureStoreFile(): Promise<void> {
  const path = getOutreachTemplatesPath();
  if (existsSync(path)) return;
  const dir = path.replace(/[/\\][^/\\]+$/, '');
  await mkdir(dir, { recursive: true });
  await writeFile(path, `${JSON.stringify(EMPTY_STORE, null, 2)}\n`, 'utf-8');
}

export async function loadOutreachTemplateStore(): Promise<OutreachTemplateStore> {
  if (storeOverride) return structuredClone(storeOverride);
  await ensureStoreFile();
  const raw = await readFile(getOutreachTemplatesPath(), 'utf-8');
  const parsed = JSON.parse(raw) as OutreachTemplateStore;
  if (!parsed.templates || !Array.isArray(parsed.templates)) {
    return { ...EMPTY_STORE };
  }
  return parsed;
}

export function loadOutreachTemplateStoreSync(): OutreachTemplateStore {
  if (storeOverride) return structuredClone(storeOverride);
  const path = getOutreachTemplatesPath();
  if (!existsSync(path)) return { ...EMPTY_STORE };
  const raw = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(raw) as OutreachTemplateStore;
  if (!parsed.templates || !Array.isArray(parsed.templates)) {
    return { ...EMPTY_STORE };
  }
  return parsed;
}

async function saveStore(store: OutreachTemplateStore): Promise<void> {
  const next: OutreachTemplateStore = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  if (storeOverride) {
    storeOverride = structuredClone(next);
    return;
  }
  await ensureStoreFile();
  await writeFile(getOutreachTemplatesPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
}

export function getActiveOutreachTemplate(store: OutreachTemplateStore): OutreachTemplate | null {
  if (!store.activeTemplateId) return null;
  const active = store.templates.find(
    (t) => t.templateId === store.activeTemplateId && t.status === 'active'
  );
  return active ?? null;
}

export function loadActiveOutreachTemplateSync(): OutreachTemplate | null {
  return getActiveOutreachTemplate(loadOutreachTemplateStoreSync());
}

export async function listOutreachTemplates(): Promise<OutreachTemplateStore> {
  return loadOutreachTemplateStore();
}

export async function saveOutreachTemplateDraft(
  input: Partial<OutreachTemplate> & { name: string }
): Promise<OutreachTemplate> {
  const store = await loadOutreachTemplateStore();
  const now = new Date().toISOString();
  const existing = input.templateId
    ? store.templates.find((t) => t.templateId === input.templateId)
    : null;

  const record: OutreachTemplate = {
    templateId: existing?.templateId ?? randomUUID(),
    name: input.name.trim() || '無題テンプレート',
    status: 'draft',
    version: existing ? existing.version + 1 : 1,
    tone: input.tone ?? existing?.tone ?? 'formal',
    subjectTemplate: input.subjectTemplate ?? existing?.subjectTemplate ?? defaultTemplateFields().subjectTemplate,
    openingBlock: input.openingBlock ?? existing?.openingBlock ?? defaultTemplateFields().openingBlock,
    companyIntroBlock:
      input.companyIntroBlock ?? existing?.companyIntroBlock ?? defaultTemplateFields().companyIntroBlock,
    proposalBlock: input.proposalBlock ?? existing?.proposalBlock ?? defaultTemplateFields().proposalBlock,
    proofBlock: input.proofBlock ?? existing?.proofBlock ?? defaultTemplateFields().proofBlock,
    ctaBlock: input.ctaBlock ?? existing?.ctaBlock ?? defaultTemplateFields().ctaBlock,
    signatureBlock: input.signatureBlock ?? existing?.signatureBlock ?? defaultTemplateFields().signatureBlock,
    unsubscribeBlock: input.unsubscribeBlock ?? existing?.unsubscribeBlock ?? '',
    requiredPhrases: input.requiredPhrases ?? existing?.requiredPhrases ?? [],
    prohibitedPhrases: input.prohibitedPhrases ?? existing?.prohibitedPhrases ?? [],
    maxBodyLength: input.maxBodyLength ?? existing?.maxBodyLength ?? 4000,
    aiEditableSlots: input.aiEditableSlots ?? existing?.aiEditableSlots ?? [...OUTREACH_TEMPLATE_AI_SLOTS],
    humanLockedBlocks: input.humanLockedBlocks ?? existing?.humanLockedBlocks ?? [...OUTREACH_TEMPLATE_HUMAN_BLOCKS],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const withoutOld = store.templates.filter((t) => t.templateId !== record.templateId);
  store.templates = [record, ...withoutOld];
  await saveStore(store);
  return record;
}

export async function activateOutreachTemplate(templateId: string): Promise<OutreachTemplate | null> {
  const store = await loadOutreachTemplateStore();
  const target = store.templates.find((t) => t.templateId === templateId);
  if (!target) return null;
  const now = new Date().toISOString();
  store.templates = store.templates.map((t) => {
    if (t.templateId === templateId) {
      return { ...t, status: 'active' as const, activatedAt: now, updatedAt: now };
    }
    if (t.status === 'active') {
      return { ...t, status: 'archived' as const, updatedAt: now };
    }
    return t;
  });
  store.activeTemplateId = templateId;
  await saveStore(store);
  return store.templates.find((t) => t.templateId === templateId) ?? null;
}

export async function resetOutreachTemplatesToDefault(): Promise<OutreachTemplate> {
  const defaults = (await loadDefaultTemplateFromConfig()) ?? buildBuiltinDefaultTemplate();
  const store = await loadOutreachTemplateStore();
  const now = new Date().toISOString();
  const draft: OutreachTemplate = {
    ...defaults,
    templateId: randomUUID(),
    status: 'draft',
    version: 1,
    createdAt: now,
    updatedAt: now,
    activatedAt: undefined,
  };
  store.templates = [draft, ...store.templates.filter((t) => t.status !== 'draft')];
  store.activeTemplateId = store.activeTemplateId;
  await saveStore(store);
  return draft;
}
