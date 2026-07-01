import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { findDuplicateReason } from '../adapters/dedupeExternalCandidates.js';
import { loadLeadsOptionalForDaily30 } from '../storage/loadLeadsOptionalForDaily30.js';
import {
  loadExternalCandidatesFromJson,
  persistExternalCandidates,
  saveExternalCandidatesToJson,
} from '../storage/externalCandidatesRepository.js';
import { isGcsStorageBackend } from '../config/storageBackend.js';
import { isDaily30LeadReviewCandidate } from '../candidates/selectDaily30LeadCandidates.js';

export async function approveExternalCandidateForLead(
  externalCandidateId: string
): Promise<ExternalLeadCandidate> {
  const candidates = await loadExternalCandidatesFromJson();
  const index = candidates.findIndex((c) => c.externalCandidateId === externalCandidateId);
  if (index < 0) throw new Error(`外部候補が見つかりません: ${externalCandidateId}`);

  const candidate = candidates[index];
  if (!isDaily30LeadReviewCandidate(candidate)) {
    if (candidate.importStatus === 'approved_for_lead') {
      throw new Error('既にLead化承認済みです');
    }
    throw new Error('Lead化承認の条件を満たしていません（email_found・必須フィールド・未取り込み）');
  }

  const existingLeads = await loadLeadsOptionalForDaily30();
  const dup = findDuplicateReason(candidate, existingLeads, candidates);
  if (dup) {
    throw new Error(dup);
  }

  const updated: ExternalLeadCandidate = {
    ...candidate,
    importStatus: 'approved_for_lead',
    pipelineStatus: 'ready_for_copy',
    humanReviewStatus: null,
    failureReason: null,
    updatedAt: new Date().toISOString(),
  };
  candidates[index] = updated;
  if (isGcsStorageBackend()) {
    await saveExternalCandidatesToJson(candidates);
  } else {
    await persistExternalCandidates(candidates);
  }
  return updated;
}
