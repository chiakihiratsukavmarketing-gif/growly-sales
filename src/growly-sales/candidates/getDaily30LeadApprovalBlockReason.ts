import type { Lead } from '../types/lead.js';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { findDuplicateReason } from '../adapters/dedupeExternalCandidates.js';
import {
  isPlaceholderEmailAddress,
  isPersonalEmailAddress,
} from './resolveEmailSourceDisplay.js';
import { isDaily30LeadReviewCandidate } from './selectDaily30LeadCandidates.js';

export interface Daily30LeadApprovalBlockHint {
  blockReason: string;
  duplicateLeadName?: string;
  canApprove: boolean;
}

function extractDuplicateLeadName(reason: string): string | undefined {
  const prefix = '既存Leadと重複:';
  if (reason.startsWith(prefix)) {
    return reason.slice(prefix.length).trim() || undefined;
  }
  const dncPrefix = '既存LeadがdoNotContact=true:';
  if (reason.startsWith(dncPrefix)) {
    return reason.slice(dncPrefix.length).trim() || undefined;
  }
  return undefined;
}

export function getDaily30LeadApprovalBlockReason(
  candidate: ExternalLeadCandidate,
  existingLeads: Lead[],
  allCandidates: ExternalLeadCandidate[]
): Daily30LeadApprovalBlockHint | null {
  if (!isDaily30LeadReviewCandidate(candidate)) {
    if (candidate.importStatus === 'approved_for_lead') {
      return { blockReason: '既にLead化承認済みです', canApprove: false };
    }
    return null;
  }

  const dup = findDuplicateReason(candidate, existingLeads, allCandidates);
  if (dup) {
    return {
      blockReason: dup,
      duplicateLeadName: extractDuplicateLeadName(dup),
      canApprove: false,
    };
  }

  const email =
    candidate.targetEmail?.trim() ||
    candidate.emailCandidates.find((e) => e.trim())?.trim() ||
    '';
  if (email && isPlaceholderEmailAddress(email)) {
    return {
      blockReason: 'メール不正の可能性（プレースホルダ）',
      canApprove: false,
    };
  }
  if (email && isPersonalEmailAddress(email)) {
    return {
      blockReason: '個人メールの可能性',
      canApprove: false,
    };
  }

  return null;
}

export function buildDaily30LeadApprovalBlockHints(
  candidates: ExternalLeadCandidate[],
  existingLeads: Lead[],
  allCandidates: ExternalLeadCandidate[]
): Record<string, Daily30LeadApprovalBlockHint> {
  const hints: Record<string, Daily30LeadApprovalBlockHint> = {};
  for (const candidate of candidates) {
    const hint = getDaily30LeadApprovalBlockReason(candidate, existingLeads, allCandidates);
    if (hint) {
      hints[candidate.externalCandidateId] = hint;
    }
  }
  return hints;
}
