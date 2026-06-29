import type { Lead, GmailDraftStatus } from '../types/lead.js';
import { getLeadsCsvPath, getLeadsJsonPath } from '../config/paths.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';

export class LeadNotFoundError extends Error {
  constructor(leadId: string) {
    super(`Lead not found: ${leadId}`);
    this.name = 'LeadNotFoundError';
  }
}

async function persistLeads(leads: Lead[]): Promise<void> {
  await saveLeadsToJson(getLeadsJsonPath(), leads);
  await saveLeadsToCsv(getLeadsCsvPath(), leads);
}

async function updateLeadById(leadId: string, updater: (lead: Lead) => Lead): Promise<Lead> {
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  let found: Lead | null = null;
  const updated = leads.map((lead) => {
    if (lead.id !== leadId) return lead;
    found = updater(lead);
    return found;
  });
  if (!found) throw new LeadNotFoundError(leadId);
  await persistLeads(updated);
  return found;
}

/** Gmail下書き作成成功 — sendStatus は not_sent のまま */
export function applyGmailDraftCreated(lead: Lead, draftId: string, createdAt: string): Lead {
  return {
    ...lead,
    gmailDraftStatus: 'draft_created',
    gmailDraftId: draftId,
    gmailDraftCreatedAt: createdAt,
    gmailDraftError: '',
    sendStatus: lead.sendStatus === 'blocked' ? 'blocked' : 'not_sent',
    updatedAt: createdAt,
  };
}

export function applyGmailDraftFailed(lead: Lead, error: string, at: string): Lead {
  return {
    ...lead,
    gmailDraftStatus: 'failed',
    gmailDraftError: error.slice(0, 500),
    sendStatus: lead.sendStatus,
    updatedAt: at,
  };
}

export function applyGmailDraftSkipped(lead: Lead, at: string): Lead {
  return {
    ...lead,
    gmailDraftStatus: 'skipped',
    gmailDraftError: '',
    sendStatus: lead.sendStatus,
    updatedAt: at,
  };
}

export async function markGmailDraftCreated(leadId: string, draftId: string): Promise<Lead> {
  const now = new Date().toISOString();
  return updateLeadById(leadId, (lead) => applyGmailDraftCreated(lead, draftId, now));
}

export async function markGmailDraftFailed(leadId: string, error: string): Promise<Lead> {
  const now = new Date().toISOString();
  return updateLeadById(leadId, (lead) => applyGmailDraftFailed(lead, error, now));
}

export function isValidGmailDraftStatus(status: string): status is GmailDraftStatus {
  return ['none', 'previewed', 'draft_created', 'failed', 'skipped'].includes(status);
}
