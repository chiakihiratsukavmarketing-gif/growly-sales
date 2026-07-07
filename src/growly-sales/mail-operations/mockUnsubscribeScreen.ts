import type { MailOperationsTenant } from './tenantTypes.js';
import {
  buildUnsubscribeScreenStateCopy,
  type UnsubscribeScreenState,
} from './unsubscribeBranding.js';
import { maskEmailForDisplay, maskEmailForDisplayFixture } from './emailDisplayPrivacy.js';
import { requireMailOperationsTenant } from './tenantResolver.js';
import {
  findActiveSuppressionByEmail,
  loadMailSuppressionStore,
  recordSuppressionFromUnsubscribe,
  resolveMockUnsubscribeToken,
  consumeMockUnsubscribeToken,
} from './suppressionStore.js';
import { isMockTokenExpired } from './suppressionToken.js';
import { SuppressionStoreUnavailableError } from './suppressionTypes.js';

export interface MockUnsubscribeScreenResponse {
  ok: boolean;
  screenState: UnsubscribeScreenState;
  title: string;
  message: string;
  actionLabel?: string;
  contactEmail: string | null;
  maskedEmail?: string;
  isMock: true;
  liveConnected: false;
}

function buildScreenResponse(
  tenant: MailOperationsTenant,
  screenState: UnsubscribeScreenState,
  input: { ok: boolean; maskedEmail?: string | null }
): MockUnsubscribeScreenResponse {
  const copy = buildUnsubscribeScreenStateCopy(tenant, screenState);
  const maskedEmail = input.maskedEmail ? input.maskedEmail : undefined;
  return {
    ok: input.ok,
    screenState: copy.state,
    title: copy.title,
    message: copy.message,
    ...(copy.confirmButtonLabel && screenState === 'confirm'
      ? { actionLabel: copy.confirmButtonLabel }
      : {}),
    contactEmail: copy.contactEmail,
    ...(maskedEmail ? { maskedEmail } : {}),
    isMock: true,
    liveConnected: false,
  };
}

function resolveInvalidScreen(tenantId?: string | null): MockUnsubscribeScreenResponse {
  const tenant = requireMailOperationsTenant(tenantId ?? undefined);
  return buildScreenResponse(tenant, 'invalid_or_expired', { ok: false });
}

function resolveTemporaryErrorScreen(tenantId?: string | null): MockUnsubscribeScreenResponse {
  const tenant = requireMailOperationsTenant(tenantId ?? undefined);
  return buildScreenResponse(tenant, 'temporary_error', { ok: false });
}

export function buildDeveloperUnsubscribeScreenPreview(input: {
  tenantId?: string | null;
  screenState: UnsubscribeScreenState;
}): MockUnsubscribeScreenResponse {
  const tenant = requireMailOperationsTenant(input.tenantId ?? undefined);
  const ok =
    input.screenState === 'confirm' ||
    input.screenState === 'completed' ||
    input.screenState === 'already_unsubscribed';
  const maskedEmail =
    input.screenState === 'confirm' || input.screenState === 'already_unsubscribed'
      ? maskEmailForDisplayFixture()
      : undefined;
  return buildScreenResponse(tenant, input.screenState, { ok, maskedEmail });
}

export async function getMockUnsubscribeScreen(token: string): Promise<MockUnsubscribeScreenResponse> {
  let record;
  try {
    record = resolveMockUnsubscribeToken(token);
  } catch {
    return resolveTemporaryErrorScreen();
  }

  if (!record || isMockTokenExpired(record)) {
    return resolveInvalidScreen(record?.tenantId);
  }

  let tenant: MailOperationsTenant;
  try {
    tenant = requireMailOperationsTenant(record.tenantId);
  } catch {
    return resolveTemporaryErrorScreen(record.tenantId);
  }

  let store;
  try {
    store = await loadMailSuppressionStore();
  } catch (err) {
    if (err instanceof SuppressionStoreUnavailableError) {
      return resolveTemporaryErrorScreen(record.tenantId);
    }
    return resolveTemporaryErrorScreen(record.tenantId);
  }

  const maskedEmail = maskEmailForDisplay(record.emailAddress);
  const existing = findActiveSuppressionByEmail(store, {
    tenantId: record.tenantId,
    normalizedEmail: record.normalizedEmail,
  });
  if (existing) {
    return buildScreenResponse(tenant, 'already_unsubscribed', {
      ok: true,
      maskedEmail,
    });
  }

  return buildScreenResponse(tenant, 'confirm', { ok: true, maskedEmail });
}

export async function postMockUnsubscribeScreen(token: string): Promise<MockUnsubscribeScreenResponse> {
  let record;
  try {
    record = resolveMockUnsubscribeToken(token);
  } catch {
    return resolveTemporaryErrorScreen();
  }

  if (!record || isMockTokenExpired(record)) {
    return resolveInvalidScreen(record?.tenantId);
  }

  let tenant: MailOperationsTenant;
  try {
    tenant = requireMailOperationsTenant(record.tenantId);
  } catch {
    return resolveTemporaryErrorScreen(record.tenantId);
  }

  try {
    const { created } = await recordSuppressionFromUnsubscribe({
      tenantId: record.tenantId,
      emailAddress: record.emailAddress,
      leadId: record.leadId,
      companyId: record.companyId,
      tokenHash: record.tokenHash,
    });
    consumeMockUnsubscribeToken(token);
    const screenState = created ? 'completed' : 'already_unsubscribed';
    return buildScreenResponse(tenant, screenState, { ok: true });
  } catch (err) {
    if (err instanceof SuppressionStoreUnavailableError) {
      return resolveTemporaryErrorScreen(record.tenantId);
    }
    return resolveTemporaryErrorScreen(record.tenantId);
  }
}
