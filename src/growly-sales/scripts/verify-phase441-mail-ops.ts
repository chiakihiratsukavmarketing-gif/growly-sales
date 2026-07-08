import assert from 'node:assert';

async function verifyPhase441TokenStoreAndHandlers(): Promise<void> {
  const {
    InMemoryGcsJsonStorage,
    GcsUnsubscribeTokenStore,
    parseUnsubscribeTokensDocument,
    createMailOpsServerContext,
    InMemoryUnsubscribeTokenStore,
  } = await import('../mail-operations/index.js');

  // 1) token doc schema + fail-closed
  {
    const parsed = parseUnsubscribeTokensDocument(
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        records: [
          {
            tokenHash: 'hash',
            tenantId: 'want-reach',
            normalizedEmail: 'a@example.com',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            createdAt: new Date().toISOString(),
          },
        ],
      })
    );
    assert(parsed.records.length === 1, 'token doc parses');
    let threw = false;
    try {
      parseUnsubscribeTokensDocument('{not-json');
    } catch {
      threw = true;
    }
    assert(threw, 'token doc corrupt json fails closed');
  }

  // 2) GCS token store generation-match (in-memory)
  {
    process.env.GROWLY_GCS_PREFIX = 'prod/growly-sales';
    const storage = new InMemoryGcsJsonStorage();
    const store = new GcsUnsubscribeTokenStore({
      storage,
      now: () => new Date('2026-07-01T00:00:00.000Z'),
    });
    await store.add({
      tokenHash: 'hash-1',
      tenantId: 'want-reach',
      normalizedEmail: 'gen@example.com',
      expiresAt: new Date('2026-07-02T00:00:00.000Z').toISOString(),
      createdAt: new Date('2026-07-01T00:00:00.000Z').toISOString(),
    });
    const found = await store.findByTokenHash('hash-1');
    assert(found?.tokenHash === 'hash-1', 'token store find works');
    await store.markUsed({ tokenHash: 'hash-1', usedAt: '2026-07-01T01:00:00.000Z' });
    await store.markUsed({ tokenHash: 'hash-1', usedAt: '2026-07-01T02:00:00.000Z' });
    const after = await store.findByTokenHash('hash-1');
    assert(after?.usedAt === '2026-07-01T01:00:00.000Z', 'usedAt is idempotent');
  }

  // 3) liveConnected=false guard: no store required (fail-closed)
  {
    const ctx = createMailOpsServerContext({
      env: { ...process.env, MAIL_OPS_MODE: 'live' },
    });
    const config = ctx.loadConfig();
    const readiness = ctx.validateReadiness(config);
    assert(!ctx.canProcessUnsubscribe(config, readiness), 'live guard blocks when not connected/ready');
  }

  // 4) liveConnected=true with in-memory adapters: GET confirm / POST completed
  {
    const tokenStore = new InMemoryUnsubscribeTokenStore();
    await tokenStore.add({
      tokenHash: 'hash-token',
      tenantId: 'want-reach',
      normalizedEmail: 'live@example.com',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: new Date().toISOString(),
    });

    const suppressionRecords: { normalizedEmail: string }[] = [];
    const suppressionStore = {
      listByTenant: async () => [],
      findActive: async (input: { normalizedEmail: string }) =>
        suppressionRecords.some((r) => r.normalizedEmail === input.normalizedEmail) ? ({} as any) : null,
      add: async (input: { normalizedEmail: string }) => {
        suppressionRecords.push({ normalizedEmail: input.normalizedEmail });
        return input as any;
      },
      update: async (input: any) => input,
    };

    const ctx = createMailOpsServerContext({
      env: {
        ...process.env,
        MAIL_OPS_MODE: 'live',
        MAIL_OPS_LIVE_EXTERNAL_CONNECTED: 'true',
        PUBLIC_BASE_URL: 'https://mailops.wantreach.jp',
        GROWLY_STORAGE_BACKEND: 'gcs',
        GROWLY_GCS_BUCKET: 'configured',
        GROWLY_GCS_PREFIX: 'configured',
        UNSUBSCRIBE_TOKEN_PEPPER: 'pepper',
      },
      suppressionStore: suppressionStore as any,
      tokenStore,
      now: () => new Date('2026-07-01T00:00:00.000Z'),
    });

    // rawToken is never persisted; tokenHash is derived internally. For this verify we call handlers directly
    // by feeding a token whose hash matches.
    const { hashUnsubscribeTokenWithPepper } = await import('../mail-operations/suppressionToken.js');
    const rawToken = 'raw-token-should-not-leak';
    const tokenHash = hashUnsubscribeTokenWithPepper(rawToken, 'pepper');
    await tokenStore.add({
      tokenHash,
      tenantId: 'want-reach',
      normalizedEmail: 'live@example.com',
      expiresAt: new Date('2026-07-02T00:00:00.000Z').toISOString(),
      createdAt: new Date('2026-07-01T00:00:00.000Z').toISOString(),
    });

    const get = await ctx.getLiveUnsubscribeScreen(rawToken);
    assert(get.screenState === 'confirm' || get.screenState === 'already_unsubscribed', 'GET returns confirm');
    assert(get.isMock === false && get.liveConnected === true, 'GET live flags');

    const post = await ctx.postLiveUnsubscribeScreen(rawToken);
    assert(
      post.screenState === 'completed' || post.screenState === 'already_unsubscribed',
      'POST returns completed/already'
    );
    assert(post.isMock === false && post.liveConnected === true, 'POST live flags');
  }
}

async function main(): Promise<void> {
  console.log('Growly Sales — Verify Phase 44.1 mail-ops');
  console.log('=========================================');
  await verifyPhase441TokenStoreAndHandlers();
  console.log('All Phase 44.1 mail-ops verifications passed ✅');
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Verify fatal error:', message);
  process.exit(1);
});

