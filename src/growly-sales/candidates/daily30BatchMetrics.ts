import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import {
  DAILY_30_MAX_COLLECTED_CANDIDATES,
  DAILY_30_MAX_DURATION_MS,
  DAILY_30_MAX_PLACES_RESULTS,
  DAILY_30_TARGET_EMAIL_FOUND,
} from './daily30CandidateStatus.js';

export type Daily30StoppedReason =
  | 'target_email_found_reached'
  | 'max_candidates_reached'
  | 'max_duration_reached'
  | 'max_places_requests_reached'
  | 'source_exhausted'
  | 'area_expansion_not_completed'
  | 'collected_limit_reached_before_email_target'
  | 'area_expansion_exhausted';

export interface Daily30BatchMetrics {
  batchId: string;
  targetEmailFound: number;
  emailFound: number;
  totalCollected: number;
  /** @deprecated use totalCollected — legacy alias for UI compat */
  collected: number;
  formOnly: number;
  noEmail: number;
  excluded: number;
  duplicates: number;
  reachedTarget: boolean;
}

export function isDaily30BatchAccepted(c: ExternalLeadCandidate, batchId: string): boolean {
  return (
    c.collectionBatchId === batchId &&
    c.pipelineStatus !== 'duplicate' &&
    c.pipelineStatus !== 'excluded' &&
    c.importStatus !== 'duplicate'
  );
}

export function isDaily30EmailFoundCandidate(c: ExternalLeadCandidate): boolean {
  if (c.pipelineStatus !== 'email_found') return false;
  return (c.emailCandidates ?? []).some((e) => e.trim().length > 0);
}

export function isDaily30FormOnlyCandidate(c: ExternalLeadCandidate): boolean {
  if (isDaily30EmailFoundCandidate(c)) return false;
  return Boolean(c.contactFormUrl?.trim());
}

export function isDaily30NoEmailCandidate(c: ExternalLeadCandidate): boolean {
  if (isDaily30EmailFoundCandidate(c) || isDaily30FormOnlyCandidate(c)) return false;
  if (c.pipelineStatus === 'duplicate' || c.pipelineStatus === 'excluded') return false;
  return (
    c.pipelineStatus === 'email_not_found' ||
    c.pipelineStatus === 'collected' ||
    (c.emailCandidates?.length ?? 0) === 0
  );
}

export function countDaily30BatchMetrics(
  candidates: ExternalLeadCandidate[],
  batchId: string
): Daily30BatchMetrics {
  const today = candidates.filter((c) => c.collectionBatchId === batchId);
  const accepted = today.filter((c) => isDaily30BatchAccepted(c, batchId));
  const emailFound = today.filter((c) => isDaily30EmailFoundCandidate(c)).length;
  const formOnly = accepted.filter((c) => isDaily30FormOnlyCandidate(c)).length;
  const noEmail = accepted.filter((c) => isDaily30NoEmailCandidate(c)).length;
  const duplicates = today.filter(
    (c) => c.pipelineStatus === 'duplicate' || c.importStatus === 'duplicate'
  ).length;
  const excluded = today.filter((c) => c.pipelineStatus === 'excluded').length;
  const totalCollected = accepted.length;

  return {
    batchId,
    targetEmailFound: DAILY_30_TARGET_EMAIL_FOUND,
    emailFound,
    totalCollected,
    collected: totalCollected,
    formOnly,
    noEmail,
    excluded,
    duplicates,
    reachedTarget: emailFound >= DAILY_30_TARGET_EMAIL_FOUND,
  };
}

export function resolveDaily30StoppedReason(input: {
  metrics: Daily30BatchMetrics;
  durationMs: number;
  placesResults: number;
  areasExhausted: boolean;
  areasUsedCount?: number;
  totalAreas?: number;
}): Daily30StoppedReason {
  if (input.metrics.reachedTarget) return 'target_email_found_reached';
  if (input.metrics.totalCollected >= DAILY_30_MAX_COLLECTED_CANDIDATES) {
    return 'max_candidates_reached';
  }
  if (input.durationMs >= DAILY_30_MAX_DURATION_MS) return 'max_duration_reached';
  if (input.placesResults >= DAILY_30_MAX_PLACES_RESULTS) return 'max_places_requests_reached';
  const totalAreas = input.totalAreas ?? 0;
  const areasUsed = input.areasUsedCount ?? 0;
  if (
    totalAreas > 0 &&
    areasUsed < totalAreas &&
    !input.metrics.reachedTarget
  ) {
    return 'area_expansion_not_completed';
  }
  if (input.areasExhausted) return 'area_expansion_exhausted';
  return 'source_exhausted';
}

/** GCS state 保存前: email 未達の本番 run で stoppedReason が欠けている場合の補完 */
export function ensureDaily30StoppedReasonForRun(input: {
  reachedTarget: boolean;
  emailFound: number;
  targetEmailFound: number;
  totalCollected: number;
  durationMs: number;
  placesResults?: number;
  areasUsedCount?: number;
  totalAreas?: number;
  areasExhausted?: boolean;
  explicit?: Daily30StoppedReason;
}): Daily30StoppedReason {
  if (input.explicit) return input.explicit;
  if (input.reachedTarget || input.emailFound >= input.targetEmailFound) {
    return 'target_email_found_reached';
  }
  return resolveDaily30StoppedReason({
    metrics: {
      batchId: '',
      targetEmailFound: input.targetEmailFound,
      emailFound: input.emailFound,
      totalCollected: input.totalCollected,
      collected: input.totalCollected,
      formOnly: 0,
      noEmail: 0,
      excluded: 0,
      duplicates: 0,
      reachedTarget: false,
    },
    durationMs: input.durationMs,
    placesResults: input.placesResults ?? 0,
    areasExhausted: input.areasExhausted ?? false,
    areasUsedCount: input.areasUsedCount,
    totalAreas: input.totalAreas,
  });
}
