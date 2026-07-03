import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { Lead } from '../types/lead.js';
import {
  evaluateSourceCompliance,
  type SourceComplianceEvaluation,
} from './sourceCompliance.js';
import {
  getDaily30LeadApprovalBlockReason,
  type Daily30LeadApprovalBlockHint,
} from './getDaily30LeadApprovalBlockReason.js';
import { resolveEmailSourceFromCandidate } from './resolveEmailSourceDisplay.js';
import type { EmailSourceDisplayInfo } from './resolveEmailSourceDisplay.js';

export function representativeEmailJudgmentLabel(
  candidate: ExternalLeadCandidate,
  compliance: SourceComplianceEvaluation = evaluateSourceCompliance(candidate),
  emailSource: EmailSourceDisplayInfo = resolveEmailSourceFromCandidate(candidate)
): string {
  if (compliance.status === 'official_site_verified') {
    return '公式サイト代表メール確認済み';
  }
  if (!emailSource.email) {
    return '代表メール未確認';
  }
  if (compliance.status === 'blocked_by_policy') {
    return compliance.note
      ? `ポリシーにより不可（${compliance.note}）`
      : 'ポリシーにより代表メール使用不可';
  }
  if (compliance.status === 'needs_human_review') {
    return compliance.note ? `要確認（${compliance.note}）` : 'メール取得元要確認';
  }
  if (compliance.status === 'official_site_not_found') {
    return '公式サイト未確認';
  }
  return '公式サイト上の代表メールが確認できていません';
}

export interface Daily30LeadApprovalJudgment {
  compliance: SourceComplianceEvaluation;
  emailSource: EmailSourceDisplayInfo;
  blockHint: Daily30LeadApprovalBlockHint | null;
  /** evaluateSourceCompliance が official_site_verified */
  representativeEmailVerified: boolean;
  canApprove: boolean;
  /** UI「判定」行: 代表メール確認 */
  representativeEmailLabel: string;
}

/**
 * 候補収集〜Lead化承認までの単一判定源。
 * 保存済み sourceComplianceStatus は信頼せず、現在の email / URL から再評価する。
 */
export function resolveDaily30LeadApprovalJudgment(
  candidate: ExternalLeadCandidate,
  existingLeads: Lead[],
  allCandidates: ExternalLeadCandidate[]
): Daily30LeadApprovalJudgment {
  const compliance = evaluateSourceCompliance(candidate);
  const emailSource = resolveEmailSourceFromCandidate(candidate);
  const blockHint = getDaily30LeadApprovalBlockReason(candidate, existingLeads, allCandidates);
  const representativeEmailVerified = compliance.status === 'official_site_verified';

  const representativeEmailLabel = representativeEmailJudgmentLabel(
    candidate,
    compliance,
    emailSource
  );

  const canApprove = blockHint === null && representativeEmailVerified;

  return {
    compliance,
    emailSource,
    blockHint,
    representativeEmailVerified,
    canApprove,
    representativeEmailLabel,
  };
}
