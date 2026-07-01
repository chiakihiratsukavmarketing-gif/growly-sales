import type { Lead } from '../types/lead.js';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { DAILY_30_TARGET } from './daily30CandidateStatus.js';
import { todayBatchIdJst } from './daily30AreaConfig.js';
import { isDaily30ReadyForDraftImportCandidate } from './getDaily30DraftImportBlockReason.js';
import { selectGmailDraftTabLeads } from '../outreach/outreachPolicy.js';

export interface Daily30DraftPipelineProgress {
  batchId: string;
  readyForDraftCount: number;
  leadsImportPendingCount: number;
  gmailDraftTabVisibleCount: number;
  humanReviewPendingCount: number;
  gmailDraftCreatedCount: number;
  sendRecordPendingCount: number;
  todayCollectedCount: number;
  todayTarget: number;
  todayProgressLabel: string;
}

function isDaily30Lead(lead: Lead): boolean {
  return lead.source === 'daily30' || Boolean(lead.daily30PipelineStatus);
}

function isTodayBatchCandidate(c: ExternalLeadCandidate, batchId: string): boolean {
  return c.collectionBatchId === batchId;
}

export function buildDaily30DraftPipelineProgress(
  candidates: ExternalLeadCandidate[],
  leads: Lead[],
  batchId = todayBatchIdJst()
): Daily30DraftPipelineProgress {
  const todayCandidates = candidates.filter((c) => isTodayBatchCandidate(c, batchId));
  const readyForDraftExternal = todayCandidates.filter(
    (c) => c.pipelineStatus === 'ready_for_draft'
  );
  const importPending = todayCandidates.filter(isDaily30ReadyForDraftImportCandidate);

  const daily30Leads = leads.filter(isDaily30Lead);
  const tabLeads = selectGmailDraftTabLeads(leads).filter(isDaily30Lead);

  const humanReviewPending = daily30Leads.filter(
    (l) =>
      l.daily30PipelineStatus === 'ready_for_draft' &&
      l.humanReviewStatus === 'pending' &&
      l.sendStatus === 'not_sent'
  ).length;

  const gmailDraftCreated = daily30Leads.filter(
    (l) => l.gmailDraftStatus === 'draft_created'
  ).length;

  const sendRecordPending = daily30Leads.filter(
    (l) =>
      l.gmailDraftStatus === 'draft_created' &&
      l.sendStatus === 'not_sent'
  ).length;

  const todayCollected = todayCandidates.filter(
    (c) => c.pipelineStatus !== 'duplicate' && c.pipelineStatus !== 'excluded'
  ).length;

  const importedToday = daily30Leads.filter((l) => l.collectionBatchId === batchId).length;

  return {
    batchId,
    readyForDraftCount: readyForDraftExternal.length,
    leadsImportPendingCount: importPending.length,
    gmailDraftTabVisibleCount: tabLeads.length,
    humanReviewPendingCount: humanReviewPending,
    gmailDraftCreatedCount: gmailDraftCreated,
    sendRecordPendingCount: sendRecordPending,
    todayCollectedCount: todayCollected,
    todayTarget: DAILY_30_TARGET,
    todayProgressLabel: `収集 ${todayCollected}/${DAILY_30_TARGET} · 取り込み ${importedToday} · 下書き作成 ${gmailDraftCreated}`,
  };
}
