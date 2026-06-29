import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { Lead } from '../types/lead.js';
import { findDuplicateReason, leadMatchesCandidate } from '../adapters/dedupeExternalCandidates.js';
import { verifyLeadEmailBodyForGmailDraft } from '../integrations/gmail/gmailDraftLeadValidation.js';
import { isAllowedCorporateEmail, isFreeEmailDomain, looksLikePersonalEmail } from '../safety/contactPolicy.js';
import { buildLeadFromDaily30ReadyForDraft } from './buildLeadFromDaily30ReadyForDraft.js';

/** ready_for_draft 取り込み対象の基本条件（Lead 重複チェック前） */
export function isDaily30ReadyForDraftImportCandidate(
  candidate: ExternalLeadCandidate
): boolean {
  if (candidate.importStatus === 'imported') return false;
  if (candidate.pipelineStatus !== 'ready_for_draft') return false;
  if (candidate.importStatus !== 'approved_for_lead') return false;
  if (!candidate.generatedEmailSubject?.trim()) return false;
  if (!candidate.generatedEmailBody?.trim()) return false;
  if (!candidate.targetEmail?.trim()) return false;
  if (!candidate.emailCandidateSourceUrl?.trim()) return false;
  return true;
}

/** 取り込み不可理由。null なら取り込み可 */
export function getDaily30DraftImportBlockReason(
  candidate: ExternalLeadCandidate,
  existingLeads: Lead[],
  allCandidates: ExternalLeadCandidate[]
): string | null {
  if (!isDaily30ReadyForDraftImportCandidate(candidate)) {
    if (candidate.importStatus === 'imported') return '既に leads.json へ取り込み済み';
    if (candidate.pipelineStatus === 'needs_review') return 'needs_review（品質チェック未通過）';
    if (candidate.pipelineStatus === 'excluded') return 'excluded';
    if (candidate.pipelineStatus === 'duplicate') return 'duplicate';
    if (candidate.pipelineStatus !== 'ready_for_draft') {
      return `pipelineStatus=${candidate.pipelineStatus}（ready_for_draft のみ取り込み可）`;
    }
    if (candidate.importStatus !== 'approved_for_lead') {
      return `importStatus=${candidate.importStatus}（approved_for_lead が必要）`;
    }
    if (!candidate.generatedEmailSubject?.trim()) return 'generatedEmailSubject なし';
    if (!candidate.generatedEmailBody?.trim()) return 'generatedEmailBody なし';
    if (!candidate.targetEmail?.trim()) return 'targetEmail なし';
    if (!candidate.emailCandidateSourceUrl?.trim()) return 'emailCandidateSourceUrl なし';
    return '取り込み条件を満たしていません';
  }

  const email = candidate.targetEmail!.trim().toLowerCase();
  if (isFreeEmailDomain(email) || looksLikePersonalEmail(email)) {
    return '個人メールのため取り込み不可';
  }
  if (!isAllowedCorporateEmail(email)) {
    return '公開代表・問い合わせメールではない';
  }

  const dup = findDuplicateReason(candidate, existingLeads, allCandidates);
  if (dup) return dup;

  const matched = existingLeads.find((l) => leadMatchesCandidate(l, candidate));
  if (matched?.sendStatus === 'sent' || matched?.sendStatus === 'manual_sent') {
    return `送信済みLeadと重複: ${matched.companyName}`;
  }

  const lead = buildLeadFromDaily30ReadyForDraft(candidate);
  const bodyErrors = verifyLeadEmailBodyForGmailDraft(lead, lead.emailBody);
  if (bodyErrors.length > 0) {
    return `本文再確認NG: ${bodyErrors.join(' / ')}`;
  }

  return null;
}
