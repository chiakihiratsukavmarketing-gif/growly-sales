import type { Lead } from '../types/lead.js';
import type { MailSuppression, SuppressionCheckResult, SuppressionOperation } from './suppressionTypes.js';
import {
  findActiveSuppressionByEmail,
  findActiveSuppressionByLeadId,
  loadMailSuppressionStoreSync,
  touchLastAttemptBlocked,
} from './suppressionStore.js';
import { normalizeEmailAddress } from './suppressionToken.js';

export class SuppressionBlockedError extends Error {
  readonly check: Extract<SuppressionCheckResult, { allowed: false }>;

  constructor(check: Extract<SuppressionCheckResult, { allowed: false }>) {
    super(check.blockedReason);
    this.name = 'SuppressionBlockedError';
    this.check = check;
  }
}

const STATUS_LABELS: Record<string, string> = {
  unsubscribed: '本人による配信停止',
  manually_blocked: '手動による配信禁止',
  invalid_address: '無効なメールアドレス',
  complaint: '苦情による配信禁止',
  legal_block: '法的理由による配信禁止',
};

const SOURCE_LABELS: Record<string, string> = {
  unsubscribe_link: '配信停止リンク',
  manual: '手動登録',
  bounce: '不達',
  complaint: '苦情',
  import: 'インポート',
  legacy_do_not_contact: '既存の連絡禁止フラグ',
};

export function formatSuppressionStatusLabel(status: MailSuppression['status']): string {
  return STATUS_LABELS[status] ?? status;
}

export function formatSuppressionSourceLabel(source: MailSuppression['source']): string {
  return SOURCE_LABELS[source] ?? source;
}

export function formatSuppressionBlockedAt(suppression: MailSuppression): string | null {
  const at = suppression.unsubscribedAt ?? suppression.createdAt;
  if (!at) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('ja-JP', { hour12: false });
}

export function buildSuppressionBlockReason(suppression: MailSuppression): string {
  const label = suppression.reason?.trim() || formatSuppressionStatusLabel(suppression.status);
  const at = formatSuppressionBlockedAt(suppression);
  if (at) {
    return `配信禁止：${label}\n停止日時：${at}`;
  }
  return `配信禁止：${label}`;
}

export function buildLegacyDoNotContactBlockReason(lead: Lead): string {
  const at = lead.updatedAt ?? lead.createdAt;
  const formatted = at ? new Date(at).toLocaleString('ja-JP', { hour12: false }) : null;
  if (formatted) {
    return `配信禁止：既存の連絡禁止フラグ（doNotContact=true）\n停止日時：${formatted}`;
  }
  return '配信禁止：既存の連絡禁止フラグ（doNotContact=true）';
}

function legacyBlockedCheck(lead?: Lead | null): Extract<SuppressionCheckResult, { allowed: false }> | null {
  if (!lead) return null;
  if (lead.doNotContact) {
    return {
      allowed: false,
      suppression: {
        suppressionId: `legacy-dnc-${lead.id}`,
        leadId: lead.id,
        emailAddress: lead.emailCandidates[0] ?? '',
        normalizedEmail: normalizeEmailAddress(lead.emailCandidates[0] ?? ''),
        status: 'manually_blocked',
        reason: '既存の連絡禁止フラグ（doNotContact）',
        source: 'legacy_do_not_contact',
        createdAt: lead.createdAt ?? new Date().toISOString(),
        updatedAt: lead.updatedAt ?? new Date().toISOString(),
      },
      blockedReason: buildLegacyDoNotContactBlockReason(lead),
      legacySource: 'do_not_contact',
    };
  }
  if (lead.sendStatus === 'blocked') {
    return {
      allowed: false,
      suppression: {
        suppressionId: `legacy-blocked-${lead.id}`,
        leadId: lead.id,
        emailAddress: lead.emailCandidates[0] ?? '',
        normalizedEmail: normalizeEmailAddress(lead.emailCandidates[0] ?? ''),
        status: 'manually_blocked',
        reason: '既存の送信ブロック（sendStatus=blocked）',
        source: 'legacy_do_not_contact',
        createdAt: lead.createdAt ?? new Date().toISOString(),
        updatedAt: lead.updatedAt ?? new Date().toISOString(),
      },
      blockedReason: '配信禁止：送信ブロック済み（sendStatus=blocked）',
      legacySource: 'send_status_blocked',
    };
  }
  return null;
}

export function checkNotSuppressed(input: {
  emailAddress?: string | null;
  companyId?: string | null;
  leadId?: string | null;
  lead?: Lead | null;
  operation: SuppressionOperation;
}): SuppressionCheckResult {
  const store = loadMailSuppressionStoreSync();

  if (input.leadId) {
    const byLead = findActiveSuppressionByLeadId(store, input.leadId);
    if (byLead) {
      return {
        allowed: false,
        suppression: byLead,
        blockedReason: buildSuppressionBlockReason(byLead),
        legacySource: 'mail_suppression',
      };
    }
  }

  const email = input.emailAddress?.trim() || input.lead?.emailCandidates?.[0]?.trim() || '';
  if (email) {
    const byEmail = findActiveSuppressionByEmail(store, email);
    if (byEmail) {
      return {
        allowed: false,
        suppression: byEmail,
        blockedReason: buildSuppressionBlockReason(byEmail),
        legacySource: 'mail_suppression',
      };
    }
  }

  const legacy = legacyBlockedCheck(input.lead ?? null);
  if (legacy) {
    return legacy;
  }

  return { allowed: true };
}

export function assertNotSuppressed(input: {
  emailAddress?: string | null;
  companyId?: string | null;
  leadId?: string | null;
  lead?: Lead | null;
  operation: SuppressionOperation;
}): void {
  const result = checkNotSuppressed(input);
  if (!result.allowed) {
    void touchLastAttemptBlocked(result.suppression.suppressionId);
    throw new SuppressionBlockedError(result);
  }
}

export function getSuppressionExclusionReasonForLead(lead: Lead): string | null {
  const result = checkNotSuppressed({
    lead,
    leadId: lead.id,
    emailAddress: lead.emailCandidates[0] ?? null,
    operation: 'select_draft_candidate',
  });
  if (!result.allowed) {
    return result.blockedReason.replace(/\n/g, ' — ');
  }
  return null;
}

export function isFollowUpSuppressed(lead: Lead): boolean {
  return !checkNotSuppressed({
    lead,
    leadId: lead.id,
    emailAddress: lead.emailCandidates[0] ?? null,
    operation: 'follow_up',
  }).allowed;
}

export function isResendSuppressed(lead: Lead): boolean {
  return !checkNotSuppressed({
    lead,
    leadId: lead.id,
    emailAddress: lead.emailCandidates[0] ?? null,
    operation: 'resend',
  }).allowed;
}

export function getMailOpsMode(): 'mock' | 'live' {
  const value = process.env.MAIL_OPS_MODE?.trim().toLowerCase();
  return value === 'live' ? 'live' : 'mock';
}

export function buildMockUnsubscribeNoticePreview(publicBaseUrl?: string | null): string {
  const base = publicBaseUrl?.trim() || 'http://localhost:3847';
  const mockUrl = `${base}/api/mock/unsubscribe/{token}`;
  return [
    '今後のご案内が不要な場合は、こちらから配信停止できます。',
    `[配信停止リンク] ${mockUrl}`,
    '（mockプレビュー — Gmail下書きには自動挿入されません）',
  ].join('\n');
}

export function shouldShowMockUnsubscribePreview(): boolean {
  return getMailOpsMode() === 'mock' && !process.env.PUBLIC_BASE_URL?.trim();
}
