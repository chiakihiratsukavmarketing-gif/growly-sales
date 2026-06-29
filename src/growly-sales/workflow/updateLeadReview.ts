import {
  getLeadsJsonPath,
  getLeadsCsvPath,
} from '../config/paths.js';
import type { Lead } from '../types/lead.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';

export const DEFAULT_LEADS_JSON_PATH = getLeadsJsonPath();
export const DEFAULT_LEADS_CSV_PATH = getLeadsCsvPath();

export class LeadNotFoundError extends Error {
  constructor(leadId: string) {
    super(`Lead not found: ${leadId}`);
    this.name = 'LeadNotFoundError';
  }
}

async function persistLeads(
  leads: Lead[],
  jsonPath = DEFAULT_LEADS_JSON_PATH,
  csvPath = DEFAULT_LEADS_CSV_PATH
): Promise<void> {
  await saveLeadsToJson(jsonPath, leads);
  await saveLeadsToCsv(csvPath, leads);
}

async function updateLeadById(
  leadId: string,
  updater: (lead: Lead) => Lead,
  jsonPath = DEFAULT_LEADS_JSON_PATH
): Promise<Lead> {
  const leads = await loadLeadsFromJson(jsonPath);
  let found: Lead | null = null;

  const updated = leads.map((lead) => {
    if (lead.id !== leadId) return lead;
    found = updater(lead);
    return found;
  });

  if (!found) {
    throw new LeadNotFoundError(leadId);
  }

  await persistLeads(updated, jsonPath);
  return found;
}

function appendCommunicationMemo(lead: Lead, entry: string): string {
  return [lead.communicationMemo, entry].filter(Boolean).join(' / ');
}

/** 下書き候補として承認（送信ではない — sendStatus は not_sent のまま） */
export async function approveLeadForDraft(
  leadId: string,
  jsonPath = DEFAULT_LEADS_JSON_PATH,
  source = 'UI'
): Promise<Lead> {
  const stamp = new Date().toISOString().slice(0, 10);
  return updateLeadById(
    leadId,
    (lead) => ({
      ...lead,
      humanReviewStatus: 'approved',
      sendStatus: 'not_sent',
      nextAction: 'Gmail下書き作成（CREATE_DRAFTS・手動送信のみ）',
      communicationMemo: appendCommunicationMemo(
        lead,
        `${stamp} humanReview approved（${source}）— 自動送信なし`
      ),
      updatedAt: new Date().toISOString(),
    }),
    jsonPath
  );
}

export async function markLeadNeedsRevision(
  leadId: string,
  comment: string,
  jsonPath = DEFAULT_LEADS_JSON_PATH
): Promise<Lead> {
  return updateLeadById(
    leadId,
    (lead) => ({
      ...lead,
      humanReviewStatus: 'needs_revision',
      reviewComment: comment.trim() || '修正が必要',
      nextAction: 'メール文面を修正して再レビュー',
      sendStatus: 'not_sent',
      updatedAt: new Date().toISOString(),
    }),
    jsonPath
  );
}

export async function rejectLead(
  leadId: string,
  reason: string,
  jsonPath = DEFAULT_LEADS_JSON_PATH
): Promise<Lead> {
  return updateLeadById(
    leadId,
    (lead) => ({
      ...lead,
      humanReviewStatus: 'rejected',
      reviewComment: reason.trim() || '却下',
      nextAction: '営業対象外 — 送信しない',
      sendStatus: 'not_sent',
      updatedAt: new Date().toISOString(),
    }),
    jsonPath
  );
}

export async function markDoNotContact(
  leadId: string,
  reason: string,
  jsonPath = DEFAULT_LEADS_JSON_PATH
): Promise<Lead> {
  return updateLeadById(
    leadId,
    (lead) => ({
      ...lead,
      doNotContact: true,
      humanReviewStatus: 'rejected',
      reviewComment: reason.trim() || '連絡禁止',
      nextAction: '連絡禁止のため送信対象外',
      sendStatus: 'blocked',
      updatedAt: new Date().toISOString(),
    }),
    jsonPath
  );
}

export async function updateLeadEmailDraft(
  leadId: string,
  payload: {
    emailSubject: string;
    emailBody: string;
    reviewComment?: string;
    nextAction?: string;
  },
  jsonPath = DEFAULT_LEADS_JSON_PATH
): Promise<Lead> {
  return updateLeadById(
    leadId,
    (lead) => ({
      ...lead,
      emailSubject: payload.emailSubject,
      emailBody: payload.emailBody,
      reviewComment: payload.reviewComment ?? lead.reviewComment,
      nextAction: payload.nextAction ?? lead.nextAction,
      sendStatus: 'not_sent',
      updatedAt: new Date().toISOString(),
    }),
    jsonPath
  );
}

export async function getLeadById(
  leadId: string,
  jsonPath = DEFAULT_LEADS_JSON_PATH
): Promise<Lead | null> {
  const leads = await loadLeadsFromJson(jsonPath);
  return leads.find((l) => l.id === leadId) ?? null;
}
