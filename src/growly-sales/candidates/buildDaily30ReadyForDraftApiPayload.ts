import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { Lead } from '../types/lead.js';
import {
  buildDaily30DraftPipelineProgress,
  type Daily30DraftPipelineProgress,
} from './buildDaily30DraftPipelineProgress.js';
import { countDaily30LeadCopyWorkflow } from './resolveDaily30WorkflowStatus.js';
import {
  getDaily30DraftImportBlockReason,
} from './getDaily30DraftImportBlockReason.js';
import { selectDaily30ReadyForDraftImportCandidates } from '../workflow/importDaily30DraftCandidates.js';
import { isDaily30LeadApproved } from './selectDaily30LeadCandidates.js';

export interface Daily30ReadyForDraftItemPayload {
  candidate: ExternalLeadCandidate;
  importBlockReason: string | null;
  qualityCheckPassed: boolean;
}

export interface Daily30ReadyForDraftApiPayload {
  ok: boolean;
  readyForDraftCandidates: ExternalLeadCandidate[];
  generatedCopyCandidates: ExternalLeadCandidate[];
  approvedLeadCandidates: ExternalLeadCandidate[];
  items: Daily30ReadyForDraftItemPayload[];
  counts: {
    readyForDraft: number;
    generatedCopy: number;
    approvedLead: number;
    importPending: number;
    qualityCheckPassed: number;
    warnings: number;
  };
  warnings: string[];
  draftPipeline: Daily30DraftPipelineProgress;
  generatedAt: string;
  note: string;
}

export function buildDaily30ReadyForDraftApiPayload(
  candidates: ExternalLeadCandidate[],
  leads: Lead[],
  batchId?: string
): Daily30ReadyForDraftApiPayload {
  const readyForDraft = selectDaily30ReadyForDraftImportCandidates(candidates);
  const generatedCopyCandidates = candidates.filter(
    (c) => c.importStatus === 'approved_for_lead' && Boolean(c.copyGeneratedAt)
  );
  const approvedLeadCandidates = candidates.filter(isDaily30LeadApproved);
  const workflowCounts = countDaily30LeadCopyWorkflow(candidates);

  const items: Daily30ReadyForDraftItemPayload[] = readyForDraft.map((candidate) => ({
    candidate,
    importBlockReason: getDaily30DraftImportBlockReason(candidate, leads, candidates),
    qualityCheckPassed: !candidate.failureReason,
  }));

  const warnings: string[] = [];
  for (const item of items) {
    if (item.importBlockReason) {
      warnings.push(`${item.candidate.companyName}: ${item.importBlockReason}`);
    } else if (!item.qualityCheckPassed) {
      warnings.push(`${item.candidate.companyName}: 品質チェック要確認`);
    }
  }
  const needsReview = candidates.filter((c) => c.pipelineStatus === 'needs_review');
  for (const c of needsReview) {
    warnings.push(`${c.companyName}: needs_review — ${c.failureReason ?? '要確認'}`);
  }

  const importPending = items.filter((i) => !i.importBlockReason).length;

  return {
    ok: true,
    readyForDraftCandidates: readyForDraft,
    generatedCopyCandidates,
    approvedLeadCandidates,
    items,
    counts: {
      readyForDraft: readyForDraft.length,
      generatedCopy: generatedCopyCandidates.length,
      approvedLead: workflowCounts.approvedLead,
      importPending,
      qualityCheckPassed: items.filter((i) => i.qualityCheckPassed).length,
      warnings: warnings.length,
    },
    warnings,
    draftPipeline: buildDaily30DraftPipelineProgress(candidates, leads, batchId),
    generatedAt: new Date().toISOString(),
    note: 'ready_for_draft 表示・確認用。Gmail API は呼びません。取り込みは IMPORT_DAILY_30_DRAFT_CANDIDATES ゲートのみ。',
  };
}
