/**
 * Phase 44.1 — read-only GCS mail-ops suppression structure check.
 * No writes/deletes. No email/token/URL output.
 */
import { createDefaultGcsJsonStoragePort } from '../mail-operations/gcsJsonStoragePort.js';
import { parseMailSuppressionsDocument } from '../mail-operations/gcsDocumentParser.js';
import { MAIL_OPS_SUPPRESSIONS_LOGICAL, MAIL_OPS_TOKENS_LOGICAL } from '../mail-operations/mailOpsPaths.js';

async function main(): Promise<void> {
  process.env.GROWLY_STORAGE_BACKEND = 'gcs';
  process.env.GROWLY_GCS_BUCKET = process.env.GROWLY_GCS_BUCKET || 'growly-sales-daily30';
  process.env.GROWLY_GCS_PREFIX = process.env.GROWLY_GCS_PREFIX || 'prod/growly-sales';

  const storage = createDefaultGcsJsonStoragePort();
  const suppressionRaw = await storage.readJson(MAIL_OPS_SUPPRESSIONS_LOGICAL);
  const tokensRaw = await storage.readJson(MAIL_OPS_TOKENS_LOGICAL);
  const suppressionMeta = await storage.getMetadata(MAIL_OPS_SUPPRESSIONS_LOGICAL);
  const tokensMeta = await storage.getMetadata(MAIL_OPS_TOKENS_LOGICAL);

  const suppressionDoc = parseMailSuppressionsDocument(suppressionRaw);
  const activeCount = suppressionDoc.records.filter(
    (r) => r.status === 'unsubscribed' && !r.reactivatedAt
  ).length;

  console.log(
    JSON.stringify({
      phase: 'gcs-readonly',
      ok: activeCount >= 1 && suppressionDoc.schemaVersion === 1,
      suppression: {
        schemaVersion: suppressionDoc.schemaVersion,
        recordCount: suppressionDoc.records.length,
        activeUnsubscribedCount: activeCount,
        generation: suppressionMeta?.generation ?? null,
      },
      tokens: {
        present: Boolean(tokensRaw?.trim()),
        generation: tokensMeta?.generation ?? null,
      },
    })
  );
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      phase: 'gcs-readonly',
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  );
  process.exit(1);
});
