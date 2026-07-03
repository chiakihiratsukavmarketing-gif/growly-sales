/**
 * Phase 41.5G — Lead化承認判定の全候補監査（読み取り専用）
 * GCS / ローカル候補 JSON を読み、判定不整合をカウントします。
 */
import { loadEnv } from '../config/env.js';
import { loadExternalCandidatesFromJson } from '../storage/externalCandidatesRepository.js';
import { loadLeadsOptionalForDaily30 } from '../storage/loadLeadsOptionalForDaily30.js';
import { isDaily30LeadReviewCandidate } from '../candidates/selectDaily30LeadCandidates.js';
import { resolveDaily30LeadApprovalJudgment } from '../candidates/resolveDaily30LeadApprovalJudgment.js';
import { evaluateSourceCompliance } from '../candidates/sourceCompliance.js';
import { todayBatchIdJst } from '../candidates/daily30AreaConfig.js';

async function main(): Promise<void> {
  loadEnv();
  const batchId = todayBatchIdJst();
  const candidates = await loadExternalCandidatesFromJson();
  const leads = await loadLeadsOptionalForDaily30();

  const review = candidates.filter((c) => isDaily30LeadReviewCandidate(c));
  const todayReview = review.filter((c) => c.collectionBatchId === batchId);

  let staleCompliance = 0;
  let contradiction = 0;
  const contradictionSamples: string[] = [];

  for (const c of review) {
    const stored = c.sourceComplianceStatus;
    const fresh = evaluateSourceCompliance(c).status;
    if (stored && stored !== fresh) staleCompliance++;

    const judgment = resolveDaily30LeadApprovalJudgment(c, leads, candidates);
    const badCombo =
      judgment.representativeEmailLabel === '公式サイト代表メール確認済み' &&
      judgment.blockHint?.blockReason?.includes('代表メールが確認できていません');
    if (badCombo) {
      contradiction++;
      if (contradictionSamples.length < 8) {
        contradictionSamples.push(
          `${c.companyName} | stored=${stored ?? '—'} fresh=${fresh} | ${judgment.blockHint?.blockReason}`
        );
      }
    }
  }

  console.log('Growly Sales — Lead化承認判定監査（読み取り専用）');
  console.log('================================================');
  console.log(`batchId (JST today): ${batchId}`);
  console.log(`review candidates (all batches): ${review.length}`);
  console.log(`review candidates (today batch): ${todayReview.length}`);
  console.log(`stored vs fresh compliance mismatch: ${staleCompliance}`);
  console.log(`confirmed-label + cannot-confirm block contradiction: ${contradiction}`);
  if (contradictionSamples.length > 0) {
    console.log('');
    console.log('矛盾サンプル:');
    for (const line of contradictionSamples) console.log(`  - ${line}`);
  }
  console.log('');
  console.log(contradiction === 0 ? '✅ 判定矛盾なし' : '❌ 判定矛盾あり — コード修正または再評価が必要');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
