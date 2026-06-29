import type { Lead, DealStatus, ManualSendMethod, ReplyStatus } from '../types/lead.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';
import { getLeadsCsvPath, getLeadsJsonPath } from '../config/paths.js';
import {
  applyReplyManagementUpdate,
  syncReplyAliasesForExport,
  type ReplyManagementUpdate,
} from './replyManagement.js';
import {
  appendReplyManagementDiffMemo,
  assertReplyManagementEligible,
  validateReplyManagementUpdatePayload,
} from './replyManagementValidation.js';

export class ManualSendNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManualSendNotAllowedError';
  }
}

export class LeadNotFoundError extends Error {
  constructor(leadId: string) {
    super(`Lead not found: ${leadId}`);
    this.name = 'LeadNotFoundError';
  }
}

async function persist(leads: Lead[]): Promise<void> {
  await saveLeadsToJson(getLeadsJsonPath(), leads);
  await saveLeadsToCsv(getLeadsCsvPath(), leads);
}

async function persistToPaths(leads: Lead[], jsonPath: string, csvPath: string): Promise<void> {
  await saveLeadsToJson(jsonPath, leads);
  await saveLeadsToCsv(csvPath, leads);
}

async function updateLeadById(
  leadId: string,
  updater: (lead: Lead) => Lead,
  jsonPath: string,
  csvPath: string
): Promise<Lead> {
  const leads = await loadLeadsFromJson(jsonPath);
  let found: Lead | null = null;

  const updated = leads.map((lead) => {
    if (lead.id !== leadId) return lead;
    found = updater(lead);
    return found;
  });

  if (!found) throw new LeadNotFoundError(leadId);
  await persistToPaths(updated, jsonPath, csvPath);
  return found;
}

function assertManualSendAllowed(lead: Lead): void {
  if (lead.doNotContact) {
    throw new ManualSendNotAllowedError('doNotContact=true のLeadは手動送信済みにできません');
  }
  if (lead.humanReviewStatus !== 'approved') {
    throw new ManualSendNotAllowedError('humanReviewStatus=approved のLeadのみ手動送信済みにできます');
  }
  if (lead.reviewStatus !== 'approve') {
    throw new ManualSendNotAllowedError('reviewStatus=approve のLeadのみ手動送信済みにできます');
  }
  if (lead.riskLevel === 'high') {
    throw new ManualSendNotAllowedError('riskLevel=high のLeadは手動送信済みにできません');
  }
}

export async function markManualSent(
  leadId: string,
  method: ManualSendMethod,
  sentAt: string = new Date().toISOString(),
  memo?: string,
  jsonPath: string = getLeadsJsonPath(),
  csvPath: string = getLeadsCsvPath()
): Promise<Lead> {
  return updateLeadById(leadId, (lead) => {
    assertManualSendAllowed(lead);
    return {
      ...lead,
      sendStatus: 'manual_sent',
      manualSentAt: sentAt,
      manualSendMethod: method,
      communicationMemo: memo?.trim() ? memo.trim() : lead.communicationMemo,
      updatedAt: new Date().toISOString(),
    };
  }, jsonPath, csvPath);
}

export async function markReplyStatus(
  leadId: string,
  replyStatus: ReplyStatus,
  memo?: string,
  jsonPath: string = getLeadsJsonPath(),
  csvPath: string = getLeadsCsvPath()
): Promise<Lead> {
  return updateLeadReplyManagement(
    leadId,
    {
      replyStatus,
      replySummary: memo?.trim() ? memo.trim() : undefined,
    },
    jsonPath,
    csvPath
  );
}

export async function updateLeadReplyManagement(
  leadId: string,
  update: ReplyManagementUpdate,
  jsonPath: string = getLeadsJsonPath(),
  csvPath: string = getLeadsCsvPath()
): Promise<Lead> {
  validateReplyManagementUpdatePayload(update);
  return updateLeadById(
    leadId,
    (lead) => {
      assertReplyManagementEligible(lead);
      const before = syncReplyAliasesForExport(lead);
      const afterBase = applyReplyManagementUpdate(lead, update);
      return appendReplyManagementDiffMemo(before, afterBase);
    },
    jsonPath,
    csvPath
  );
}

