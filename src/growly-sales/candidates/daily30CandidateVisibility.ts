import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';

/** 人間が候補一覧から除外した候補（いずれか1つでも該当で非表示） */
export function isDaily30HumanExcludedCandidate(candidate: ExternalLeadCandidate): boolean {
  return (
    candidate.pipelineStatus === 'excluded' ||
    candidate.importStatus === 'excluded' ||
    candidate.humanReviewStatus === 'rejected' ||
    candidate.excludedBy === 'human' ||
    Boolean(candidate.excludedAt)
  );
}

/** 通常の候補カード一覧に表示する候補 */
export function isDaily30CandidateVisibleInLists(candidate: ExternalLeadCandidate): boolean {
  return !isDaily30HumanExcludedCandidate(candidate);
}

export function filterDaily30VisibleCandidates(
  candidates: ExternalLeadCandidate[]
): ExternalLeadCandidate[] {
  return candidates.filter(isDaily30CandidateVisibleInLists);
}

export function countDaily30HumanExcluded(candidates: ExternalLeadCandidate[]): number {
  return candidates.filter(isDaily30HumanExcludedCandidate).length;
}
