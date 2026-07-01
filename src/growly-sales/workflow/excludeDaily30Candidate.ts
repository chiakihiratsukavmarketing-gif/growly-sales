import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import {
  loadExternalCandidatesFromJson,
  persistExternalCandidates,
  saveExternalCandidatesToJson,
} from '../storage/externalCandidatesRepository.js';
import { isGcsStorageBackend } from '../config/storageBackend.js';

export class Daily30CandidateExcludeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Daily30CandidateExcludeError';
  }
}

export function isDaily30HumanExcludedCandidate(candidate: ExternalLeadCandidate): boolean {
  return candidate.importStatus === 'excluded' || candidate.excludedBy === 'human';
}

/** 通常の候補一覧に表示する候補（人間除外済みは非表示） */
export function filterDaily30VisibleCandidates(
  candidates: ExternalLeadCandidate[]
): ExternalLeadCandidate[] {
  return candidates.filter((c) => !isDaily30HumanExcludedCandidate(c));
}

export async function excludeDaily30Candidate(
  externalCandidateId: string,
  reason: string,
  jsonPath?: string
): Promise<ExternalLeadCandidate> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Daily30CandidateExcludeError('除外理由を入力してください');
  }

  const candidates = await loadExternalCandidatesFromJson(jsonPath);
  const index = candidates.findIndex((c) => c.externalCandidateId === externalCandidateId);
  if (index < 0) {
    throw new Daily30CandidateExcludeError(`外部候補が見つかりません: ${externalCandidateId}`);
  }

  const candidate = candidates[index];
  if (candidate.importStatus === 'imported') {
    throw new Daily30CandidateExcludeError(
      'leads.json 取り込み済みの候補は除外できません（既存Leadは削除されません）'
    );
  }
  if (isDaily30HumanExcludedCandidate(candidate)) {
    throw new Daily30CandidateExcludeError('この候補は既に除外済みです');
  }

  const now = new Date().toISOString();
  const updated: ExternalLeadCandidate = {
    ...candidate,
    pipelineStatus: 'excluded',
    importStatus: 'excluded',
    humanReviewStatus: 'rejected',
    excludedAt: now,
    excludedReason: trimmedReason,
    excludedBy: 'human',
    updatedAt: now,
    notes: [candidate.notes, `human_excluded: ${trimmedReason}`].filter(Boolean).join(' / '),
  };
  candidates[index] = updated;

  if (isGcsStorageBackend() && !jsonPath) {
    await saveExternalCandidatesToJson(candidates);
  } else if (jsonPath) {
    await saveExternalCandidatesToJson(candidates, jsonPath);
  } else {
    await persistExternalCandidates(candidates);
  }
  return updated;
}
