import { MailOpsConfigurationError } from './createMailSuppressionStore.js';
import type { MailOpsMode } from './config/mailOpsRuntimeConfig.js';

let pepperOverrideForTests: string | null | undefined;

export function setUnsubscribeTokenPepperForTests(value: string | null | undefined): void {
  pepperOverrideForTests = value;
}

export function resolveUnsubscribeTokenPepper(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (pepperOverrideForTests !== undefined) {
    return pepperOverrideForTests;
  }
  const value = env.UNSUBSCRIBE_TOKEN_PEPPER?.trim();
  return value || null;
}

export function assertUnsubscribeTokenPepperForLive(
  mode: MailOpsMode,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (mode !== 'live') return;
  if (!resolveUnsubscribeTokenPepper(env)) {
    throw new MailOpsConfigurationError('UNSUBSCRIBE_TOKEN_PEPPER が未設定です');
  }
}
