import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';

export interface Daily30ContactPathSummary {
  total: number;
  emailOnly: number;
  formOnly: number;
  both: number;
  noContactPath: number;
}

function isTodayBatchCandidate(c: ExternalLeadCandidate, batchId: string): boolean {
  return (
    c.collectionBatchId === batchId &&
    c.pipelineStatus !== 'duplicate' &&
    c.pipelineStatus !== 'excluded' &&
    c.importStatus !== 'duplicate'
  );
}

export function summarizeDaily30ContactPaths(
  candidates: ExternalLeadCandidate[],
  batchId: string
): Daily30ContactPathSummary {
  const today = candidates.filter((c) => isTodayBatchCandidate(c, batchId));
  let emailOnly = 0;
  let formOnly = 0;
  let both = 0;
  let noContactPath = 0;

  for (const c of today) {
    const hasEmail = (c.emailCandidates ?? []).some((e) => e.trim().length > 0);
    const hasForm = Boolean(c.contactFormUrl?.trim());
    if (hasEmail && hasForm) both += 1;
    else if (hasEmail) emailOnly += 1;
    else if (hasForm) formOnly += 1;
    else noContactPath += 1;
  }

  return {
    total: today.length,
    emailOnly,
    formOnly,
    both,
    noContactPath,
  };
}
