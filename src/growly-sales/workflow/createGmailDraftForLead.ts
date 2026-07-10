import type { Lead } from '../types/lead.js';
import type { OfferProfile } from '../config/offerProfile.js';
import { loadOfferProfile } from '../config/offerProfile.js';
import { loadLeadsFromJson, saveLeadsToJson } from '../storage/jsonLeadRepository.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';
import { getLeadsCsvPath, getLeadsJsonPath } from '../config/paths.js';
import { buildGmailDraftMessage } from '../integrations/gmail/buildGmailDraftMessage.js';
import {
  createVerifiedGmailDraft,
  GmailDraftVerificationError,
} from '../integrations/gmail/gmailDraftAdapter.js';
import {
  CREATE_DRAFTS_GATE_TOKEN,
  isCreateDraftsGateConfirmed,
} from '../integrations/gmail/createDraftsGate.js';
import {
  GmailFetchDiagnosticError,
} from '../integrations/gmail/gmailFetchDiagnostics.js';
import { isGmailConfigured } from '../integrations/gmail/gmailAuth.js';
import { requireOutreachSendAsForDraftCreate } from '../integrations/gmail/validateOutreachEmailConfig.js';
import { getGmailDraftHaltReason } from '../integrations/gmail/gmailDraftHalt.js';
import {
  getGmailDraftExclusionReason,
  isGmailDraftEligible,
} from '../outreach/outreachPolicy.js';
import {
  assertNotSuppressed,
  assertUnsubscribeTokenReadyForGmailDraft,
  assertUnsubscribeTokenReadinessForGmailDraft,
} from '../mail-operations/index.js';
import {
  verifyLeadEmailBodyForGmailDraft,
  buildGmailDraftMimeChecklist,
} from '../integrations/gmail/gmailDraftLeadValidation.js';
import {
  verifyGmailDraftById,
  fetchGmailDraftRaw,
  deleteGmailDraft,
} from '../integrations/gmail/gmailDraftVerify.js';
import {
  decodeMimeBody,
  extractEmailAddress,
  parseMimeHeaders,
  splitMimeRaw,
  subjectsMatch,
} from '../integrations/gmail/gmailMimeUtils.js';
import {
  getOutreachFromDisplayName,
  getOutreachFromEmail,
  getOutreachReplyToEmail,
  getOutreachSignatureEmail,
} from '../config/env.js';
import {
  applyGmailDraftCreated,
  applyGmailDraftFailed,
  LeadNotFoundError,
} from './updateLeadGmailDraft.js';

export class CreateDraftsGateError extends Error {
  constructor() {
    super(`確認トークンが必要です。「${CREATE_DRAFTS_GATE_TOKEN}」と入力してください`);
    this.name = 'CreateDraftsGateError';
  }
}

export class GmailDraftCreateNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GmailDraftCreateNotAllowedError';
  }
}

export interface MimeVerificationReport {
  ok: boolean;
  checks: { id: string; label: string; ok: boolean }[];
  errors: string[];
}

export interface GmailDraftPreview {
  leadId: string;
  companyName: string;
  to: string;
  fromEmail: string;
  fromDisplayName: string;
  replyToEmail: string;
  signatureEmail: string;
  subject: string;
  customHook: string;
  emailBodyPreview: string;
  canCreate: boolean;
  blockReason: string | null;
}

export interface CreateGmailDraftForLeadResult {
  ok: boolean;
  lead: Lead;
  draftId: string | null;
  mimeVerification: MimeVerificationReport;
  message: string;
  draftDeleted: boolean;
}

function persistLeads(leads: Lead[]): Promise<void> {
  return Promise.all([
    saveLeadsToJson(getLeadsJsonPath(), leads),
    saveLeadsToCsv(getLeadsCsvPath(), leads),
  ]).then(() => undefined);
}

async function loadLeadById(leadId: string): Promise<Lead> {
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) throw new LeadNotFoundError(leadId);
  return lead;
}

