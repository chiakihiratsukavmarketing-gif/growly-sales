/**
 * Phase 41.5H — GCS compliance 永続化 dry-run（読み取り専用・書き込みなし）
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { loadEnv } from '../config/env.js';
import { getStorageBackend, describeStorageBackendStatus } from '../config/storageBackend.js';
import { loadRawExternalCandidatesStoreFromJson } from '../storage/externalCandidatesRepository.js';
import { loadLeadsOptionalForDaily30 } from '../storage/loadLeadsOptionalForDaily30.js';
import { EXTERNAL_CANDIDATES_JSON } from '../storage/jsonDocumentNames.js';
import { gcsGetObjectMetadata } from '../storage/gcsJsonStorage.js';
import { runPhase415HComplianceDryRun } from '../candidates/phase415hCompliancePersistenceDryRun.js';
import { loadExternalCandidatesFromJson } from '../storage/externalCandidatesRepository.js';
import { isDaily30LeadReviewCandidate } from '../candidates/selectDaily30LeadCandidates.js';
import { resolveDaily30LeadApprovalJudgment } from '../candidates/resolveDaily30LeadApprovalJudgment.js';

const REPORT_PATH = join(
  process.cwd(),
  'data',
  'growly-sales',
  'phase415h-compliance-dry-run-report.json'
);

async function verifyPhase415GPreconditions(
  leads: Awaited<ReturnType<typeof loadLeadsOptionalForDaily30>>
): Promise<number> {
  const enriched = await loadExternalCandidatesFromJson();
  const review = enriched.filter((c) => isDaily30LeadReviewCandidate(c));
  let contradictions = 0;
  for (const c of review) {
    const judgment = resolveDaily30LeadApprovalJudgment(c, leads, enriched);
    if (
      judgment.representativeEmailLabel === '公式サイト代表メール確認済み' &&
      judgment.blockHint?.blockReason?.includes('代表メールが確認できていません')
    ) {
      contradictions++;
    }
  }
  return contradictions;
}

function printSummary(result: ReturnType<typeof runPhase415HComplianceDryRun>): void {
  const s = result.summary;
  console.log('');
  console.log('## 差分分類');
  console.log(`GCS全候補数: ${s.totalCandidates}`);
  console.log(`fresh評価と完全一致: ${s.exactMatch}`);
  console.log(`sourceComplianceStatusのみ相違: ${s.statusOnlyDiff}`);
  console.log(`noteのみ相違: ${s.noteOnlyDiff}`);
  console.log(`status+note両方相違: ${s.statusAndNoteDiff}`);
  console.log(`判定が緩くなる（→承認可能寄り）: ${s.toMorePermissive}`);
  console.log(`判定が厳しくなる（→ブロック寄り）: ${s.toMoreRestrictive}`);
  console.log(`needs_reviewへ変化: ${s.toNeedsReview}`);
  console.log(`emailSourceUrl欠損: ${s.emailSourceUrlMissing}`);
  console.log(`officialSiteUrl欠損: ${s.officialSiteUrlMissing}`);
  console.log(`外部ドメイン由来メール: ${s.externalDomainEmail}`);
  console.log(`personal/placeholder: ${s.personalOrPlaceholder}`);
  console.log(`重複フラグ: ${s.duplicateFlag}`);
  console.log(`imported/excluded（更新対象外）: ${s.importedExcludedSkip}`);
  console.log(`Lead化済み・営業文あり（更新対象外）: ${s.leadHistorySkip}`);
  console.log(`要人間確認（スキップ）: ${s.humanReviewSkip}`);
  console.log(`構造不正・評価例外（スキップ）: ${s.brokenSkip}`);
  console.log(`更新対象候補数: ${s.updateEligible}`);
  console.log(`更新不要候補数: ${s.updateNotNeeded}`);
  console.log(`GCS書き込み: ${s.gcsWritesPerformed}件`);
  console.log(`バックアップ作成: ${s.backupObjectsCreated}件`);

  if (result.samples.length > 0) {
    console.log('');
    console.log('## 更新候補サンプル（最大10件・メールマスク）');
    for (const row of result.samples) {
      console.log(
        `  - ${row.companyName} | ${row.externalCandidateId.slice(0, 8)}… | stored=${row.storedStatus ?? '—'} → fresh=${row.freshStatus} | email=${row.emailMasked}`
      );
    }
  }

  console.log('');
  console.log('## バックアップ案');
  console.log(`  対象: ${result.backupPlan.objectPath}`);
  console.log(`  命名: ${result.backupPlan.backupNamePattern}`);
  for (const step of result.backupPlan.rollbackSteps) {
    console.log(`  ${step}`);
  }

  console.log('');
  console.log('## Phase 41.5H-2 安全設計（apply時）');
  for (const line of result.applySafetyDesign) {
    console.log(`  - ${line}`);
  }
  console.log('');
  console.log(`提案コマンド（人間承認後のみ）: ${result.proposedApplyCommand}`);
}

async function main(): Promise<void> {
  loadEnv();
  const storage = describeStorageBackendStatus();

  console.log('Growly Sales — Phase 41.5H compliance dry-run（読み取り専用）');
  console.log('============================================================');
  console.log(`ストレージ: ${storage.backend}`);
  console.log(`URI: ${storage.externalCandidatesUri}`);
  console.log('');

  const leads = await loadLeadsOptionalForDaily30();
  const preconditionContradictions = await verifyPhase415GPreconditions(leads);
  console.log('## Phase 41.5G 前提確認');
  console.log(
    preconditionContradictions === 0
      ? '✅ UI/API矛盾 0件（enriched読み込み経路）'
      : `❌ UI/API矛盾 ${preconditionContradictions}件 — 永続化へ進まない`
  );
  if (preconditionContradictions > 0) {
    process.exit(1);
  }

  let gcsMetadata: {
    generation: string;
    size: number;
    updated: string | null;
    md5Hash: string | null;
  } | null = null;
  if (getStorageBackend() === 'gcs') {
    const meta = await gcsGetObjectMetadata(EXTERNAL_CANDIDATES_JSON);
    if (meta) {
      gcsMetadata = meta;
      console.log('');
      console.log('## GCSオブジェクトメタ（読み取り）');
      console.log(`generation: ${meta.generation}`);
      console.log(`size: ${meta.size} bytes`);
      console.log(`updated: ${meta.updated ?? '—'}`);
      console.log(`md5Hash: ${meta.md5Hash ? '[記録あり・値は非表示]' : '—'}`);
    }
  }

  const { candidates: rawCandidates, updatedAt: storeUpdatedAt } =
    await loadRawExternalCandidatesStoreFromJson();

  const result = runPhase415HComplianceDryRun({
    rawCandidates,
    existingLeads: leads,
    storageBackend: storage.backend,
    gcsMetadata,
    storeUpdatedAt,
    preconditionContradictions,
  });

  printSummary(result);

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, JSON.stringify(result, null, 2), 'utf-8');
  console.log('');
  console.log(`レポート保存: ${REPORT_PATH}`);
  console.log('');
  console.log('⏸ 人間承認待ち — このPhaseではGCS書き込みは行っていません');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
