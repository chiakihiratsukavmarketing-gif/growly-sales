import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import {
  isDaily30HumanExcludedCandidate,
} from '../candidates/daily30CandidateVisibility.js';
import {
  findDaily30CandidateIndexForExclude,
  type ExcludeCandidateLookupHints,
} from '../candidates/findDaily30CandidateForExclude.js';
import {
  loadExternalCandidatesFromJson,
  persistExternalCandidates,
  reloadExternalCandidatesFromStorage,
} from '../storage/externalCandidatesRepository.js';
import {
  getStorageBackend,
} from '../config/storageBackend.js';
import { logDaily30ExcludePersistAudit } from './logDaily30ExcludeAudit.js';

export {
  countDaily30HumanExcluded,
  filterDaily30VisibleCandidates,
  isDaily30CandidateVisibleInLists,
  isDaily30HumanExcludedCandidate,
} from '../candidates/daily30CandidateVisibility.js';

export class Daily30CandidateExcludeError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'Daily30CandidateExcludeError';
    this.code = code;
  }
}

export interface ExcludeDaily30CandidateResult {
  ok: true;
  persisted: true;
  storageBackend: 'local' | 'gcs';
  candidateId: string;
  pipelineStatus: ExternalLeadCandidate['pipelineStatus'];
  importStatus: ExternalLeadCandidate['importStatus'];
  humanReviewStatus: ExternalLeadCandidate['humanReviewStatus'];
  excludedBy: 'human';
  excludedReason: string;
  excludedAt: string;
  candidate: ExternalLeadCandidate;
}

export interface ExcludeDaily30CandidateFailure {
  ok: false;
  errorCode: 'EXCLUDE_PERSIST_FAILED' | 'EXCLUDE_NOT_FOUND' | 'EXCLUDE_INVALID';
  safeMessage: string;
}

async function verifyExcludedCandidatePersisted(
  candidateId: string
): Promise<ExternalLeadCandidate> {
  const reloaded = await reloadExternalCandidatesFromStorage();
  const found = reloaded.find((c) => c.externalCandidateId === candidateId);
  if (!found) {
    throw new Daily30CandidateExcludeError(
      '保存後に候補が見つかりませんでした',
      'EXCLUDE_PERSIST_FAILED'
    );
  }
  if (!isDaily30HumanExcludedCandidate(found)) {
    throw new Daily30CandidateExcludeError(
      '除外状態が保存されていません',
      'EXCLUDE_PERSIST_FAILED'
    );
  }
  return found;
}

export async function excludeDaily30Candidate(
  externalCandidateId: string,
  reason: string,
  options?: { jsonPath?: string; lookupHints?: ExcludeCandidateLookupHints }
): Promise<ExcludeDaily30CandidateResult> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Daily30CandidateExcludeError('除外理由を入力してください', 'EXCLUDE_INVALID');
  }

  const jsonPath = options?.jsonPath;
  const storageBackend = getStorageBackend();
  const candidates = await loadExternalCandidatesFromJson(jsonPath);
  const candidateCountBefore = candidates.length;
  const index = findDaily30CandidateIndexForExclude(
    candidates,
    externalCandidateId,
    options?.lookupHints
  );
  if (index < 0) {
    throw new Daily30CandidateExcludeError(
      `外部候補が見つかりません: ${externalCandidateId}`,
      'EXCLUDE_NOT_FOUND'
    );
  }

  const candidate = candidates[index];
  if (candidate.importStatus === 'imported') {
    throw new Daily30CandidateExcludeError(
      'leads.json 取り込み済みの候補は除外できません（既存Leadは削除されません）',
      'EXCLUDE_INVALID'
    );
  }
  if (isDaily30HumanExcludedCandidate(candidate)) {
    throw new Daily30CandidateExcludeError('この候補は既に除外済みです', 'EXCLUDE_INVALID');
  }

  const beforePipelineStatus = candidate.pipelineStatus;
  const beforeImportStatus = candidate.importStatus;
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

  if (jsonPath) {
    const { saveExternalCandidatesToJson } = await import('../storage/externalCandidatesRepository.js');
    await saveExternalCandidatesToJson(candidates, jsonPath);
  } else {
    await persistExternalCandidates(candidates);
  }

  let verified: ExternalLeadCandidate;
  try {
    verified =
      jsonPath != null
        ? (await loadExternalCandidatesFromJson(jsonPath)).find(
            (c) => c.externalCandidateId === updated.externalCandidateId
          )!
        : await verifyExcludedCandidatePersisted(updated.externalCandidateId);
    if (!verified || !isDaily30HumanExcludedCandidate(verified)) {
      throw new Daily30CandidateExcludeError(
        '除外状態の永続化確認に失敗しました',
        'EXCLUDE_PERSIST_FAILED'
      );
    }
  } catch (err) {
    logDaily30ExcludePersistAudit({
      candidateId: updated.externalCandidateId,
      companyName: updated.companyName,
      storageBackend,
      candidateCountBefore,
      candidateCountAfter: candidates.length,
      beforePipelineStatus,
      beforeImportStatus,
      afterPipelineStatus: updated.pipelineStatus,
      afterImportStatus: updated.importStatus,
      persisted: false,
    });
    if (err instanceof Daily30CandidateExcludeError) throw err;
    throw new Daily30CandidateExcludeError(
      '除外状態の永続化確認に失敗しました',
      'EXCLUDE_PERSIST_FAILED'
    );
  }

  logDaily30ExcludePersistAudit({
    candidateId: verified.externalCandidateId,
    companyName: verified.companyName,
    storageBackend,
    candidateCountBefore,
    candidateCountAfter: candidates.length,
    beforePipelineStatus,
    beforeImportStatus,
    afterPipelineStatus: verified.pipelineStatus,
    afterImportStatus: verified.importStatus,
    persisted: true,
  });

  return {
    ok: true,
    persisted: true,
    storageBackend,
    candidateId: verified.externalCandidateId,
    pipelineStatus: verified.pipelineStatus,
    importStatus: verified.importStatus,
    humanReviewStatus: verified.humanReviewStatus,
    excludedBy: 'human',
    excludedReason: verified.excludedReason ?? trimmedReason,
    excludedAt: verified.excludedAt ?? now,
    candidate: verified,
  };
}

export function toExcludeFailureResponse(
  err: unknown
): ExcludeDaily30CandidateFailure {
  if (err instanceof Daily30CandidateExcludeError) {
    const code =
      err.code === 'EXCLUDE_PERSIST_FAILED'
        ? 'EXCLUDE_PERSIST_FAILED'
        : err.code === 'EXCLUDE_NOT_FOUND'
          ? 'EXCLUDE_NOT_FOUND'
          : 'EXCLUDE_INVALID';
    return {
      ok: false,
      errorCode: code,
      safeMessage: err.message,
    };
  }
  return {
    ok: false,
    errorCode: 'EXCLUDE_PERSIST_FAILED',
    safeMessage: '候補の除外状態を保存できませんでした',
  };
}
