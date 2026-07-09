import type { GcsJsonStoragePort } from './gcsJsonStoragePort.js';
import { tryCreateUnsubscribeTokenStore } from './createUnsubscribeTokenStore.js';
import { MailOpsConfigurationError } from './mailOpsConfigurationError.js';
import { buildUnsubscribeUrl } from './publicUrlResolver.js';
import { registerMockUnsubscribeToken, resolveMockUnsubscribeToken } from './suppressionStore.js';
import {
  generateUnsubscribeToken,
  hashUnsubscribeTokenWithPepper,
  normalizeEmailAddress,
} from './suppressionToken.js';
import { SuppressionStoreUnavailableError } from './suppressionTypes.js';
import {
  assertUnsubscribeUrlIssueReadiness,
  resolveSalesUnsubscribeTokenIssueSource,
} from './salesUnsubscribeTokenIssueSource.js';
import { resolveUnsubscribeTokenPepper } from './resolveUnsubscribeTokenPepper.js';
import type {
  IssueUnsubscribeTokenForOutreachInput,
  IssuedUnsubscribeTokenForOutreach,
} from './unsubscribeTokenIssueTypes.js';
import {
  DEFAULT_UNSUBSCRIBE_TOKEN_TTL_MS,
  UnsubscribeTokenIssueError,
} from './unsubscribeTokenIssueTypes.js';

let unsubscribeTokenIssueStorageOverride: GcsJsonStoragePort | null = null;

export function setUnsubscribeTokenIssueStoragePortForTests(
  storage: GcsJsonStoragePort | null
): void {
  unsubscribeTokenIssueStorageOverride = storage;
}

function resolveIssueStorage(input?: GcsJsonStoragePort): GcsJsonStoragePort | undefined {
  if (input) return input;
  if (unsubscribeTokenIssueStorageOverride) return unsubscribeTokenIssueStorageOverride;
  return undefined;
}

function issueMockUnsubscribeTokenForOutreach(
  input: IssueUnsubscribeTokenForOutreachInput
): IssuedUnsubscribeTokenForOutreach {
  const { token, previewPath } = registerMockUnsubscribeToken({
    tenantId: input.tenantId,
    leadId: input.leadId,
    companyId: input.companyId,
    emailAddress: input.emailAddress,
    ttlMs: input.ttlMs,
  });
  const record = resolveMockUnsubscribeToken(token);
  if (!record) {
    throw new UnsubscribeTokenIssueError();
  }
  return {
    tenantId: record.tenantId,
    normalizedEmail: record.normalizedEmail,
    tokenHash: record.tokenHash,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    rawToken: token,
    unsubscribeUrl: previewPath,
  };
}

async function issueLiveGcsUnsubscribeTokenForOutreach(
  input: IssueUnsubscribeTokenForOutreachInput,
  env: NodeJS.ProcessEnv
): Promise<IssuedUnsubscribeTokenForOutreach> {
  const tenantId = input.tenantId.trim();
  const emailAddress = input.emailAddress.trim();
  if (!tenantId || !emailAddress) {
    throw new UnsubscribeTokenIssueError();
  }

  assertUnsubscribeUrlIssueReadiness({ tenantId, env });

  const pepper = resolveUnsubscribeTokenPepper(env);
  if (!pepper) {
    throw new MailOpsConfigurationError('UNSUBSCRIBE_TOKEN_PEPPER が未設定です');
  }

  const store = tryCreateUnsubscribeTokenStore({
    env,
    gcsStorage: resolveIssueStorage(),
  });
  if (!store) {
    throw new UnsubscribeTokenIssueError();
  }

  const rawToken = generateUnsubscribeToken();
  let unsubscribeUrl: string;
  try {
    unsubscribeUrl = buildUnsubscribeUrl({ tenantId, token: rawToken });
  } catch {
    throw new UnsubscribeTokenIssueError();
  }

  const tokenHash = hashUnsubscribeTokenWithPepper(rawToken, pepper);
  const now = new Date();
  const ttlMs = input.ttlMs ?? DEFAULT_UNSUBSCRIBE_TOKEN_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const createdAt = now.toISOString();
  const normalizedEmail = normalizeEmailAddress(emailAddress);

  try {
    await store.add({
      tokenHash,
      tenantId,
      leadId: input.leadId?.trim() || undefined,
      companyId: input.companyId?.trim() || undefined,
      sendRecordId: input.sendRecordId?.trim() || undefined,
      normalizedEmail,
      expiresAt,
      createdAt,
    });
  } catch (err) {
    if (err instanceof SuppressionStoreUnavailableError) throw err;
    throw new UnsubscribeTokenIssueError();
  }

  return {
    tenantId,
    normalizedEmail,
    tokenHash,
    expiresAt,
    createdAt,
    rawToken,
    unsubscribeUrl,
  };
}

export async function issueUnsubscribeTokenForOutreach(
  input: IssueUnsubscribeTokenForOutreachInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<IssuedUnsubscribeTokenForOutreach> {
  const source = resolveSalesUnsubscribeTokenIssueSource(env);
  if (source === 'mock') {
    return issueMockUnsubscribeTokenForOutreach(input);
  }
  return issueLiveGcsUnsubscribeTokenForOutreach(input, env);
}
