import type { Lead } from '../types/lead.js';

/** パイロット推奨Lead数（超えてもエラーにしない） */
export const PILOT_TARGET_LEAD_COUNT = 10;

export interface PilotSummary {
  totalLeads: number;
  pilotTargetCount: number;
  remainingToPilot: number;
  overPilotRecommendation: boolean;
  approvedCount: number;
  manualSentCount: number;
  replyRecordedCount: number;
  followUpNeededCount: number;
  needsReviewCount: number;
  doNotContactCount: number;
}

function hasReplyRecord(lead: Lead): boolean {
  return [
    'replied',
    'interested',
    'not_interested',
    'meeting_scheduled',
    'follow_up_needed',
    'bounced',
  ].includes(lead.replyStatus);
}

function needsHumanReview(lead: Lead): boolean {
  return (
    lead.humanReviewStatus === 'pending' ||
    lead.humanReviewStatus === 'needs_revision' ||
    lead.reviewStatus === 'revise' ||
    lead.reviewStatus === 'pending'
  );
}

function isFollowUpNeeded(lead: Lead): boolean {
  return lead.replyStatus === 'follow_up_needed' || Boolean(lead.followUpDate?.trim());
}

export function buildPilotSummary(leads: Lead[]): PilotSummary {
  const totalLeads = leads.length;
  const remainingToPilot = Math.max(0, PILOT_TARGET_LEAD_COUNT - totalLeads);

  return {
    totalLeads,
    pilotTargetCount: PILOT_TARGET_LEAD_COUNT,
    remainingToPilot,
    overPilotRecommendation: totalLeads > PILOT_TARGET_LEAD_COUNT,
    approvedCount: leads.filter((l) => l.humanReviewStatus === 'approved').length,
    manualSentCount: leads.filter((l) => l.sendStatus === 'manual_sent').length,
    replyRecordedCount: leads.filter(hasReplyRecord).length,
    followUpNeededCount: leads.filter(isFollowUpNeeded).length,
    needsReviewCount: leads.filter(needsHumanReview).length,
    doNotContactCount: leads.filter((l) => l.doNotContact).length,
  };
}
