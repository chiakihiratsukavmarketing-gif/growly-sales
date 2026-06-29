import type { Lead } from '../../types/lead.js';
import type { OfferProfile } from '../../config/offerProfile.js';
import {
  getGmailDraftExclusionReason,
  isGmailDraftEligible,
  selectGmailDraftCreationTargets,
} from '../../outreach/outreachPolicy.js';

export {
  getGmailDraftExclusionReason,
  isGmailDraftEligible,
  selectGmailDraftCreationTargets,
};

/** GMAIL_DRAFT_CREATE_LIMIT を適用（先頭から最大 limit 件） */
export function applyGmailDraftCreateLimit<T>(items: T[], limit: number | null): T[] {
  if (limit === null) return items;
  return items.slice(0, limit);
}
