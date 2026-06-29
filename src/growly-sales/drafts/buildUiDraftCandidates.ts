import type { Lead } from '../types/lead.js';
import type { OfferProfile } from '../config/offerProfile.js';
import {
  selectDraftCandidates,
  type DraftCandidateRecord,
} from './selectDraftCandidates.js';

export interface UiDraftCandidate extends DraftCandidateRecord {
  leadScore: Lead['leadScore'];
  riskLevel: Lead['riskLevel'];
  sendStatus: Lead['sendStatus'];
  humanReviewStatus: Lead['humanReviewStatus'];
  gmailDraftStatus: Lead['gmailDraftStatus'];
  gmailDraftId: Lead['gmailDraftId'];
  gmailDraftCreatedAt: Lead['gmailDraftCreatedAt'];
  gmailDraftError: Lead['gmailDraftError'];
  updatedAt: string;
}

export interface DraftCandidatesPayload {
  candidates: UiDraftCandidate[];
  excludedCount: number;
  generatedAt: string;
}

export function mergeCandidateWithLead(
  candidate: DraftCandidateRecord,
  lead: Lead
): UiDraftCandidate {
  return {
    ...candidate,
    leadScore: lead.leadScore,
    riskLevel: lead.riskLevel,
    sendStatus: lead.sendStatus,
    humanReviewStatus: lead.humanReviewStatus,
    gmailDraftStatus: lead.gmailDraftStatus,
    gmailDraftId: lead.gmailDraftId,
    gmailDraftCreatedAt: lead.gmailDraftCreatedAt,
    gmailDraftError: lead.gmailDraftError,
    updatedAt: lead.updatedAt,
  };
}

export function buildDraftCandidatesPayload(
  leads: Lead[],
  offer?: OfferProfile,
  generatedAt = new Date().toISOString()
): DraftCandidatesPayload {
  const { candidates, excluded } = selectDraftCandidates(leads, offer, generatedAt);
  const leadsById = new Map(leads.map((l) => [l.id, l]));

  const uiCandidates = candidates.map((c) => {
    const lead = leadsById.get(c.leadId);
    if (!lead) {
      throw new Error(`Lead not found for candidate: ${c.leadId}`);
    }
    return mergeCandidateWithLead(c, lead);
  });

  return {
    candidates: uiCandidates,
    excludedCount: excluded.length,
    generatedAt,
  };
}
