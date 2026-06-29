import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { CANDIDATE_COLLECTION_TARGET } from './candidateCollectionConfig.js';

export function countTowardCollectionTarget(leadCount: number): {
  target: number;
  current: number;
  remaining: number;
} {
  const target = CANDIDATE_COLLECTION_TARGET;
  const current = leadCount;
  return {
    target,
    current,
    remaining: Math.max(0, target - current),
  };
}

function isImportableCandidate(candidate: ExternalLeadCandidate): boolean {
  return candidate.importStatus !== 'duplicate' && candidate.importStatus !== 'imported';
}

/** 新規取得分を残枠以内に制限（confidenceScore 降順） */
export function limitNewCandidates(
  candidates: ExternalLeadCandidate[],
  maxNew: number
): { accepted: ExternalLeadCandidate[]; deferred: ExternalLeadCandidate[] } {
  if (maxNew <= 0) {
    return { accepted: [], deferred: candidates };
  }

  const importable = candidates.filter(isImportableCandidate);
  const nonImportable = candidates.filter((c) => !isImportableCandidate(c));

  const sorted = [...importable].sort((a, b) => b.confidenceScore - a.confidenceScore);
  const acceptedImportable = sorted.slice(0, maxNew);
  const deferredImportable = sorted.slice(maxNew).map((c) => ({
    ...c,
    importStatus: 'skipped' as const,
    duplicateReason: c.duplicateReason || '30件上限のため今回の取得対象外',
    notes: [c.notes, 'deferred:collection_limit'].filter(Boolean).join('; '),
    updatedAt: new Date().toISOString(),
  }));

  return {
    accepted: [...nonImportable, ...acceptedImportable],
    deferred: deferredImportable,
  };
}
