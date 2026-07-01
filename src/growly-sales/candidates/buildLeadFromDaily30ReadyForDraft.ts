import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { Lead } from '../types/lead.js';
import { buildLeadStubFromExternalCandidate } from './buildLeadStubFromExternalCandidate.js';
import { resolveEmailSourceFromCandidate } from './resolveEmailSourceDisplay.js';

/** ready_for_draft 候補から leads.json 用 Lead を構築（まだ保存しない） */
export function buildLeadFromDaily30ReadyForDraft(
  candidate: ExternalLeadCandidate
): Lead {
  const stub = buildLeadStubFromExternalCandidate(candidate);
  const targetEmail = candidate.targetEmail!.trim().toLowerCase();
  const sourceUrl = candidate.emailCandidateSourceUrl!.trim();
  const emailSource = resolveEmailSourceFromCandidate(candidate);
  const now = new Date().toISOString();

  return {
    ...stub,
    emailCandidates: [targetEmail],
    emailCandidateSourceUrls: [sourceUrl],
    emailSourceUrl: emailSource.emailSourceUrl,
    emailSourceLabel: emailSource.emailSourceLabel,
    emailCandidateConfidence: 'medium',
    emailContactType: 'corporate',
    emailSubject: candidate.generatedEmailSubject!.trim(),
    emailBody: candidate.generatedEmailBody!.trim(),
    customHook: candidate.generatedCustomHook?.trim() ?? '',
    customHookReason: candidate.generatedCustomHookReason?.trim() ?? '',
    reviewStatus: 'approve',
    reviewComment: 'Daily 30 品質チェック通過（取り込み時再確認済）',
    nextAction: '下書き候補タブで内容確認 → 承認 → CREATE_DRAFTS',
    collectionStatus: 'collected',
    humanReviewStatus: 'pending',
    sendStatus: 'not_sent',
    gmailDraftStatus: 'none',
    gmailDraftId: null,
    gmailDraftCreatedAt: null,
    gmailDraftError: '',
    replyStatus: 'none',
    daily30PipelineStatus: 'ready_for_draft',
    source: 'daily30',
    createdAt: now,
    updatedAt: now,
  };
}
