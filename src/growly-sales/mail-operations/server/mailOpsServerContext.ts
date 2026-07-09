import type { MailSuppressionStore } from '../suppressionTypes.js';
import {
  loadMailOpsRuntimeConfig,
  isMailOpsLiveExternallyConnected,
  type MailOpsRuntimeConfig,
} from '../config/mailOpsRuntimeConfig.js';
import {
  validateMailOpsLiveReadiness,
  type MailOpsLiveReadinessResult,
} from '../validateMailOpsLiveReadiness.js';
import {
  createMailSuppressionStore,
  type CreateMailSuppressionStoreInput,
} from '../createMailSuppressionStore.js';
import {
  createUnsubscribeTokenStore,
  type CreateUnsubscribeTokenStoreInput,
} from '../createUnsubscribeTokenStore.js';
import {
  getMockUnsubscribeScreen,
  postMockUnsubscribeScreen,
} from '../mockUnsubscribeScreen.js';
import type { GcsJsonStoragePort } from '../gcsJsonStoragePort.js';
import type { UnsubscribeTokenStore } from '../unsubscribeTokenStore.js';
import { requireMailOperationsTenant } from '../tenantResolver.js';
import { resolveUnsubscribeTokenPepper } from '../resolveUnsubscribeTokenPepper.js';
import { resolveLiveUnsubscribeToken } from '../resolveLiveUnsubscribeToken.js';
import { buildUnsubscribeScreenStateCopy } from '../unsubscribeBranding.js';
import { randomUUID } from 'node:crypto';
import { SuppressionStoreUnavailableError } from '../suppressionTypes.js';

export interface MailOpsHealthResponse {
  ok: boolean;
  service: string;
  mode: 'mock' | 'live';
  liveConnected: boolean;
  storageReady: boolean;
  missingConfiguration?: string[];
}

export interface MailOpsServerContext {
  loadConfig(): MailOpsRuntimeConfig;
  validateReadiness(config: MailOpsRuntimeConfig): MailOpsLiveReadinessResult;
  isLiveConnected(config: MailOpsRuntimeConfig, readiness: MailOpsLiveReadinessResult): boolean;
  tryCreateStore(config: MailOpsRuntimeConfig, readiness: MailOpsLiveReadinessResult): MailSuppressionStore | null;
  tryCreateTokenStore(
    config: MailOpsRuntimeConfig,
    readiness: MailOpsLiveReadinessResult
  ): UnsubscribeTokenStore | null;
  buildHealth(): MailOpsHealthResponse;
  healthHttpStatus(health: MailOpsHealthResponse): number;
  canProcessUnsubscribe(config: MailOpsRuntimeConfig, readiness: MailOpsLiveReadinessResult): boolean;
  getLiveUnsubscribeScreen(token: string): Promise<{
    ok: boolean;
    screenState: UnsubscribeScreenState;
    title: string;
    message: string;
    actionLabel?: string;
    maskedEmail?: string;
    contactEmail: string | null;
    isMock: false;
    liveConnected: true;
  }>;
  postLiveUnsubscribeScreen(token: string): Promise<{
    ok: boolean;
    screenState: UnsubscribeScreenState;
    title: string;
    message: string;
    actionLabel?: string;
    maskedEmail?: string;
    contactEmail: string | null;
    isMock: false;
    liveConnected: true;
  }>;
  getMockUnsubscribeScreen(token: string): ReturnType<typeof getMockUnsubscribeScreen>;
  postMockUnsubscribeScreen(token: string): ReturnType<typeof postMockUnsubscribeScreen>;
}

export interface CreateMailOpsServerContextInput {
  env?: NodeJS.ProcessEnv;
  gcsStorage?: GcsJsonStoragePort;
  config?: MailOpsRuntimeConfig;
  suppressionStore?: MailSuppressionStore;
  tokenStore?: UnsubscribeTokenStore;
  now?: () => Date;
}

