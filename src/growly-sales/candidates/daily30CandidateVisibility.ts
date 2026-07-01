import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';

/** 人間が候補一覧から除外した候補 */
export function isDaily30HumanExcludedCandidate(candidate: ExternalLeadCandidate): boolean {
  return (
    candidate.importStatus === 'excluded' ||
    candidate.pipelineStatus === 'excluded' ||
    candidate.excludedBy === 'human' ||
    (candidate.humanReviewStatus === 'rejected' && Boolean(candidate.excludedAt))
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
