import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Lead } from '../types/lead.js';

export interface LeadJsonStore {
  leads: Lead[];
  updatedAt: string;
}

const EMPTY_STORE: LeadJsonStore = {
  leads: [],
  updatedAt: new Date().toISOString(),
};

function ensureLeadDefaults(raw: Lead): Lead {
  const repliedAt = raw.repliedAt ?? raw.replyReceivedAt ?? null;
  const followUpDueAt = raw.followUpDueAt ?? raw.followUpDate ?? null;
  const replySummary = raw.replySummary?.trim() ? raw.replySummary : raw.replyMemo ?? '';

  const withDefaults: Lead = {
    // existing fields
    ...raw,
    // new Phase 12-lite fields (missing in older leads.json)
    manualSentAt: raw.manualSentAt ?? null,
    manualSendMethod: raw.manualSendMethod ?? null,
    replyReceivedAt: repliedAt,
    repliedAt,
    replyMemo: raw.replyMemo ?? replySummary,
    replySummary,
    followUpDate: followUpDueAt,
    followUpDueAt,
    followUpMemo: raw.followUpMemo ?? '',
    dealStatus: raw.dealStatus ?? 'none',
    outcomeMemo: raw.outcomeMemo ?? '',
    communicationMemo: raw.communicationMemo ?? '',
    // enums that existed but may be missing in older data
    replyStatus: raw.replyStatus ?? 'none',
    sendStatus:
      raw.sendStatus === 'blocked'
        ? 'blocked'
        : raw.sendStatus === 'sent'
          ? 'sent'
          : raw.manualSentAt
            ? 'manual_sent'
            : raw.sendStatus ?? 'not_sent',
    humanReviewStatus: raw.humanReviewStatus ?? 'pending',
    reviewStatus: raw.reviewStatus ?? 'pending',
    riskLevel: raw.riskLevel ?? 'medium',
    hookSourceType: raw.hookSourceType ?? '',
    hookSourceUrl: raw.hookSourceUrl ?? null,
    customHookReason: raw.customHookReason ?? '',
    gmailDraftStatus: raw.gmailDraftStatus ?? 'none',
    gmailDraftId: raw.gmailDraftId ?? null,
    gmailDraftCreatedAt: raw.gmailDraftCreatedAt ?? null,
    gmailDraftError: raw.gmailDraftError ?? '',
    gmailDraftPreviewedAt: raw.gmailDraftPreviewedAt ?? null,
  };

  return withDefaults;
}

export async function loadLeadsFromJson(filePath: string): Promise<Lead[]> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const trimmed = raw.trim();
    if (!trimmed) return [];
    const parsed = JSON.parse(trimmed) as LeadJsonStore | Lead[];
    if (Array.isArray(parsed)) return parsed.map(ensureLeadDefaults);
    if (parsed && Array.isArray(parsed.leads)) return parsed.leads.map(ensureLeadDefaults);
    return [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function saveLeadsToJson(filePath: string, leads: Lead[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const store: LeadJsonStore = {
    leads,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(filePath, JSON.stringify(store, null, 2), 'utf-8');
}

export function createEmptyJsonStore(): LeadJsonStore {
  return { ...EMPTY_STORE, updatedAt: new Date().toISOString() };
}

export async function appendLeadsToJson(filePath: string, newLeads: Lead[]): Promise<Lead[]> {
  const existing = await loadLeadsFromJson(filePath);
  const merged = [...existing, ...newLeads];
  await saveLeadsToJson(filePath, merged);
  return merged;
}
