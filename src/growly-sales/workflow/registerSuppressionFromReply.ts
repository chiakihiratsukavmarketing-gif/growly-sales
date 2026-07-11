import { randomUUID } from 'node:crypto';
import type { Lead } from '../types/lead.js';
import { getLeadsJsonPath } from '../config/paths.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import {
  addSuppressionFromReplyOptOut,
  type ManualSuppressionResult,
} from '../mail-operations/suppressionStore.js';
import { maskEmailForDisplay } from '../mail-operations/emailDisplayPrivacy.js';
import { getDefaultMailOperationsTenantId } from '../mail-operations/tenantResolver.js';
import { assertReplyManagementEligible } from './replyManagementValidation.js';

export class RegisterSuppressionFromReplyNotFoundError extends Error {
  constructor(leadId: string) {
    super(`Lead が見つかりません: ${leadId}`);
    this.name = 'RegisterSuppressionFromReplyNotFoundError';
  }
}

export class RegisterSuppressionFromReplyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegisterSuppressionFromReplyValidationError';
  }
}

export interface RegisterSuppressionFromReplyResult {
  lead: Lead;
  suppression: ManualSuppressionResult;
  maskedEmail: string | null;
  correlationId: string;
}

export async function registerSuppressionFromReplyForLead(input: {
  leadId: string;
  reason: string;
  tenantId?: string;
  jsonPath?: string;
}): Promise<RegisterSuppressionFromReplyResult> {
  const jsonPath = input.jsonPath ?? getLeadsJsonPath();
  const leads = await loadLeadsFromJson(jsonPath);
  const lead = leads.find((l) => l.id === input.leadId);
  if (!lead) {
    throw new RegisterSuppressionFromReplyNotFoundError(input.leadId);
  }

  assertReplyManagementEligible(lead);

  const emailAddress = lead.emailCandidates[0]?.trim();
  if (!emailAddress) {
    throw new RegisterSuppressionFromReplyValidationError(
      'emailCandidates が空の Lead は配信禁止登録できません'
    );
  }

  const tenantId = input.tenantId?.trim() || getDefaultMailOperationsTenantId();
  const reason = input.reason.trim() || '返信による停止希望';
  const correlationId = randomUUID();

  const suppression = await addSuppressionFromReplyOptOut({
    tenantId,
    emailAddress,
    leadId: lead.id,
    companyName: lead.companyName,
    reason,
  });

  const maskedEmail = maskEmailForDisplay(emailAddress);
  console.info(
    [
      '[suppression]',
      `action=register_reply_opt_out`,
      `correlationId=${correlationId}`,
      `leadId=${lead.id}`,
      `suppressionId=${suppression.record.suppressionId}`,
      `source=reply_opt_out`,
      maskedEmail ? `maskedEmail=${maskedEmail}` : null,
      `created=${String(suppression.created)}`,
      `writeSource=${suppression.writeSource}`,
    ]
      .filter(Boolean)
      .join(' ')
  );

  return {
    lead,
    suppression,
    maskedEmail,
    correlationId,
  };
}
