import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { isDaily30CopyPipelineTarget, isDaily30LeadApprovalPending } from './selectDaily30LeadCandidates.js';

export type Daily30WorkflowStatusLabel =
  | '未承認'
  | 'Lead化承認済み'
  | '営業文生成待ち'
  | '営業文生成済み'
  | '品質チェック済み'
  | '下書き候補取り込み待ち'
  | '下書き候補取り込み済み'
  | '要確認'
  | '除外';

export type Daily30WorkflowStatusVariant =
  | 'muted'
  | 'pending'
  | 'approved'
  | 'ready'
  | 'warning'
  | 'excluded';

export interface Daily30WorkflowStatus {
  label: Daily30WorkflowStatusLabel;
  variant: Daily30WorkflowStatusVariant;
}

/** UI表示用: importStatus / pipelineStatus / copy 生成状態から導線ラベルを解決 */
export function resolveDaily30WorkflowStatus(
  candidate: ExternalLeadCandidate
): Daily30WorkflowStatus {
  if (candidate.importStatus === 'imported') {
    return { label: '下書き候補取り込み済み', variant: 'ready' };
  }
  if (candidate.pipelineStatus === 'excluded') {
    return { label: '除外', variant: 'excluded' };
  }
  if (candidate.pipelineStatus === 'ready_for_draft' && candidate.copyGeneratedAt) {
    return { label: '下書き候補取り込み待ち', variant: 'ready' };
  }
  if (candidate.pipelineStatus === 'ready_for_draft') {
    return { label: '品質チェック済み', variant: 'ready' };
  }
  if (candidate.pipelineStatus === 'needs_review') {
    return { label: '要確認', variant: 'warning' };
  }
  if (candidate.copyGeneratedAt) {
    return { label: '営業文生成済み', variant: 'approved' };
  }
  if (isDaily30CopyPipelineTarget(candidate)) {
    return { label: '営業文生成待ち', variant: 'pending' };
  }
  if (candidate.importStatus === 'approved_for_lead') {
    return { label: 'Lead化承認済み', variant: 'approved' };
  }
  if (isDaily30LeadApprovalPending(candidate)) {
    return { label: '未承認', variant: 'muted' };
  }
  return { label: '未承認', variant: 'muted' };
}

export interface Daily30LeadCopyWorkflowCounts {
  approvalPending: number;
  approvedLead: number;
  copyPending: number;
  copyGenerated: number;
  qualityPassed: number;
  readyForDraftImport: number;
  imported: number;
  needsReview: number;
}

export function countDaily30LeadCopyWorkflow(
  candidates: ExternalLeadCandidate[]
): Daily30LeadCopyWorkflowCounts {
  const approvedLead = candidates.filter((c) => c.importStatus === 'approved_for_lead');
  return {
    approvalPending: candidates.filter(isDaily30LeadApprovalPending).length,
    approvedLead: approvedLead.length,
    copyPending: candidates.filter(isDaily30CopyPipelineTarget).length,
    copyGenerated: approvedLead.filter((c) => Boolean(c.copyGeneratedAt)).length,
    qualityPassed: candidates.filter(
      (c) => c.pipelineStatus === 'ready_for_draft' && !c.failureReason
    ).length,
    readyForDraftImport: candidates.filter(
      (c) => c.pipelineStatus === 'ready_for_draft' && c.importStatus === 'approved_for_lead'
    ).length,
    imported: candidates.filter((c) => c.importStatus === 'imported').length,
    needsReview: candidates.filter((c) => c.pipelineStatus === 'needs_review').length,
  };
}
