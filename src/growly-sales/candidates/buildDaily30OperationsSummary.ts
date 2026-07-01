import type { Lead } from '../types/lead.js';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { todayBatchIdJst } from './daily30AreaConfig.js';
import { buildDaily30Dashboard } from './buildDaily30Dashboard.js';
import { buildDaily30DraftPipelineProgress } from './buildDaily30DraftPipelineProgress.js';
import {
  DAILY_30_DAILY_PROCEDURE,
  DAILY_30_GATES,
  DAILY_30_SAFETY_RULES,
} from './daily30OperationsConfig.js';
import { selectGmailDraftTabLeads } from '../outreach/outreachPolicy.js';

export type Daily30ChecklistStatus = 'complete' | 'current' | 'pending';

export interface Daily30ChecklistItem {
  id: string;
  label: string;
  gate?: string;
  status: Daily30ChecklistStatus;
  hint?: string;
}

export interface Daily30OperationsSummary {
  batchId: string;
  target: number;
  collectedCount: number;
  emailFoundCount: number;
  leadApprovalPendingCount: number;
  copyPendingCount: number;
  readyForDraftCount: number;
  leadsImportPendingCount: number;
  gmailDraftTabVisibleCount: number;
  humanReviewPendingCount: number;
  gmailDraftCreatedCount: number;
  sendRecordPendingCount: number;
  sentTodayCount: number;
  shortfall: number;
  nextAction: string;
  checklist: Daily30ChecklistItem[];
  gates: typeof DAILY_30_GATES;
  safetyRules: typeof DAILY_30_SAFETY_RULES;
  dailyProcedure: typeof DAILY_30_DAILY_PROCEDURE;
}

function isTodayDaily30Lead(lead: Lead, batchId: string): boolean {
  return (
    (lead.source === 'daily30' || Boolean(lead.daily30PipelineStatus)) &&
    lead.collectionBatchId === batchId
  );
}

function isTodayAccepted(c: ExternalLeadCandidate, batchId: string): boolean {
  return (
    c.collectionBatchId === batchId &&
    c.pipelineStatus !== 'duplicate' &&
    c.pipelineStatus !== 'excluded' &&
    c.importStatus !== 'duplicate'
  );
}

function markChecklistStatuses(
  items: Omit<Daily30ChecklistItem, 'status'>[],
  completeFlags: boolean[]
): Daily30ChecklistItem[] {
  const firstIncomplete = completeFlags.findIndex((done) => !done);
  return items.map((item, index) => {
    const complete = completeFlags[index] ?? false;
    let status: Daily30ChecklistStatus = 'pending';
    if (complete) status = 'complete';
    else if (index === firstIncomplete) status = 'current';
    return { ...item, status };
  });
}

function resolveOperationsNextAction(flags: {
  shortfall: number;
  leadApprovalPending: number;
  copyPending: number;
  importPending: number;
  humanReviewPending: number;
  sendRecordPending: number;
  gmailDraftCreated: number;
  importedToday: number;
}): string {
  if (flags.shortfall > 0) return 'FETCH_DAILY_30 で候補収集を実行';
  if (flags.leadApprovalPending > 0) return 'email_found 候補を確認し Lead化承認';
  if (flags.copyPending > 0) return 'GENERATE_DAILY_30_COPY で営業文生成・品質チェック';
  if (flags.importPending > 0) return 'ready_for_draft を下書き候補として leads.json に取り込み';
  if (flags.humanReviewPending > 0) return '下書き候補タブで内容確認・承認';
  if (flags.gmailDraftCreated < flags.importedToday) return 'CREATE_DRAFTS で Gmail 下書き作成';
  if (flags.sendRecordPending > 0) return 'Gmail で手動送信後、送信記録タブで記録';
  return '返信管理で返信状況を確認（本日分は完了または追加収集は任意）';
}