function assertEligibleForGmailDraftCreate(lead: Lead, offer?: OfferProfile): void {
  assertNotSuppressed({
    tenantId: 'want-reach',
    lead,
    leadId: lead.id,
    emailAddress: lead.emailCandidates[0] ?? null,
    operation: 'create_gmail_draft',
  });

  if (lead.sendStatus === 'sent' || lead.sendStatus === 'manual_sent') {
    throw new GmailDraftCreateNotAllowedError('送信済み Lead は Gmail 下書き作成対象外です');
  }
  if (lead.gmailDraftStatus === 'draft_created') {
    throw new GmailDraftCreateNotAllowedError(
      'gmailDraftStatus=draft_created の Lead は二重作成できません'
    );
  }
  const halt = getGmailDraftHaltReason(lead.companyName);
  if (halt) {
    throw new GmailDraftCreateNotAllowedError(halt);
  }
  const exclusion = getGmailDraftExclusionReason(lead, offer);
  if (exclusion) {
    throw new GmailDraftCreateNotAllowedError(exclusion);
  }
  if (!isGmailDraftEligible(lead, offer)) {
    throw new GmailDraftCreateNotAllowedError('Gmail下書き作成候補ではありません');
  }
}

function buildMimeReportFromBody(
  lead: Lead,
  parsed: {
    fromEmail: string;
    replyToEmail: string;
    toEmail: string;
    subject: string;
    body: string;
  },
  expectedSubject: string
): MimeVerificationReport {
  const expected = {
    ...buildExpectedAddresses(),
    toEmail: parsed.toEmail,
    subject: expectedSubject,
  };
  const bodyErrors = verifyLeadEmailBodyForGmailDraft(lead, parsed.body);
  const checks = buildGmailDraftMimeChecklist(lead, parsed, expected).map((check) => {
    if (check.id === 'subject') {
      return { ...check, ok: subjectsMatch(parsed.subject, expectedSubject) };
    }
    return check;
  });
  const errors = bodyErrors.filter(Boolean);
  return {
    ok: checks.every((c) => c.ok) && errors.length === 0,
    checks,
    errors,
  };
}

async function verifyCreatedDraftBody(lead: Lead, draftId: string, message: ReturnType<typeof buildGmailDraftMessage>) {
  const raw = await fetchGmailDraftRaw(draftId);
  const { headersText, bodyText } = splitMimeRaw(raw);
  const headers = parseMimeHeaders(headersText);
  const parsedBody = decodeMimeBody(bodyText, headers).trim();

  return buildMimeReportFromBody(
    lead,
    {
      fromEmail: extractEmailAddress(headers.get('from') ?? ''),
      replyToEmail: extractEmailAddress(headers.get('reply-to') ?? ''),
      toEmail: extractEmailAddress(headers.get('to') ?? ''),
      subject: headers.get('subject') ?? '',
      body: parsedBody,
    },
    message.subject
  );
}

function buildExpectedAddresses() {
  return {
    fromEmail: getOutreachFromEmail(),
    replyToEmail: getOutreachReplyToEmail(),
    signatureEmail: getOutreachSignatureEmail(),
  };
}

export function buildGmailDraftPreviewForLead(lead: Lead, offer?: OfferProfile): GmailDraftPreview {
  const addresses = buildExpectedAddresses();
  let to = lead.emailCandidates.find((e) => e.trim())?.trim() ?? '';
  let blockReason: string | null = null;

  try {
    assertEligibleForGmailDraftCreate(lead, offer);
    // readiness only — no GCS token write on preview
    assertUnsubscribeTokenReadinessForGmailDraft({ lead });
    const message = buildGmailDraftMessage(lead);
    to = message.to;
    const bodyErrors = verifyLeadEmailBodyForGmailDraft(lead, message.body);
    if (bodyErrors.length > 0) {
      blockReason = bodyErrors.join(' / ');
    }
  } catch (err) {
    blockReason = err instanceof Error ? err.message : String(err);
  }

  const body = lead.emailBody.trim();
  return {
    leadId: lead.id,
    companyName: lead.companyName,
    to,
    fromEmail: addresses.fromEmail,
    fromDisplayName: getOutreachFromDisplayName(),
    replyToEmail: addresses.replyToEmail,
    signatureEmail: addresses.signatureEmail,
    subject: lead.emailSubject.trim(),
    customHook: lead.customHook.trim(),
    emailBodyPreview: body.length > 600 ? `${body.slice(0, 600)}…` : body,
    canCreate: blockReason === null,
    blockReason,
  };
}

