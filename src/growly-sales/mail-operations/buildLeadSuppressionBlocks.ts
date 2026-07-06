import type { Lead } from '../types/lead.js';
import { checkNotSuppressed } from './suppressionPolicy.js';

export function buildSuppressionBlocksForLeads(leads: Lead[]): Record<string, string> {
  const blocks: Record<string, string> = {};
  for (const lead of leads) {
    const result = checkNotSuppressed({
      lead,
      leadId: lead.id,
      emailAddress: lead.emailCandidates[0] ?? null,
      operation: 'select_draft_candidate',
    });
    if (!result.allowed) {
      blocks[lead.id] = result.blockedReason;
    }
  }
  return blocks;
}
