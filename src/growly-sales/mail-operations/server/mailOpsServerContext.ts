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
} from '../createMailSuppressionStore.js';
import {
  getMockUnsubscribeScreen,
  postMockUnsubscribeScreen,
} from '../mockUnsubscribeScreen.js';
import type { GcsJsonStoragePort } from '../gcsJsonStoragePort.js';
import type { UnsubscribeTokenStore } from '../unsubscribeTokenStore.js';
import type { MailOperationsTenant } from '../tenantTypes.js';
import { requireMailOperationsTenant } from '../tenantResolver.js';
import { resolveUnsubscribeTokenPepper } from '../resolveUnsubscribeTokenPepper.js';
import { resolveLiveUnsubscribeToken } from '../resolveLiveUnsubscribeToken.js';
import type { UnsubscribeScreenState } from '../unsubscribeBranding.js';
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
    return {
      ok: store !== null,
      service: config.serviceName,
      mode: 'live',
      liveConnected,
      storageReady: store !== null,
      ...(store === null ? { missingConfiguration: ['SUPPRESSION_STORE_INIT'] } : {}),
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

  const buildLiveScreenResponse = (
    tenant: MailOperationsTenant,
    screenState: UnsubscribeScreenState,
    input: {
      ok: boolean;
      message: string;
      title: string;
      actionLabel?: string;
      maskedEmail?: string;
    }
  ) => {
    return {
      ok: input.ok,
      screenState,
      title: input.title,
      message: input.message,
      ...(input.actionLabel ? { actionLabel: input.actionLabel } : {}),
      ...(input.maskedEmail ? { maskedEmail: input.maskedEmail } : {}),
      contactEmail: tenant.contactEmail?.trim() || null,
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
      const tenant = requireMailOperationsTenant('want-reach');
      return buildLiveScreenResponse(tenant, 'temporary_error', {
        ok: false,
        title: '一時的に処理できません',
        message: '現在、配信停止のお手続きを完了できません。お手数ですがお問い合わせください。',
      });
    }

    const pepper = resolveUnsubscribeTokenPepper(env);
    if (!pepper) {
      const tenant = requireMailOperationsTenant('want-reach');
      return buildLiveScreenResponse(tenant, 'temporary_error', {
        ok: false,
        title: '一時的に処理できません',
        message: '現在、配信停止のお手続きを完了できません。お手数ですがお問い合わせください。',
      });
    }

    const resolved = await resolveLiveUnsubscribeToken({
      rawToken: token,
      pepper,
      tokenStore,
      suppressionStore,
      now,
    });
    const tenant = requireMailOperationsTenant(resolved.tenantId ?? 'want-reach');
    return buildLiveScreenResponse(tenant, resolved.screenState, {
      ok: resolved.screenState === 'confirm' || resolved.screenState === 'already_unsubscribed',
      title: resolved.title,
      message: resolved.message,
      actionLabel: resolved.actionLabel,
      maskedEmail: resolved.maskedEmail,
    });
  };

  const postLiveUnsubscribeScreen = async (token: string) => {
    const config = loadConfig();
    const readiness = validateReadiness(config);
    const suppressionStore = input.suppressionStore ?? tryCreateStore(config, readiness);
    const tokenStore = input.tokenStore ?? tryCreateTokenStore(config, readiness);
    const pepper = resolveUnsubscribeTokenPepper(env);
    if (!suppressionStore || !tokenStore || !pepper) {
      const tenant = requireMailOperationsTenant('want-reach');
      return buildLiveScreenResponse(tenant, 'temporary_error', {
        ok: false,
        title: '一時的に処理できません',
        message: '現在、配信停止のお手続きを完了できません。お手数ですがお問い合わせください。',
      });
    }

    const resolved = await resolveLiveUnsubscribeToken({
      rawToken: token,
      pepper,
      tokenStore,
      suppressionStore,
      now,
    });

    const tenant = requireMailOperationsTenant(resolved.tenantId ?? 'want-reach');
    if (resolved.screenState === 'invalid_or_expired' || resolved.screenState === 'temporary_error') {
      return buildLiveScreenResponse(tenant, resolved.screenState, {
        ok: false,
        title: resolved.title,
        message: resolved.message,
      });
    }

    // confirm or already_unsubscribed: ensure suppression persisted idempotently
    try {
      const normalizedEmail = (resolved.normalizedEmail ?? '').trim().toLowerCase();
      if (!normalizedEmail) {
        return buildLiveScreenResponse(tenant, 'temporary_error', {
          ok: false,
          title: '一時的に処理できません',
          message: '現在、配信停止のお手続きを完了できません。お手数ですがお問い合わせください。',
        });
      }
      const { created } = await addSuppressionFromUnsubscribe({
        suppressionStore,
        tenantId: resolved.tenantId ?? 'want-reach',
        normalizedEmail,
        leadId: resolved.leadId,
        companyId: resolved.companyId,
        tokenHash: resolved.tokenHash ?? 'invalid',
      });

      // token usedAt: best-effort; suppression is primary
      if (resolved.tokenHash) {
        try {
          await tokenStore.markUsed({ tokenHash: resolved.tokenHash, usedAt: now().toISOString() });
        } catch {
          // suppression already persisted; keep safe
        }
      }

      const nextState: UnsubscribeScreenState =
        created ? 'completed' : 'already_unsubscribed';
      const title = nextState === 'completed' ? '配信を停止しました' : resolved.title;
      const message =
        nextState === 'completed'
          ? '今後、このアドレス宛に営業・ご案内メールは送信しません。'
          : resolved.message;
      return buildLiveScreenResponse(tenant, nextState, {
        ok: true,
        title,
        message,
        maskedEmail: resolved.maskedEmail,
      });
    } catch (err) {
      if (err instanceof SuppressionStoreUnavailableError) {
        return buildLiveScreenResponse(tenant, 'temporary_error', {
          ok: false,
          title: '一時的に処理できません',
          message: '現在、配信停止のお手続きを完了できません。しばらくしてから再度お試しください。',
        });
      }
      return buildLiveScreenResponse(tenant, 'temporary_error', {
        ok: false,
        title: '一時的に処理できません',
        message: '現在、配信停止のお手続きを完了できません。しばらくしてから再度お試しください。',
      });
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
