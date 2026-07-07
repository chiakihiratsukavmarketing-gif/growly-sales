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
  getMockUnsubscribeScreen,
  postMockUnsubscribeScreen,
} from '../mockUnsubscribeScreen.js';
import type { GcsJsonStoragePort } from '../gcsJsonStoragePort.js';

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
  buildHealth(): MailOpsHealthResponse;
  healthHttpStatus(health: MailOpsHealthResponse): number;
  canProcessUnsubscribe(config: MailOpsRuntimeConfig, readiness: MailOpsLiveReadinessResult): boolean;
  getMockUnsubscribeScreen(token: string): ReturnType<typeof getMockUnsubscribeScreen>;
  postMockUnsubscribeScreen(token: string): ReturnType<typeof postMockUnsubscribeScreen>;
}

export interface CreateMailOpsServerContextInput {
  env?: NodeJS.ProcessEnv;
  gcsStorage?: GcsJsonStoragePort;
  config?: MailOpsRuntimeConfig;
}

export function createMailOpsServerContext(
  input: CreateMailOpsServerContextInput = {}
): MailOpsServerContext {
  const env = input.env ?? process.env;

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
      return createMailSuppressionStore(storeInput);
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
    return tryCreateStore(config, readiness) !== null;
  };

  return {
    loadConfig,
    validateReadiness,
    isLiveConnected,
    tryCreateStore,
    buildHealth,
    healthHttpStatus,
    canProcessUnsubscribe,
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
