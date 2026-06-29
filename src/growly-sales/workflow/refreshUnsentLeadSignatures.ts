import { loadOfferProfile } from '../config/offerProfile.js';
import { getOutreachSignatureEmail } from '../config/env.js';
import { refreshLeadSalesEmailTemplate } from '../generation/applyFullGeneration.js';
import { getLeadsCsvPath, getLeadsJsonPath } from '../config/paths.js';
import { isFollowUpOnlyLead } from '../outreach/outreachEligibility.js';
import type { Lead } from '../types/lead.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';

const LEGACY_SIGNATURE_EMAIL = 'info@wantreach.jp';

export function extractSignatureEmailFromBody(emailBody: string): string | null {
  const match = emailBody.match(/Email：([^\s\n]+)/);
  return match?.[1]?.trim() ?? null;
}

/** 未送信Leadの emailBody 署名が標準（OUTREACH_SIGNATURE_EMAIL）と一致しない */
export function hasStaleOutreachSignature(
  emailBody: string,
  expectedEmail = getOutreachSignatureEmail()
): boolean {
  if (!emailBody?.trim()) return false;
  const current = extractSignatureEmailFromBody(emailBody);
  if (!current) return true;
  if (current !== expectedEmail) return true;
  if (expectedEmail !== LEGACY_SIGNATURE_EMAIL && emailBody.includes(`Email：${LEGACY_SIGNATURE_EMAIL}`)) {
    return true;
  }
  return false;
}

export function shouldRefreshUnsentLeadSignature(lead: Lead): boolean {
  if (lead.doNotContact) return false;
  if (lead.sendStatus !== 'not_sent') return false;
  if (isFollowUpOnlyLead(lead)) return false;
  if (!lead.customHook?.trim()) return false;
  if (!lead.emailBody?.trim()) return false;
  return hasStaleOutreachSignature(lead.emailBody);
}

export interface SignatureRefreshPreviewItem {
  leadId: string;
  companyName: string;
  currentSignatureEmail: string | null;
  expectedSignatureEmail: string;
  hadDraft: boolean;
}

export interface SignatureRefreshResult {
  refreshed: SignatureRefreshPreviewItem[];
  clearedDrafts: string[];
  skippedSentCount: number;
  expectedSignatureEmail: string;
}

export async function previewUnsentSignatureRefresh(
  jsonPath = getLeadsJsonPath()
): Promise<SignatureRefreshPreviewItem[]> {
  const expectedSignatureEmail = getOutreachSignatureEmail();
  const leads = await loadLeadsFromJson(jsonPath);
  return leads
    .filter(shouldRefreshUnsentLeadSignature)
    .map((lead) => ({
      leadId: lead.id,
      companyName: lead.companyName,
      currentSignatureEmail: extractSignatureEmailFromBody(lead.emailBody),
      expectedSignatureEmail,
      hadDraft: lead.gmailDraftStatus === 'draft_created',
    }));
}

export async function refreshUnsentLeadSignatures(
  jsonPath = getLeadsJsonPath(),
  csvPath = getLeadsCsvPath()
): Promise<SignatureRefreshResult> {
  const offer = await loadOfferProfile();
  const leads = await loadLeadsFromJson(jsonPath);
  const expectedSignatureEmail = getOutreachSignatureEmail();
  const refreshed: SignatureRefreshPreviewItem[] = [];
  const clearedDrafts: string[] = [];
  let skippedSentCount = 0;

  for (const lead of leads) {
    if (lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent') {
      if (hasStaleOutreachSignature(lead.emailBody)) skippedSentCount++;
    }
  }

  const updated = leads.map((lead) => {
    if (!shouldRefreshUnsentLeadSignature(lead)) return lead;
    const hadDraft = lead.gmailDraftStatus === 'draft_created';
    const currentSignatureEmail = extractSignatureEmailFromBody(lead.emailBody);
    const next = refreshLeadSalesEmailTemplate(lead, offer);
    if (next.emailBody === lead.emailBody && next.emailSubject === lead.emailSubject) {
      return lead;
    }
    refreshed.push({
      leadId: lead.id,
      companyName: lead.companyName,
      currentSignatureEmail,
      expectedSignatureEmail,
      hadDraft,
    });
    if (hadDraft && next.gmailDraftStatus === 'none') {
      clearedDrafts.push(lead.companyName);
    }
    return next;
  });

  await saveLeadsToJson(jsonPath, updated);
  await saveLeadsToCsv(csvPath, updated);

  return {
    refreshed,
    clearedDrafts,
    skippedSentCount,
    expectedSignatureEmail,
  };
}