export function buildDaily30OperationsSummary(
  candidates: ExternalLeadCandidate[],
  leads: Lead[],
  batchId = todayBatchIdJst()
): Daily30OperationsSummary {
  const dashboard = buildDaily30Dashboard(candidates, leads, batchId);
  const draftPipeline = buildDaily30DraftPipelineProgress(candidates, leads, batchId);
  const todayAccepted = candidates.filter((c) => isTodayAccepted(c, batchId));

  const copyPendingCount = todayAccepted.filter(
    (c) => c.importStatus === 'approved_for_lead' && c.pipelineStatus === 'ready_for_copy'
  ).length;

  const todayDaily30Leads = leads.filter((l) => isTodayDaily30Lead(l, batchId));
  const importedTodayCount = todayDaily30Leads.length;

  const humanReviewPendingToday = todayDaily30Leads.filter(
    (l) => l.humanReviewStatus === 'pending' && l.sendStatus === 'not_sent'
  ).length;

  const sentTodayCount = todayDaily30Leads.filter(
    (l) => l.sendStatus === 'sent' || l.sendStatus === 'manual_sent'
  ).length;

  const gmailDraftTabVisibleCount = selectGmailDraftTabLeads(leads).filter((l) =>
    isTodayDaily30Lead(l, batchId)
  ).length;

  const fetchComplete = dashboard.collectedToday > 0;
  const emailFoundReviewComplete = dashboard.emailFoundCount === 0;
  const leadApproveComplete = dashboard.leadApprovalPendingCount === 0;
  const generateComplete = copyPendingCount === 0;
  const readyForDraftReviewComplete =
    dashboard.readyForDraftCount === 0 || draftPipeline.leadsImportPendingCount === 0;
  const importComplete = draftPipeline.leadsImportPendingCount === 0;
  const humanApproveComplete = humanReviewPendingToday === 0 || importedTodayCount === 0;
  const createDraftsComplete =
    importedTodayCount === 0 ||
    draftPipeline.gmailDraftCreatedCount >= importedTodayCount;
  const manualSendComplete = draftPipeline.sendRecordPendingCount === 0;
  const sendRecordComplete =
    importedTodayCount === 0 || sentTodayCount >= draftPipeline.gmailDraftCreatedCount;

  const checklistItems = markChecklistStatuses(
    [
      { id: 'fetch', label: 'FETCH_DAILY_30 で候補収集', gate: 'FETCH_DAILY_30' },
      { id: 'email_found', label: 'email_found 候補を確認' },
      { id: 'lead_approve', label: 'Lead化承認' },
      {
        id: 'generate_copy',
        label: 'GENERATE_DAILY_30_COPY で営業文生成・品質チェック',
        gate: 'GENERATE_DAILY_30_COPY',
      },
      { id: 'ready_for_draft', label: 'ready_for_draft 候補を確認' },
      {
        id: 'import',
        label: 'IMPORT_DAILY_30_DRAFT_CANDIDATES で leads.json に取り込み',
        gate: 'IMPORT_DAILY_30_DRAFT_CANDIDATES',
        hint: '1件ずつの取り込みはゲート不要',
      },
      { id: 'human_approve', label: '下書き候補タブで内容確認・承認' },
      { id: 'create_drafts', label: 'CREATE_DRAFTS で Gmail 下書き作成', gate: 'CREATE_DRAFTS' },
      { id: 'manual_send', label: 'Gmail 画面で人間が確認・手動送信' },
      { id: 'send_record', label: '送信記録タブで sent / manual_gmail 記録' },
      { id: 'reply', label: '返信管理で返信状況を確認' },
    ],
    [
      fetchComplete,
      emailFoundReviewComplete,
      leadApproveComplete,
      generateComplete,
      readyForDraftReviewComplete,
      importComplete,
      humanApproveComplete,
      createDraftsComplete,
      manualSendComplete,
      sendRecordComplete,
      false,
    ]
  );

  const nextAction = resolveOperationsNextAction({
    shortfall: dashboard.shortfall,
    leadApprovalPending: dashboard.leadApprovalPendingCount,
    copyPending: copyPendingCount,
    importPending: draftPipeline.leadsImportPendingCount,
    humanReviewPending: humanReviewPendingToday,
    sendRecordPending: draftPipeline.sendRecordPendingCount,
    gmailDraftCreated: draftPipeline.gmailDraftCreatedCount,
    importedToday: importedTodayCount,
  });

  return {
    batchId,
    target: dashboard.target,
    collectedCount: dashboard.collectedToday,
    emailFoundCount: dashboard.emailFoundCount,
    leadApprovalPendingCount: dashboard.leadApprovalPendingCount,
    copyPendingCount,
    readyForDraftCount: dashboard.readyForDraftCount,
    leadsImportPendingCount: draftPipeline.leadsImportPendingCount,
    gmailDraftTabVisibleCount,
    humanReviewPendingCount: humanReviewPendingToday,
    gmailDraftCreatedCount: draftPipeline.gmailDraftCreatedCount,
    sendRecordPendingCount: draftPipeline.sendRecordPendingCount,
    sentTodayCount,
    shortfall: dashboard.shortfall,
    nextAction,
    checklist: checklistItems,
    gates: DAILY_30_GATES,
    safetyRules: DAILY_30_SAFETY_RULES,
    dailyProcedure: DAILY_30_DAILY_PROCEDURE,
  };
}