export async function getGmailDraftPreview(leadId: string): Promise<GmailDraftPreview> {
  const offer = await loadOfferProfile();
  const lead = await loadLeadById(leadId);
  return buildGmailDraftPreviewForLead(lead, offer);
}

export async function createGmailDraftForLead(
  leadId: string,
  createDraftsGate: string
): Promise<CreateGmailDraftForLeadResult> {
  if (!isCreateDraftsGateConfirmed(createDraftsGate)) {
    throw new CreateDraftsGateError();
  }

  if (!(await isGmailConfigured())) {
    throw new GmailDraftCreateNotAllowedError(
      'Gmail認証が未設定です。.env を確認してください（秘密情報は画面に表示しません）'
    );
  }

  await requireOutreachSendAsForDraftCreate();

  const offer = await loadOfferProfile();
  const leads = await loadLeadsFromJson(getLeadsJsonPath());
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) throw new LeadNotFoundError(leadId);

  assertEligibleForGmailDraftCreate(lead, offer);

  // CREATE_DRAFTS token gate: fail-closed before Gmail API. Footer not inserted in Step 16C.
  await assertUnsubscribeTokenReadyForGmailDraft({ lead });

  const message = buildGmailDraftMessage(lead);
  const bodyErrors = verifyLeadEmailBodyForGmailDraft(lead, message.body);
  if (bodyErrors.length > 0) {
    throw new GmailDraftCreateNotAllowedError(bodyErrors.join(' / '));
  }

  const expected = {
    ...buildExpectedAddresses(),
    toEmail: message.to,
    subject: message.subject,
  };

  const now = new Date().toISOString();
  let draftDeleted = false;

  try {
    const created = await createVerifiedGmailDraft(message);
    const mimeVerification = await verifyCreatedDraftBody(lead, created.draftId, message);

    if (!mimeVerification.ok) {
      draftDeleted = true;
      try {
        await deleteGmailDraft(created.draftId);
      } catch {
        // best-effort
      }
      const errMsg = mimeVerification.errors.join(' / ') || 'MIME検証失敗';
      const failedLead = applyGmailDraftFailed(lead, errMsg, now);
      const merged = leads.map((l) => (l.id === leadId ? failedLead : l));
      await persistLeads(merged);
      return {
        ok: false,
        lead: failedLead,
        draftId: null,
        mimeVerification,
        message: `MIME検証に失敗したため Gmail 下書きを削除しました: ${errMsg}`,
        draftDeleted: true,
      };
    }

    const updatedLead = applyGmailDraftCreated(lead, created.draftId, now);
    const merged = leads.map((l) => (l.id === leadId ? updatedLead : l));
    await persistLeads(merged);

    return {
      ok: true,
      lead: updatedLead,
      draftId: created.draftId,
      mimeVerification,
      message:
        'Gmail下書きを作成しました。Gmailで確認してから手動送信してください（自動送信は行っていません）。',
      draftDeleted: false,
    };
  } catch (err) {
    let errMsg: string;
    let mimeVerification: MimeVerificationReport = {
      ok: false,
      checks: buildGmailDraftMimeChecklist(
        lead,
        {
          fromEmail: message.from,
          replyToEmail: message.replyTo,
          toEmail: message.to,
          subject: message.subject,
          body: message.body.slice(0, 200),
        },
        expected
      ),
      errors: [],
    };

    if (err instanceof GmailDraftVerificationError) {
      errMsg = err.message;
      mimeVerification.errors = err.errors;
      draftDeleted = true;
    } else if (err instanceof GmailFetchDiagnosticError) {
      errMsg = err.toPersistMessage();
    } else {
      errMsg = err instanceof Error ? err.message : String(err);
    }

    const failedLead = applyGmailDraftFailed(lead, errMsg, now);
    const merged = leads.map((l) => (l.id === leadId ? failedLead : l));
    await persistLeads(merged);

    return {
      ok: false,
      lead: failedLead,
      draftId: null,
      mimeVerification,
      message: draftDeleted
        ? `Gmail下書き作成または検証に失敗し、無効な下書きは削除しました: ${errMsg}`
        : `Gmail下書き作成に失敗しました: ${errMsg}`,
      draftDeleted,
    };
  }
}
