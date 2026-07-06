import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { pickDaily30TargetEmail } from './pickDaily30TargetEmail.js';
import { checkNotSuppressed } from '../mail-operations/index.js';

export interface Daily30SuppressionBlockHint {
  blockReason: string;
  statusLabel: string;
  blockedAt: string | null;
}

export function buildDaily30CopySuppressionHints(
  candidates: ExternalLeadCandidate[]
): Record<string, Daily30SuppressionBlockHint> {
  const hints: Record<string, Daily30SuppressionBlockHint> = {};
  for (const candidate of candidates) {
    const email = pickDaily30TargetEmail(candidate.emailCandidates ?? []);
    if (!email) continue;
    const result = checkNotSuppressed({
      emailAddress: email,
      leadId: candidate.externalCandidateId,
      operation: 'generate_sales_copy',
    });
    if (!result.allowed) {
      const lines = result.blockedReason.split('\n');
      hints[candidate.externalCandidateId] = {
        blockReason: result.blockedReason,
        statusLabel: lines[0]?.replace(/^配信禁止：/, '') ?? '配信禁止',
        blockedAt: lines[1]?.replace(/^停止日時：/, '') ?? null,
      };
    }
  }
  return hints;
}
