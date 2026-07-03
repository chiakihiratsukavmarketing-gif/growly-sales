/**
 * Phase 41.5H-2 — GCS compliance 永続化 apply
 * デフォルトは書き込み禁止。--apply と --confirm=APPLY_COMPLIANCE_REFRESH の両方が必要。
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnv } from '../config/env.js';
import {
  getStorageBackend,
  getGcsBucketName,
} from '../config/storageBackend.js';
import { loadRawExternalCandidatesStoreFromJson } from '../storage/externalCandidatesRepository.js';
import { loadLeadsOptionalForDaily30 } from '../storage/loadLeadsOptionalForDaily30.js';
import { EXTERNAL_CANDIDATES_JSON } from '../storage/jsonDocumentNames.js';
import {
  gcsBackupBeforeWrite,
  gcsGetObjectMetadata,
  gcsGetObjectMetadataAtPath,
  gcsReadJsonAtPath,
  gcsWriteJsonIfGenerationMatch,
} from '../storage/gcsJsonStorage.js';
import {
  PHASE415H_APPROVED_BASELINE,
  runPhase415HComplianceDryRun,
  type Phase415HComplianceDryRunResult,
} from '../candidates/phase415hCompliancePersistenceDryRun.js';
import {
  applyComplianceFieldsToCandidates,
  assertApplyArgsOrThrow,
  assertArrayOrderPreserved,
  assertCandidateIdSetEqual,
  buildPreApplyExplanation,
  buildStoreJsonText,
  countNonComplianceDiffs,
  parsePhase415HApplyArgs,
  validateFreshDryRunMatchesBaselineReport,
  validateGcsMetadataMatchesBaseline,
} from '../candidates/phase415hCompliancePersistenceApply.js';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';

const REPORT_PATH = join(
  process.cwd(),
  'data',
  'growly-sales',
  'phase415h-compliance-dry-run-report.json'
);

function printPreApplyExplanation(
  exp: ReturnType<typeof buildPreApplyExplanation>
): void {
  console.log('');
  console.log('## apply 前の最終説明');
  console.log(
    `緩くなる ${exp.toMorePermissive} 件のうち永続化対象 ${exp.updateEligible} 件 — 差分 ${exp.permissiveNotEligibleCount} 件は imported/excluded 等で更新対象外`
  );
  if (exp.permissiveNotEligible.length > 0) {
    console.log('更新対象外（permissive だが skip）:');
    for (const r of exp.permissiveNotEligible) {
      console.log(
        `  - ${r.companyName} | ${r.externalCandidateId} | skip=${r.skipReason} | import=${r.importStatus} | pipeline=${r.pipelineStatus}`
      );
    }
  }
  console.log(`厳しくなる候補: ${exp.restrictiveCandidates.length} 件`);
  for (const r of exp.restrictiveCandidates) {
    const in23 = exp.restrictiveInUpdateEligible.some(
      (x) => x.externalCandidateId === r.externalCandidateId
    );
    console.log(
      `  - ${r.companyName} | ${r.externalCandidateId} | stored=${r.storedStatus} → fresh=${r.freshStatus} | 23件に含まれる=${in23} | skip=${r.skipReason ?? '—'} | import=${r.importStatus}`
    );
    console.log(`    変更理由: stored代表確認=${r.storedRepresentativeVerified} fresh代表確認=${r.freshRepresentativeVerified} freshBlock=${r.freshLeadApprovalBlocked}`);
  }
  console.log(
    `sourceComplianceCheckedAt: ExternalLeadCandidate の optional フィールドとして追加。JSON parse 互換・enrich 時も上書き対象外の単純メタデータ。`
  );
  console.log(`baseline generation: ${exp.baselineGeneration}`);
  console.log(`baseline size: ${exp.baselineSize} bytes`);
}

async function loadBaselineReport(): Promise<Phase415HComplianceDryRunResult> {
  const raw = await readFile(REPORT_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as Phase415HComplianceDryRunResult;
  if (!parsed.updateEligibleCandidates?.length) {
    throw new Error(
      'baseline report に updateEligibleCandidates がありません。npm run growly-sales:phase415h-compliance-dry-run を再実行してください。'
    );
  }
  return parsed;
}

async function verifyBackup(
  sourceMeta: { size: number; md5Hash: string | null },
  backupPath: string,
  sourceCandidates: ExternalLeadCandidate[]
): Promise<void> {
  const backupMeta = await gcsGetObjectMetadataAtPath(backupPath);
  if (!backupMeta) {
    throw new Error(`バックアップオブジェクトが存在しません: ${backupPath}`);
  }
  if (backupMeta.size !== sourceMeta.size) {
    throw new Error(
      `バックアップ size 不一致: backup=${backupMeta.size} source=${sourceMeta.size}`
    );
  }
  if ((backupMeta.md5Hash ?? '') !== (sourceMeta.md5Hash ?? '')) {
    throw new Error('バックアップ md5Hash 不一致');
  }
  const backupText = await gcsReadJsonAtPath(backupPath);
  if (!backupText) throw new Error('バックアップ JSON 読み込み失敗');
  let parsed: { candidates?: ExternalLeadCandidate[] };
  try {
    parsed = JSON.parse(backupText);
  } catch {
    throw new Error('バックアップ JSON parse 失敗');
  }
  const backupCandidates = Array.isArray(parsed)
    ? (parsed as ExternalLeadCandidate[])
    : (parsed.candidates ?? []);
  assertCandidateIdSetEqual(sourceCandidates, backupCandidates, 'バックアップ');
  if (backupCandidates.length !== sourceCandidates.length) {
    throw new Error('バックアップ候補件数不一致');
  }
}

async function main(): Promise<void> {
  loadEnv();
  const args = parsePhase415HApplyArgs(process.argv.slice(2));

  console.log('Growly Sales — Phase 41.5H-2 compliance apply');
  console.log('==============================================');
  console.log(`モード: ${args.apply ? 'APPLY（書き込み）' : 'プレビュー（書き込み禁止）'}`);

  if (getStorageBackend() !== 'gcs') {
    throw new Error('GCS バックエンド以外では apply できません');
  }

  const baselineReport = await loadBaselineReport();
  const leads = await loadLeadsOptionalForDaily30();

  const gcsMeta = await gcsGetObjectMetadata(EXTERNAL_CANDIDATES_JSON);
  if (!gcsMeta) throw new Error('GCS オブジェクトが見つかりません');

  console.log('');
  console.log('## apply 直前 GCS メタ');
  console.log(`generation: ${gcsMeta.generation}`);
  console.log(`size: ${gcsMeta.size} bytes`);
  console.log(`md5Hash: ${gcsMeta.md5Hash ? '[記録あり・値は非表示]' : '—'}`);

  try {
    validateGcsMetadataMatchesBaseline(
      gcsMeta,
      PHASE415H_APPROVED_BASELINE,
      'apply直前'
    );
  } catch (err) {
    console.error('');
    console.error(String(err instanceof Error ? err.message : err));
    console.error('→ generation 等が変化しています。dry-run を再実行し、人間承認を取り直してください。');
    process.exit(1);
  }

  const { candidates: rawCandidates, updatedAt, note } =
    await loadRawExternalCandidatesStoreFromJson();

  if (rawCandidates.length !== PHASE415H_APPROVED_BASELINE.expectedTotalCandidates) {
    throw new Error(
      `候補件数不一致: ${rawCandidates.length}（期待 ${PHASE415H_APPROVED_BASELINE.expectedTotalCandidates}）`
    );
  }

  const freshDryRun = runPhase415HComplianceDryRun({
    rawCandidates,
    existingLeads: leads,
    storageBackend: 'gcs',
    gcsMetadata: gcsMeta,
    storeUpdatedAt: updatedAt,
    preconditionContradictions: 0,
  });

  const preExplain = buildPreApplyExplanation(freshDryRun);
  printPreApplyExplanation(preExplain);

  try {
    validateFreshDryRunMatchesBaselineReport(freshDryRun, baselineReport);
  } catch (err) {
    console.error('');
    console.error('❌ apply 直前再評価失敗:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log('');
  console.log('✅ apply 直前再評価: 23件一致・要人間確認0・評価例外0');

  if (!args.apply) {
    console.log('');
    console.log('⏸ 書き込みなし — apply するには:');
    console.log(
      '  npm run growly-sales:phase415h-compliance-apply -- --apply --confirm=APPLY_COMPLIANCE_REFRESH'
    );
    return;
  }

  try {
    assertApplyArgsOrThrow(args);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const checkedAt = new Date().toISOString();
  const updatedCandidates = applyComplianceFieldsToCandidates(
    rawCandidates,
    freshDryRun.updateEligibleCandidates,
    checkedAt
  );

  assertArrayOrderPreserved(rawCandidates, updatedCandidates);
  assertCandidateIdSetEqual(rawCandidates, updatedCandidates, '更新前後');
  const nonComplianceDiffs = countNonComplianceDiffs(rawCandidates, updatedCandidates);
  if (nonComplianceDiffs > 0) {
    throw new Error(`compliance 以外の差分: ${nonComplianceDiffs}件 — apply 中止`);
  }

  const jsonText = buildStoreJsonText(updatedCandidates, updatedAt, note);
  JSON.parse(jsonText);

  console.log('');
  console.log('## バックアップ作成');
  const backupPath = await gcsBackupBeforeWrite(EXTERNAL_CANDIDATES_JSON);
  if (!backupPath) throw new Error('バックアップ作成失敗');
  const bucket = getGcsBucketName();
  const backupUri = `gs://${bucket}/${backupPath}`;
  console.log(`バックアップ: ${backupUri}`);

  await verifyBackup(gcsMeta, backupPath, rawCandidates);
  console.log('✅ バックアップ検証: 存在・size・md5・parse・件数・candidateId 一致');

  console.log('');
  console.log('## 本体更新（1回のみ）');
  await gcsWriteJsonIfGenerationMatch(
    EXTERNAL_CANDIDATES_JSON,
    jsonText,
    gcsMeta.generation
  );
  console.log('✅ GCS 書き込み完了（generation precondition 使用）');

  const postMeta = await gcsGetObjectMetadata(EXTERNAL_CANDIDATES_JSON);
  if (!postMeta) throw new Error('書き込み後メタ読み込み失敗');
  console.log(`書き込み後 generation: ${postMeta.generation}`);

  const { candidates: reloaded } = await loadRawExternalCandidatesStoreFromJson();
  assertCandidateIdSetEqual(rawCandidates, reloaded, '書き込み後再読込');
  assertArrayOrderPreserved(rawCandidates, reloaded);

  const postNonCompliance = countNonComplianceDiffs(
    updatedCandidates,
    reloaded
  );
  if (postNonCompliance > 0) {
    console.error('');
    console.error('❌ 書き込み後検証失敗: compliance 以外の差分あり');
    console.error(`バックアップ: ${backupUri}`);
    console.error('人間承認なしに自動復元しません。');
    process.exit(1);
  }

  const postDryRun = runPhase415HComplianceDryRun({
    rawCandidates: reloaded,
    existingLeads: leads,
    storageBackend: 'gcs',
    gcsMetadata: postMeta,
    storeUpdatedAt: updatedAt,
    preconditionContradictions: 0,
  });

  let eligibleFreshMatch = 0;
  for (const row of freshDryRun.updateEligibleCandidates) {
    const c = reloaded.find((x) => x.externalCandidateId === row.externalCandidateId);
    if (!c) continue;
    const storedStatus = c.sourceComplianceStatus ?? null;
    const storedNote = c.sourceComplianceNote?.trim() || null;
    if (storedStatus === row.freshStatus && storedNote === (row.freshNote?.trim() || null)) {
      eligibleFreshMatch++;
    }
  }

  console.log('');
  console.log('## 書き込み後再監査');
  console.log(`候補総数: ${reloaded.length}`);
  console.log(`更新対象 fresh 一致: ${eligibleFreshMatch}/${freshDryRun.updateEligibleCandidates.length}`);
  console.log(`stored vs fresh 不一致（全体）: ${postDryRun.summary.totalCandidates - postDryRun.summary.exactMatch}`);
  console.log(`更新対象候補数（再dry-run）: ${postDryRun.summary.updateEligible}`);
  console.log(`GCS書き込み回数: 1`);
  console.log(`Gmail操作: 0`);
  console.log(`Lead化: 0`);

  if (eligibleFreshMatch !== freshDryRun.updateEligibleCandidates.length) {
    console.error('❌ 更新23件の fresh 一致検証失敗');
    console.error(`バックアップ: ${backupUri}`);
    process.exit(1);
  }

  if (postDryRun.summary.updateEligible > 0) {
    console.error(`❌ 書き込み後も updateEligible=${postDryRun.summary.updateEligible} — 人間へ報告`);
    console.error(`バックアップ: ${backupUri}`);
    process.exit(1);
  }

  console.log('');
  console.log('次: npm run growly-sales:audit-lead-approval-judgment');
  console.log('次: npm run growly-sales:phase415h-compliance-dry-run');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
