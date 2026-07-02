import type { Lead } from '../types/lead.js';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { findDuplicateReason } from '../adapters/dedupeExternalCandidates.js';
import {
  isPlaceholderEmailAddress,
  isPersonalEmailAddress,
} from './resolveEmailSourceDisplay.js';
import {
  getLeadApprovalComplianceBlockReason,
  getOfficialSiteUrl,
  getPrimaryEmail,
  getPrimaryEmailSourceUrl,
  isEmailSourceFromExternalListingSite,
} from './sourceCompliance.js';
import { hostsMatchUrl } from '../adapters/discovery/externalReferenceHosts.js';
import {
  isDaily30LeadReviewCandidate,
  isDaily30ManualExternalReferenceApprovalPending,
  isManualExternalReferenceCandidate,
} from './selectDaily30LeadCandidates.js';
import { isDaily30PrefectureExcluded } from './daily30PrefectureRegistry.js';

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

function getManualExternalReferenceBlockReason(
  candidate: ExternalLeadCandidate
): string | null {
  if (candidate.prefecture?.trim() && isDaily30PrefectureExcluded(candidate.prefecture.trim())) {
    return '東京都は対象外です';
  }
  if (!getOfficialSiteUrl(candidate)) {
    return '公式サイト候補URLがありません';
  }
  const email = getPrimaryEmail(candidate);
  if (!email) {
    return '公式サイト上の代表メールが未確認です';
  }
  const emailSourceUrl = getPrimaryEmailSourceUrl(candidate);
  if (!emailSourceUrl) {
    return '公式サイトメールの確認元 URL がありません';
  }
  const discoveryUrl = candidate.discoverySourceUrl?.trim();
  if (discoveryUrl && hostsMatchUrl(discoveryUrl, emailSourceUrl)) {
    return '発見元URLをメール取得元として使用できません';
  }
  if (isEmailSourceFromExternalListingSite(candidate)) {
    return '外部掲載サイト上のメールは使用できません';
  }
  if (candidate.pipelineStatus !== 'email_found') {
    return '公式サイト上の代表メールが確認できていません';
  }
  return null;
}

export function getDaily30LeadApprovalBlockReason(
  candidate: ExternalLeadCandidate,
  existingLeads: Lead[],
  allCandidates: ExternalLeadCandidate[]
): Daily30LeadApprovalBlockHint | null {
  const isStandardReview = isDaily30LeadReviewCandidate(candidate);
  const isManualPending = isDaily30ManualExternalReferenceApprovalPending(candidate);

  if (!isStandardReview && !isManualPending) {
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

  const complianceBlock = getLeadApprovalComplianceBlockReason(candidate);
  if (complianceBlock) {
    return {
      blockReason: complianceBlock,
      canApprove: false,
    };
  }

  if (isManualExternalReferenceCandidate(candidate)) {
    const manualBlock = getManualExternalReferenceBlockReason(candidate);
    if (manualBlock) {
      return {
        blockReason: manualBlock,
        canApprove: false,
      };
    }
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