export async function markMeetingScheduled(
  leadId: string,
  memo?: string,
  jsonPath: string = getLeadsJsonPath(),
  csvPath: string = getLeadsCsvPath()
): Promise<Lead> {
  return updateLeadById(leadId, (lead) => ({
    ...lead,
    replyStatus: 'meeting_scheduled',
    dealStatus: lead.dealStatus === 'none' ? 'open' : lead.dealStatus,
    replyReceivedAt: new Date().toISOString(),
    replyMemo: memo?.trim() ? memo.trim() : lead.replyMemo,
    updatedAt: new Date().toISOString(),
  }), jsonPath, csvPath);
}

export async function markFollowUpNeeded(
  leadId: string,
  followUpDate: string,
  memo?: string,
  jsonPath: string = getLeadsJsonPath(),
  csvPath: string = getLeadsCsvPath()
): Promise<Lead> {
  return updateLeadById(leadId, (lead) => ({
    ...lead,
    replyStatus: 'follow_up_needed',
    followUpDate,
    followUpMemo: memo?.trim() ? memo.trim() : lead.followUpMemo,
    dealStatus: lead.dealStatus === 'none' ? 'open' : lead.dealStatus,
    updatedAt: new Date().toISOString(),
  }), jsonPath, csvPath);
}

export async function markNoReply(
  leadId: string,
  memo?: string,
  jsonPath: string = getLeadsJsonPath(),
  csvPath: string = getLeadsCsvPath()
): Promise<Lead> {
  return updateLeadById(leadId, (lead) => ({
    ...lead,
    replyStatus: 'no_reply',
    replyMemo: memo?.trim() ? memo.trim() : lead.replyMemo,
    updatedAt: new Date().toISOString(),
  }), jsonPath, csvPath);
}

export async function markDealWon(
  leadId: string,
  memo?: string,
  jsonPath: string = getLeadsJsonPath(),
  csvPath: string = getLeadsCsvPath()
): Promise<Lead> {
  return updateLeadById(leadId, (lead) => ({
    ...lead,
    dealStatus: 'won',
    outcomeMemo: memo?.trim() ? memo.trim() : lead.outcomeMemo,
    updatedAt: new Date().toISOString(),
  }), jsonPath, csvPath);
}

export async function markDealLost(
  leadId: string,
  memo?: string,
  jsonPath: string = getLeadsJsonPath(),
  csvPath: string = getLeadsCsvPath()
): Promise<Lead> {
  return updateLeadById(leadId, (lead) => ({
    ...lead,
    dealStatus: 'lost',
    outcomeMemo: memo?.trim() ? memo.trim() : lead.outcomeMemo,
    updatedAt: new Date().toISOString(),
  }), jsonPath, csvPath);
}

export async function markDealStatus(
  leadId: string,
  dealStatus: DealStatus,
  memo?: string,
  jsonPath: string = getLeadsJsonPath(),
  csvPath: string = getLeadsCsvPath()
): Promise<Lead> {
  return updateLeadById(leadId, (lead) => ({
    ...lead,
    dealStatus,
    outcomeMemo: memo?.trim() ? memo.trim() : lead.outcomeMemo,
    updatedAt: new Date().toISOString(),
  }), jsonPath, csvPath);
}

export async function updateCommunicationMemo(
  leadId: string,
  memo: string,
  jsonPath: string = getLeadsJsonPath(),
  csvPath: string = getLeadsCsvPath()
): Promise<Lead> {
  return updateLeadById(leadId, (lead) => ({
    ...lead,
    communicationMemo: memo,
    updatedAt: new Date().toISOString(),
  }), jsonPath, csvPath);
}