export function createMailOpsServerContext(
  input: CreateMailOpsServerContextInput = {}
): MailOpsServerContext {
  const env = input.env ?? process.env;
  const now = input.now ?? (() => new Date());

  const loadConfig = (): MailOpsRuntimeConfig => input.config ?? loadMailOpsRuntimeConfig(env);

  const validateReadiness = (config: MailOpsRuntimeConfig): MailOpsLiveReadinessResult =>
    validateMailOpsLiveReadiness(config);

  const isLiveConnected = (
    config: MailOpsRuntimeConfig,
    readiness: MailOpsLiveReadinessResult
  ): boolean =>
    config.mode === 'live' &&
    readiness.ready &&
    isMailOpsLiveExternallyConnected(env);

  const tryCreateStore = (
    config: MailOpsRuntimeConfig,
    readiness: MailOpsLiveReadinessResult
  ): MailSuppressionStore | null => {
    if (config.mode === 'mock') {
      return createMailSuppressionStore({
        mode: 'mock',
        storageBackend: 'local',
        env,
        gcsStorage: input.gcsStorage,
      });
    }
    if (!readiness.ready) {
      return null;
    }
    try {
      const storeInput: CreateMailSuppressionStoreInput = {
        mode: 'live',
        storageBackend: 'gcs',
        env,
        gcsStorage: input.gcsStorage,
      };
      return input.suppressionStore ?? createMailSuppressionStore(storeInput);
    } catch {
      return null;
    }
  };

  const tryCreateTokenStore = (
    config: MailOpsRuntimeConfig,
    readiness: MailOpsLiveReadinessResult
  ): UnsubscribeTokenStore | null => {
    if (config.mode === 'mock') {
      return createUnsubscribeTokenStore({
        mode: 'mock',
        storageBackend: 'local',
        env,
        gcsStorage: input.gcsStorage,
      });
    }
    if (!readiness.ready) {
      return null;
    }
    try {
      const storeInput: CreateUnsubscribeTokenStoreInput = {
        mode: 'live',
        storageBackend: 'gcs',
        env,
        gcsStorage: input.gcsStorage,
      };
      return input.tokenStore ?? createUnsubscribeTokenStore(storeInput);
    } catch {
      return null;
    }
  };

  const buildHealth = (): MailOpsHealthResponse => {
    const config = loadConfig();
    const readiness = validateReadiness(config);
    const liveConnected = isLiveConnected(config, readiness);

    if (config.mode === 'mock') {
      return {
        ok: true,
        service: config.serviceName,
        mode: 'mock',
        liveConnected: false,
        storageReady: true,
      };
    }

    if (!readiness.ready) {
      return {
        ok: false,
        service: config.serviceName,
        mode: 'live',
        liveConnected: false,
        storageReady: false,
        missingConfiguration: readiness.missing,
      };
    }

    const store = tryCreateStore(config, readiness);
    const tokenStore = tryCreateTokenStore(config, readiness);
    const storageReady = store !== null && tokenStore !== null;
    return {
      ok: storageReady,
      service: config.serviceName,
      mode: 'live',
      liveConnected,
      storageReady,
      ...(!storageReady
        ? {
            missingConfiguration: [
              ...(store === null ? ['SUPPRESSION_STORE_INIT'] : []),
              ...(tokenStore === null ? ['TOKEN_STORE_INIT'] : []),
            ],
          }
        : {}),
    };
  };

  const healthHttpStatus = (health: MailOpsHealthResponse): number => (health.ok ? 200 : 503);

  const canProcessUnsubscribe = (
    config: MailOpsRuntimeConfig,
    readiness: MailOpsLiveReadinessResult
  ): boolean => {
    if (config.mode === 'mock') return true;
    if (!readiness.ready) return false;
    if (!isLiveConnected(config, readiness)) return false;
    return tryCreateStore(config, readiness) !== null && tryCreateTokenStore(config, readiness) !== null;
  };

  const buildLiveState = (tenantId: string, state: 'confirm' | 'completed' | 'already_unsubscribed' | 'invalid_or_expired' | 'temporary_error', maskedEmail?: string) => {
    const tenant = requireMailOperationsTenant(tenantId);
    const copy = buildUnsubscribeScreenStateCopy(tenant, state);
    return {
      ok: state === 'confirm' || state === 'completed' || state === 'already_unsubscribed',
      screenState: copy.state,
      title: copy.title,
      message: copy.message,
      ...(copy.confirmButtonLabel && state === 'confirm' ? { actionLabel: copy.confirmButtonLabel } : {}),
      ...(maskedEmail ? { maskedEmail } : {}),
      contactEmail: copy.contactEmail,
      isMock: false as const,
      liveConnected: true as const,
    };
  };

  const addSuppressionFromUnsubscribe = async (params: {
    suppressionStore: MailSuppressionStore;
    tenantId: string;
    normalizedEmail: string;
    leadId?: string;
    companyId?: string;
    tokenHash: string;
  }): Promise<{ created: boolean }> => {
    const candidate = params.suppressionStore as unknown as {
      addFromUnsubscribe?: (x: {
        tenantId: string;
        emailAddress: string;
        leadId?: string;
        companyId?: string;
        tokenHash: string;
      }) => Promise<{ record: unknown; created: boolean }>;
    };
    if (typeof candidate.addFromUnsubscribe === 'function') {
      const result = await candidate.addFromUnsubscribe({
        tenantId: params.tenantId,
        emailAddress: params.normalizedEmail,
        leadId: params.leadId,
        companyId: params.companyId,
        tokenHash: params.tokenHash,
      });
      return { created: Boolean(result.created) };
    }

    const existing = await params.suppressionStore.findActive({
      tenantId: params.tenantId,
      normalizedEmail: params.normalizedEmail,
    });
    if (existing) return { created: false };

    const ts = now().toISOString();
    await params.suppressionStore.add({
      suppressionId: randomUUID(),
      tenantId: params.tenantId,
      emailAddress: params.normalizedEmail,
      normalizedEmail: params.normalizedEmail,
      status: 'unsubscribed',
      reason: '配信停止リンクからの停止',
      source: 'unsubscribe_link',
      tokenHash: params.tokenHash,
      unsubscribedAt: ts,
      createdAt: ts,
      updatedAt: ts,
      leadId: params.leadId,
      companyId: params.companyId,
    });
    return { created: true };
  };

  const getLiveUnsubscribeScreen = async (token: string) => {
    const config = loadConfig();
    const readiness = validateReadiness(config);
    const suppressionStore = input.suppressionStore ?? tryCreateStore(config, readiness);
    const tokenStore = input.tokenStore ?? tryCreateTokenStore(config, readiness);
    if (!suppressionStore || !tokenStore) {
      return buildLiveState('want-reach', 'temporary_error');
    }

    const pepper = resolveUnsubscribeTokenPepper(env);
    if (!pepper) {
      return buildLiveState('want-reach', 'temporary_error');
    }

    const resolved = await resolveLiveUnsubscribeToken({
      rawToken: token,
      pepper,
      tokenStore,
      suppressionStore,
      now: now(),
    });
    return resolved.screen;
  };

  const postLiveUnsubscribeScreen = async (token: string) => {
    const config = loadConfig();
    const readiness = validateReadiness(config);
    const suppressionStore = input.suppressionStore ?? tryCreateStore(config, readiness);
    const tokenStore = input.tokenStore ?? tryCreateTokenStore(config, readiness);
    const pepper = resolveUnsubscribeTokenPepper(env);
    if (!suppressionStore || !tokenStore || !pepper) {
      return buildLiveState('want-reach', 'temporary_error');
    }

    const resolved = await resolveLiveUnsubscribeToken({
      rawToken: token,
      pepper,
      tokenStore,
      suppressionStore,
      now: now(),
    });

    if (!resolved.ok) {
      return resolved.screen;
    }

    const tenantId = resolved.record.tenantId.trim() || 'want-reach';
    const normalizedEmail = resolved.record.normalizedEmail.trim().toLowerCase();

    // If already unsubscribed, keep idempotent result (no writes).
    if (resolved.screen.screenState === 'already_unsubscribed') {
      return resolved.screen;
    }

    // confirm → write suppression, then best-effort markUsed
    try {
      const { created } = await addSuppressionFromUnsubscribe({
        suppressionStore,
        tenantId,
        normalizedEmail,
        leadId: resolved.record.leadId,
        companyId: resolved.record.companyId,
        tokenHash: resolved.tokenHash,
      });

      // save verification: suppression is primary
      const verified = await suppressionStore.findActive({ tenantId, normalizedEmail });
      if (!verified) {
        return buildLiveState(tenantId, 'temporary_error');
      }

      try {
        await tokenStore.markUsed({ tokenHash: resolved.tokenHash, usedAt: now().toISOString() });
      } catch {
        console.warn('[mail-ops] token usedAt update failed; suppression persisted');
      }

      const next = created ? 'completed' : 'already_unsubscribed';
      return buildLiveState(tenantId, next, resolved.screen.maskedEmail);
    } catch (err) {
      if (err instanceof SuppressionStoreUnavailableError) {
        return buildLiveState(tenantId, 'temporary_error');
      }
      return buildLiveState(tenantId, 'temporary_error');
    }
  };

  return {
    loadConfig,
    validateReadiness,
    isLiveConnected,
    tryCreateStore,
    tryCreateTokenStore,
    buildHealth,
    healthHttpStatus,
    canProcessUnsubscribe,
    getLiveUnsubscribeScreen,
    postLiveUnsubscribeScreen,
    getMockUnsubscribeScreen,
    postMockUnsubscribeScreen,
  };
}

let defaultContext: MailOpsServerContext | null = null;

export function getMailOpsServerContext(): MailOpsServerContext {
  if (!defaultContext) {
    defaultContext = createMailOpsServerContext();
  }
  return defaultContext;
}

export function setMailOpsServerContextForTests(context: MailOpsServerContext | null): void {
  defaultContext = context;
}
