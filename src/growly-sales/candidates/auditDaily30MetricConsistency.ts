import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { Lead } from '../types/lead.js';
import type { Daily30CloudRunStateEntry } from '../storage/daily30CloudRunState.js';
import { buildDaily30Dashboard } from './buildDaily30Dashboard.js';
import { isDaily30LeadApprovalPending } from './selectDaily30LeadCandidates.js';
import { isDaily30ReadyForDraftImportCandidate } from './getDaily30DraftImportBlockReason.js';
import {
  countDaily30HumanExcluded,
  isDaily30CandidateVisibleInLists,
} from './daily30CandidateVisibility.js';
import { buildSalesDashboard } from '../analytics/buildSalesDashboard.js';

export interface Daily30MetricAuditResult {
  ok: boolean;
  issues: string[];
}

/** ダッシュボード集計と生データの件数が一致するか監査 */
export function auditDaily30MetricConsistency(
  candidates: ExternalLeadCandidate[],
  leads: Lead[],
  batchId: string,
  cloudRunEntry: Daily30CloudRunStateEntry | null = null
): Daily30MetricAuditResult {
  const issues: string[] = [];
  const dashboard = buildDaily30Dashboard(candidates, leads, batchId, cloudRunEntry);
  const todayAll = candidates.filter((c) => c.collectionBatchId === batchId);

  const pendingManual = todayAll.filter(isDaily30LeadApprovalPending).length;
  if (pendingManual !== dashboard.leadApprovalPendingCount) {
    issues.push(
      `leadApprovalPendingCount: dashboard=${dashboard.leadApprovalPendingCount} manual=${pendingManual}`
    );
  }

  const copyManual = todayAll.filter(
    (c) => isDaily30CandidateVisibleInLists(c) && Boolean(c.copyGeneratedAt)
  ).length;
  if (copyManual !== dashboard.copyGeneratedCount) {
    issues.push(
      `copyGeneratedCount: dashboard=${dashboard.copyGeneratedCount} manual=${copyManual}`
    );
  }

  const draftManual = todayAll.filter(isDaily30ReadyForDraftImportCandidate).length;
  if (draftManual !== dashboard.draftImportPendingCount) {
    issues.push(
      `draftImportPendingCount: dashboard=${dashboard.draftImportPendingCount} manual=${draftManual}`
    );
  }

  const excludedManual = countDaily30HumanExcluded(todayAll);
  if (excludedManual !== dashboard.humanExcludedCount) {
    issues.push(
      `humanExcludedCount: dashboard=${dashboard.humanExcludedCount} manual=${excludedManual}`
    );
  }

  const excludedInPending = todayAll.filter(
    (c) => isDaily30LeadApprovalPending(c) && !isDaily30CandidateVisibleInLists(c)
  ).length;
  if (excludedInPending > 0) {
    issues.push(`excluded candidates still in approval pending: ${excludedInPending}`);
  }

  const excludedInDraft = todayAll.filter(
    (c) => isDaily30ReadyForDraftImportCandidate(c) && !isDaily30CandidateVisibleInLists(c)
  ).length;
  if (excludedInDraft > 0) {
    issues.push(`excluded candidates still in draft import pending: ${excludedInDraft}`);
  }

  if (cloudRunEntry && cloudRunEntry.batchId === batchId) {
    if (dashboard.emailFoundAtCollection !== cloudRunEntry.emailFound) {
      issues.push('emailFoundAtCollection must match cloud run state emailFound');
    }
  }

  const sales = buildSalesDashboard(leads);
  const draftNotSent = leads.filter(
    (l) => l.gmailDraftStatus === 'draft_created' && l.sendStatus === 'not_sent'
  ).length;
  const countedAsSent = sales.metrics.manualSentCount + sales.metrics.initialEmailSentCount;
  const actualSent = leads.filter(
    (l) => l.sendStatus === 'manual_sent' || l.sendStatus === 'sent'
  ).length;
  if (countedAsSent !== actualSent) {
    issues.push(`sent count mismatch: metrics=${countedAsSent} leads=${actualSent}`);
  }
  if (draftNotSent > 0 && sales.metrics.manualSentCount === leads.length) {
    issues.push('draft_created not_sent must not inflate sent count');
  }

  return { ok: issues.length === 0, issues };
}
