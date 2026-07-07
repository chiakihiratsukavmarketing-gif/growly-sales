import { isGcsPreconditionFailure } from '../storage/gcsJsonStorage.js';
import { SuppressionStoreUnavailableError } from './suppressionTypes.js';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_INITIAL_DELAY_MS = 200;
const BACKOFF_SCHEDULE_MS = [200, 400, 800, 1600, 3200] as const;

export interface GenerationMatchRetryOptions<T> {
  maxAttempts?: number;
  initialDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
  operation: (attempt: number) => Promise<T>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitteredDelay(baseMs: number): number {
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(baseMs * 0.25)));
  return baseMs + jitter;
}

function delayForAttempt(attempt: number, initialDelayMs: number): number {
  const index = Math.min(attempt - 1, BACKOFF_SCHEDULE_MS.length - 1);
  const scheduled = BACKOFF_SCHEDULE_MS[index] ?? initialDelayMs;
  return jitteredDelay(scheduled);
}

function isNonRetryableStoreError(err: unknown): boolean {
  if (err instanceof SuppressionStoreUnavailableError) return true;
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: number; name?: string };
  if (e.code === 401 || e.code === 403) return true;
  if (e.name === 'SyntaxError') return true;
  return false;
}

export async function withGenerationMatchRetry<T>(
  options: GenerationMatchRetryOptions<T>
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw new SuppressionStoreUnavailableError('配信禁止リスト操作が中断されました');
    }
    try {
      return await options.operation(attempt);
    } catch (err) {
      lastError = err;
      if (isNonRetryableStoreError(err)) {
        throw err;
      }
      if (!isGcsPreconditionFailure(err)) {
        throw new SuppressionStoreUnavailableError();
      }
      if (attempt >= maxAttempts) {
        break;
      }
      await sleep(delayForAttempt(attempt, initialDelayMs));
    }
  }
  throw lastError instanceof SuppressionStoreUnavailableError
    ? lastError
    : new SuppressionStoreUnavailableError('配信禁止リストへの保存に失敗しました（競合）');
}

export { BACKOFF_SCHEDULE_MS, DEFAULT_INITIAL_DELAY_MS, DEFAULT_MAX_ATTEMPTS };
