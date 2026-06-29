import type { Lead } from '../types/lead.js';

/**
 * 初回営業メール送信済みかつ返信・商談記録がある Lead。
 * 無料診断の初回案内ではなくフォローアップ扱いとする。
 */
export function isFollowUpOnlyLead(lead: Lead): boolean {
  const contacted = lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent';
  const engaged =
    lead.replyStatus !== 'none' &&
    lead.replyStatus !== 'no_reply' &&
    lead.replyStatus !== 'bounced';
  return contacted && engaged;
}

/** 無料診断の初回営業メール生成・Gmail下書き作成の対象か */
export function isInitialOutreachEligible(lead: Lead): boolean {
  if (lead.doNotContact) return false;
  if (lead.riskLevel === 'high') return false;
  if (lead.collectionStatus === 'needs_review' || lead.collectionStatus === 'failed') {
    return false;
  }
  if (lead.sendStatus === 'sent') return false;
  if (lead.sendStatus === 'manual_sent') return false;
  if (lead.dealStatus === 'open') return false;
  if (isFollowUpOnlyLead(lead)) return false;
  return true;
}
