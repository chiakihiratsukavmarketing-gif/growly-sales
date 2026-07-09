import type { MailSuppressionStore } from './suppressionTypes.js';
import type { UnsubscribeTokenRecord } from './gcsDocumentTypes.js';
import type { UnsubscribeTokenStore } from './unsubscribeTokenStore.js';
import { SuppressionStoreUnavailableError } from './suppressionTypes.js';
import { requireMailOperationsTenant } from './tenantResolver.js';
import { maskEmailForDisplay } from './emailDisplayPrivacy.js';
import { buildUnsubscribeScreenStateCopy, type UnsubscribeScreenState } from './unsubscribeBranding.js';
import { hashUnsubscribeTokenWithPepper } from './suppressionToken.js';

export interface LiveUnsubscribeScreenResponse {
  ok: boolean;
  screenState: UnsubscribeScreenState;
  title: string;
  message: string;
  actionLabel?: string;
  contactEmail: string | null;
  maskedEmail?: string;
  isMock: false;
  liveConnected: true;
}

function isExpired(expiresAt: string, nowMs: number): boolean {
  const t = Date.parse(expiresAt);
  return Number.isNaN(t) || t < nowMs;
}

function buildLiveScreenResponse(input: {
  tenantId: string;
  screenState: UnsubscribeScreenState;
  ok: boolean;
  maskedEmail?: string | null;
}): LiveUnsubscribeScreenResponse {
  let tenantId = input.tenantId;
  try {
    requireMailOperationsTenant(tenantId);
  } catch {
    tenantId = 'want-reach';
  }
  const tenant = requireMailOperationsTenant(tenantId);
  const copy = buildUnsubscribeScreenStateCopy(tenant, input.screenState);
  const maskedEmail = input.maskedEmail ? input.maskedEmail : undefined;
  return {
    ok: input.ok,
    screenState: copy.state,
    title: copy.title,
    message: copy.message,
    ...(copy.confirmButtonLabel && input.screenState === 'confirm'
      ? { actionLabel: copy.confirmButtonLabel }
      : {}),
    contactEmail: copy.contactEmail,
    ...(maskedEmail ? { maskedEmail } : {}),
    isMock: false,
    liveConnected: true,
  };
}

export type ResolveLiveUnsubscribeTokenResult =
  | {
      ok: true;
      screen: LiveUnsubscribeScreenResponse;
      tokenHash: string;
      record: UnsubscribeTokenRecord;
    }
  | { ok: false; screen: LiveUnsubscribeScreenResponse };

export async function resolveLiveUnsubscribeToken(input: {
  rawToken: string;
  pepper: string;
  tokenStore: UnsubscribeTokenStore;
  suppressionStore: MailSuppressionStore;
  now?: Date;
}): Promise<ResolveLiveUnsubscribeTokenResult> {
  const now = input.now ?? new Date();
  let tokenHash: string;
  try {
    tokenHash = hashUnsubscribeTokenWithPepper(input.rawToken, input.pepper);
  } catch {
    return {
      ok: false,
      screen: buildLiveScreenResponse({
        tenantId: 'want-reach',
        screenState: 'temporary_error',
        ok: false,
      }),
    };
  }

  let record: UnsubscribeTokenRecord | null;
  try {
    record = await input.tokenStore.findByTokenHash(tokenHash);
  } catch (err) {
    if (err instanceof SuppressionStoreUnavailableError) {
      return {
        ok: false,
        screen: buildLiveScreenResponse({
          tenantId: 'want-reach',
          screenState: 'temporary_error',
          ok: false,
        }),
      };
    }
    return {
      ok: false,
      screen: buildLiveScreenResponse({
        tenantId: 'want-reach',
        screenState: 'temporary_error',
        ok: false,
      }),
    };
  }

  if (!record || isExpired(record.expiresAt, now.getTime())) {
    return {
      ok: false,
      screen: buildLiveScreenResponse({
        tenantId: record?.tenantId ?? 'want-reach',
        screenState: 'invalid_or_expired',
        ok: false,
      }),
    };
  }

  const tenantId = record.tenantId.trim();
  const maskedEmail = maskEmailForDisplay(record.normalizedEmail) ?? null;

  try {
    const existing = await input.suppressionStore.findActive({
      tenantId,
      normalizedEmail: record.normalizedEmail,
    });
    if (existing) {
      return {
        ok: true,
        tokenHash,
        record,
        screen: buildLiveScreenResponse({
          tenantId,
          screenState: 'already_unsubscribed',
          ok: true,
          maskedEmail,
        }),
      };
    }
  } catch (err) {
    if (err instanceof SuppressionStoreUnavailableError) {
      return {
        ok: false,
        screen: buildLiveScreenResponse({
          tenantId,
          screenState: 'temporary_error',
          ok: false,
        }),
      };
    }
    return {
      ok: false,
      screen: buildLiveScreenResponse({
        tenantId,
        screenState: 'temporary_error',
        ok: false,
      }),
    };
  }

  return {
    ok: true,
    tokenHash,
    record,
    screen: buildLiveScreenResponse({
      tenantId,
      screenState: 'confirm',
      ok: true,
      maskedEmail,
    }),
  };
}

