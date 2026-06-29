import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { loadOfferProfile } from '../config/offerProfile.js';
import { loadTargetProfile } from '../config/targetProfile.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import { getLeadsJsonPath } from '../config/paths.js';
import {
  loadExternalCandidatesFromJson,
  persistExternalCandidates,
} from '../storage/externalCandidatesRepository.js';
import { generateDaily30SalesCopyForCandidate } from './generateDaily30SalesCopy.js';
import { qualityCheckDaily30Copy } from './qualityCheckDaily30Copy.js';
import { selectDaily30CopyPipelineTargets } from './selectDaily30LeadCandidates.js';

export interface Daily30CopyPipelineStats {
  processed: number;
  generated: number;
  passed: number;
  needsReview: number;
  excluded: number;
  skipped: number;
}

export async function runDaily30CopyPipeline(): Promise<{
  candidates: ExternalLeadCandidate[];
  stats: Daily30CopyPipelineStats;
}> {
  const [candidates, leads, target, offer] = await Promise.all([
    loadExternalCandidatesFromJson(),
    loadLeadsFromJson(getLeadsJsonPath()),
    loadTargetProfile(),
    loadOfferProfile(),
  ]);

  const targets = selectDaily30CopyPipelineTargets(candidates);
  const targetIds = new Set(targets.map((c) => c.externalCandidateId));
  const stats: Daily30CopyPipelineStats = {
    processed: 0,
    generated: 0,
    passed: 0,
    needsReview: 0,
    excluded: 0,
    skipped: candidates.length - targets.length,
  };

  const profiles = { target, offer };
  const now = new Date().toISOString();

  const updated = candidates.map((candidate) => {
    if (!targetIds.has(candidate.externalCandidateId)) return candidate;

    stats.processed++;
    const { candidate: generated, stubLead } = generateDaily30SalesCopyForCandidate(
      candidate,
      profiles
    );
    stats.generated++;

    const qc = qualityCheckDaily30Copy(generated, stubLead, leads, offer);
    const failureReason = qc.errors.join(' / ') || null;

    if (qc.ok) {
      stats.passed++;
      return {
        ...generated,
        pipelineStatus: 'ready_for_draft' as const,
        humanReviewStatus: 'pending' as const,
        gmailDraftStatus: 'none' as const,
        sendStatus: 'not_sent' as const,
        failureReason: null,
        qualityCheckedAt: now,
        updatedAt: now,
      };
    }

    if (qc.exclude) {
      stats.excluded++;
      return {
        ...generated,
        pipelineStatus: 'excluded' as const,
        failureReason,
        qualityCheckedAt: now,
        updatedAt: now,
      };
    }

    stats.needsReview++;
    return {
      ...generated,
      pipelineStatus: 'needs_review' as const,
      failureReason,
      qualityCheckedAt: now,
      updatedAt: now,
    };
  });

  await persistExternalCandidates(updated);

  return { candidates: updated, stats };
}
