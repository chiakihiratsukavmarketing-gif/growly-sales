import { hashUnsubscribeTokenWithPepper, normalizeEmailAddress } from './suppressionToken.js';
import type { MailSuppressionStore } from './suppressionTypes.js';
import { SuppressionStoreUnavailableError } from './suppressionTypes.js';
import type { UnsubscribeTokenStore } from './unsubscribeTokenStore.js';
import { requireMailOperationsTenant } from './tenantResolver.js';
import { maskEmailForDisplay } from './emailDisplayPrivacy.js';
import { buildUnsubscribeScreenStateCopy, type UnsubscribeScreenState } from './unsubscribeBranding.js';

export type LiveUnsubscribeScreenResult =
  | {
      ok: true;
      screenState: Extract<UnsubscribeScreenState, 'confirm' | 'already_unsubscribed'>;
      maskedEmail?: string;
      contactEmail: string | null;
    }
  | {
      ok: false;
      screenState: Extract<UnsubscribeScreenState, 'invalid_or_expired' | 'temporary_error'>;
      contactEmail: string | null;
    };

export interface ResolveLiveUnsubscribeTokenInput {
  rawToken: string;
  pepper: string;
  tokenStore: UnsubscribeTokenStore;
  suppressionStore: MailSuppressionStore;
  now?: () => Date;
}

function isExpired(expiresAt: string, now: Date): boolean {
  const t = Date.parse(expiresAt);
  return Number.isNaN(t) || t < now.getTime();
}

export async function resolveLiveUnsubscribeToken(
  input: ResolveLiveUnsubscribeTokenInput
): Promise<{
  screenState: UnsubscribeScreenState;
  title: string;
  message: string;
  actionLabel?: string;
  maskedEmail?: string;
  contactEmail: string | null;
  tokenHash: string | null;
  tenantId: string | null;
  normalizedEmail: string | null;
  leadId?: string;
  companyId?: string;
  sendRecordId?: string;
}> {
  const now = input.now ?? (() => new Date());
  const token = input.rawToken.trim();
  if (!token) {
    // invalid_or_expired (do not distinguish)
    const tenant = requireMailOperationsTenant('want-reach');
    const copy = buildUnsubscribeScreenStateCopy(tenant, 'invalid_or_expired');
    return {
      screenState: copy.state,
      title: copy.title,
      message: copy.message,
      contactEmail: copy.contactEmail,
      tokenHash: null,
      tenantId: null,
      normalizedEmail: null,
    };
  }

  const tokenHash = hashUnsubscribeTokenWithPepper(token, input.pepper);

  let record;
  try {
    record = await input.tokenStore.findByTokenHash(tokenHash);
  } catch {
    record = null;
  }

  if (!record || isExpired(record.expiresAt, now())) {
    const tenant = requireMailOperationsTenant('want-reach');
    const copy = buildUnsubscribeScreenStateCopy(tenant, 'invalid_or_expired');
    return {
      screenState: copy.state,
      title: copy.title,
      message: copy.message,
      contactEmail: copy.contactEmail,
      tokenHash: null,
      tenantId: null,
      normalizedEmail: null,
    };
  }

  let tenant;
  try {
    tenant = requireMailOperationsTenant(record.tenantId);
  } catch {
    const fallback = requireMailOperationsTenant('want-reach');
    const copy = buildUnsubscribeScreenStateCopy(fallback, 'temporary_error');
    return {
      screenState: copy.state,
      title: copy.title,
      message: copy.message,
      contactEmail: copy.contactEmail,
      tokenHash: null,
      tenantId: null,
      normalizedEmail: null,
    };
  }

  const normalizedEmail = normalizeEmailAddress(record.normalizedEmail);
  const maskedEmail = maskEmailForDisplay(normalizedEmail);

  try {
    const existing = await input.suppressionStore.findActive({
      tenantId: record.tenantId,
      normalizedEmail,
    });
    if (existing) {
      const copy = buildUnsubscribeScreenStateCopy(tenant, 'already_unsubscribed');
      return {
        screenState: copy.state,
        title: copy.title,
        message: copy.message,
        maskedEmail: maskedEmail ?? undefined,
        contactEmail: copy.contactEmail,
        tokenHash,
        tenantId: record.tenantId,
        normalizedEmail,
        leadId: record.leadId,
        companyId: record.companyId,
        sendRecordId: record.sendRecordId,
      };
    }
  } catch (err) {
    if (err instanceof SuppressionStoreUnavailableError) {
      const copy = buildUnsubscribeScreenStateCopy(tenant, 'temporary_error');
      return {
        screenState: copy.state,
        title: copy.title,
        message: copy.message,
        contactEmail: copy.contactEmail,
        tokenHash: null,
        tenantId: null,
        normalizedEmail: null,
      };
    }
    const copy = buildUnsubscribeScreenStateCopy(tenant, 'temporary_error');
    return {
      screenState: copy.state,
      title: copy.title,
      message: copy.message,
      contactEmail: copy.contactEmail,
      tokenHash: null,
      tenantId: null,
      normalizedEmail: null,
    };
  }

  const copy = buildUnsubscribeScreenStateCopy(tenant, 'confirm');
  return {
    screenState: copy.state,
    title: copy.title,
    message: copy.message,
    actionLabel: copy.confirmButtonLabel,
    maskedEmail: maskedEmail ?? undefined,
    contactEmail: copy.contactEmail,
    tokenHash,
    tenantId: record.tenantId,
    normalizedEmail,
    leadId: record.leadId,
    companyId: record.companyId,
    sendRecordId: record.sendRecordId,
  };
}

