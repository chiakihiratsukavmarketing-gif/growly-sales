import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { isDaily30HumanExcludedCandidate } from '../candidates/daily30CandidateVisibility.js';

/** 通常一覧に出さない候補（サーバー保存済み + セッション即時除外） */
export function filterDaily30UiListCandidates(
  candidates: ExternalLeadCandidate[],
  sessionExcludedIds?: ReadonlySet<string>
): ExternalLeadCandidate[] {
  return candidates.filter((c) => {
    if (isDaily30HumanExcludedCandidate(c)) return false;
    if (sessionExcludedIds?.has(c.externalCandidateId)) return false;
    return true;
  });
}

export function removeCandidateFromArrays<T extends { externalCandidateId: string }>(
  candidateId: string,
  ...arrays: T[][]
): T[][] {
  return arrays.map((arr) => arr.filter((c) => c.externalCandidateId !== candidateId));
}
