import { loadEnv } from '../config/env.js';
import { loadMailOpsRuntimeConfig } from '../mail-operations/config/mailOpsRuntimeConfig.js';
import { validateMailOpsLiveReadiness } from '../mail-operations/validateMailOpsLiveReadiness.js';
import { createMailOpsServerContext } from '../mail-operations/server/mailOpsServerContext.js';

const MAIL_OPS_ROUTES = ['GET /health', 'GET /u/:token', 'POST /u/:token'] as const;

async function main(): Promise<void> {
  loadEnv();

  const config = loadMailOpsRuntimeConfig();
  const readiness = validateMailOpsLiveReadiness(config);
  const ctx = createMailOpsServerContext({ config });
  const health = ctx.buildHealth();

  console.log('Growly Sales — mail-ops startup validation');
  console.log('==========================================');
  console.log(`mode: ${config.mode}`);
  console.log(`ready: ${config.mode === 'mock' ? true : readiness.ready}`);
  console.log(`liveConnected: ${health.liveConnected}`);
  console.log(`storageReady: ${health.storageReady}`);
  console.log(`routes: ${MAIL_OPS_ROUTES.join(', ')}`);

  if (config.mode === 'live' && readiness.missing.length > 0) {
    console.log(`missing: ${readiness.missing.join(', ')}`);
  } else if (health.missingConfiguration?.length) {
    console.log(`missing: ${health.missingConfiguration.join(', ')}`);
  }

  if (config.mode === 'mock') {
    process.exit(0);
  }

  if (readiness.ready && health.ok) {
    process.exit(0);
  }

  process.exit(1);
}

main().catch(() => {
  process.exit(1);
});
