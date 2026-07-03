/**
 * Phase 41.5H-2 — GCS compliance 永続化 apply（人間承認・二重確認必須）
 */
import type { ExternalLeadCandidate, ExternalCandidatesStore } from '../adapters/externalLeadCandidateTypes.js';
import type { Lead } from '../types/lead.js';
import {
  PHASE415H_APPROVED_BASELINE,
  PHASE415H_COMPLIANCE_FIELDS,
  auditCandidateComplianceDryRun,
  runPhase415HComplianceDryRun,
  type Phase415HCandidateDryRunRow,
  type Phase415HComplianceDryRunResult,
} from './phase415hCompliancePersistenceDryRun.js';

export interface Phase415HApplyArgs {
  apply: boolean;
  confirm: string | null;
}

export interface Phase415HApplyPreApplyExplanation {
  toMorePermissive: number;
  updateEligible: number;
  permissiveNotEligibleCount: number;
  permissiveNotEligible: Phase415HCandidateDryRunRow[];
  restrictiveCandidates: Phase415HCandidateDryRunRow[];
  restrictiveInUpdateEligible: Phase415HCandidateDryRunRow[];
  baselineGeneration: string;
  baselineSize: number;
  baselineMd5Hash: string;
}

export interface Phase415HApplyResult {
  aborted: boolean;
  abortReason: string | null;
  preApplyExplanation: Phase415HApplyPreApplyExplanation | null;
  baselineGeneration: string | null;
  applyGeneration: string | null;
  postWriteGeneration: string | null;
  backupObjectPath: string | null;
  backupVerified: boolean;
  updateCount: number;
  totalCandidates: number;
  candidateIdSetPreserved: boolean;
  nonComplianceDiffCount: number;
  gcsWriteCount: number;
  postAuditStoredFreshMismatch: number;
  postAuditUpdateEligible: number;
}

function normNote(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t || null;
}

export function parsePhase415HApplyArgs(argv: string[]): Phase415HApplyArgs {
  let apply = false;
  let confirm: string | null = null;
  for (const arg of argv) {
    if (arg === '--apply') apply = true;
    else if (arg.startsWith('--confirm=')) confirm = arg.slice('--confirm='.length);
  }
  return { apply, confirm };
}

export function assertApplyArgsOrThrow(args: Phase415HApplyArgs): void {
  if (!args.apply) {
    throw new Error(
      '書き込み禁止: --apply フラグがありません。デフォルトは dry-run のみです。'
    );
  }
  if (!args.confirm) {
    throw new Error(
      '書き込み禁止: --confirm=APPLY_COMPLIANCE_REFRESH が必要です。'
    );
  }
  if (args.confirm !== PHASE415H_APPROVED_BASELINE.confirmPhrase) {
    throw new Error(
      `書き込み禁止: confirm フレーズ不一致（期待: ${PHASE415H_APPROVED_BASELINE.confirmPhrase}）`
    );
  }
}

export function candidateIdSet(candidates: ExternalLeadCandidate[]): Set<string> {
  return new Set(candidates.map((c) => c.externalCandidateId));
}

export function assertCandidateIdSetEqual(
  before: ExternalLeadCandidate[],
  after: ExternalLeadCandidate[],
  label: string
): void {
  const a = candidateIdSet(before);
  const b = candidateIdSet(after);
  if (a.size !== b.size) {
    throw new Error(`${label}: candidateId 件数不一致 ${a.size} vs ${b.size}`);
  }
  for (const id of a) {
    if (!b.has(id)) throw new Error(`${label}: candidateId 欠損 ${id}`);
  }
}

function cloneWithoutComplianceFields(
  candidate: ExternalLeadCandidate
): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(candidate)) as Record<string, unknown>;
  for (const field of PHASE415H_COMPLIANCE_FIELDS) {
    delete clone[field];
  }
  return clone;
}

export function countNonComplianceDiffs(
  before: ExternalLeadCandidate[],
  after: ExternalLeadCandidate[]
): number {
  if (before.length !== after.length) {
    throw new Error('候補配列長不一致');
  }
  let diffs = 0;
  for (let i = 0; i < before.length; i++) {
    const a = cloneWithoutComplianceFields(before[i]);
    const b = cloneWithoutComplianceFields(after[i]);
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs++;
  }
  return diffs;
}

export function assertArrayOrderPreserved(
  before: ExternalLeadCandidate[],
  after: ExternalLeadCandidate[]
): void {
  if (before.length !== after.length) {
    throw new Error('配列順検証: 件数不一致');
  }
  for (let i = 0; i < before.length; i++) {
    if (before[i].externalCandidateId !== after[i].externalCandidateId) {
      throw new Error(
        `配列順変更検出: index ${i} ${before[i].externalCandidateId} → ${after[i].externalCandidateId}`
      );
    }
  }
}

function rowMatchesBaseline(
  fresh: Phase415HCandidateDryRunRow,
  baseline: Phase415HCandidateDryRunRow
): boolean {
  return (
    fresh.externalCandidateId === baseline.externalCandidateId &&
    fresh.freshStatus === baseline.freshStatus &&
    normNote(fresh.freshNote) === normNote(baseline.freshNote)
  );
}

export function buildPreApplyExplanation(
  dryRun: Phase415HComplianceDryRunResult
): Phase415HApplyPreApplyExplanation {
  const restrictiveInUpdateEligible = dryRun.updateEligibleCandidates.filter(
    (r) => r.toMoreRestrictive
  );
  return {
    toMorePermissive: dryRun.summary.toMorePermissive,
    updateEligible: dryRun.summary.updateEligible,
    permissiveNotEligibleCount: dryRun.permissiveNotEligible.length,
    permissiveNotEligible: dryRun.permissiveNotEligible,
    restrictiveCandidates: dryRun.restrictiveCandidates,
    restrictiveInUpdateEligible,
    baselineGeneration: dryRun.summary.gcsObjectGeneration ?? '',
    baselineSize: dryRun.summary.gcsObjectSize ?? 0,
    baselineMd5Hash: dryRun.summary.gcsObjectMd5 ?? '',
  };
}

export function applyComplianceFieldsToCandidates(
  rawCandidates: ExternalLeadCandidate[],
  eligibleRows: Phase415HCandidateDryRunRow[],
  checkedAt: string
): ExternalLeadCandidate[] {
  const byId = new Map(eligibleRows.map((r) => [r.externalCandidateId, r]));
  return rawCandidates.map((c) => {
    const row = byId.get(c.externalCandidateId);
    if (!row) return c;
    return {
      ...c,
      sourceComplianceStatus: row.freshStatus,
      sourceComplianceNote: row.freshNote,
      sourceComplianceCheckedAt: checkedAt,
    };
  });
}

export function buildStoreJsonText(
  candidates: ExternalLeadCandidate[],
  updatedAt: string | null,
  note: string | null
): string {
  const store: ExternalCandidatesStore = {
    candidates,
    updatedAt: updatedAt ?? new Date().toISOString(),
    note: note ?? '外部営業候補（直接Lead化しない。人間確認後にのみ取り込み）',
  };
  return JSON.stringify(store, null, 2);
}

export function validateGcsMetadataMatchesBaseline(
  meta: { generation: string; size: number; md5Hash: string | null },
  baseline: typeof PHASE415H_APPROVED_BASELINE,
  label: string
): void {
  if (meta.generation !== baseline.expectedGeneration) {
    throw new Error(
      `${label}: generation 不一致（現在=${meta.generation} 期待=${baseline.expectedGeneration}）。最新データで dry-run を再実行し、人間承認を取り直してください。`
    );
  }
  if (meta.size !== baseline.expectedSize) {
    throw new Error(
      `${label}: size 不一致（現在=${meta.size} 期待=${baseline.expectedSize}）`
    );
  }
  if ((meta.md5Hash ?? '') !== baseline.expectedMd5Hash) {
    throw new Error(`${label}: md5Hash 不一致`);
  }
}

export function validateFreshDryRunMatchesBaselineReport(
  freshDryRun: Phase415HComplianceDryRunResult,
  baselineReport: Phase415HComplianceDryRunResult
): void {
  const baseline = PHASE415H_APPROVED_BASELINE;
  if (freshDryRun.summary.totalCandidates !== baseline.expectedTotalCandidates) {
    throw new Error(
      `候補総数不一致: ${freshDryRun.summary.totalCandidates}（期待 ${baseline.expectedTotalCandidates}）`
    );
  }
  if (freshDryRun.summary.updateEligible !== baseline.expectedUpdateEligible) {
    throw new Error(
      `更新対象件数不一致: ${freshDryRun.summary.updateEligible}（期待 ${baseline.expectedUpdateEligible}）`
    );
  }
  if (freshDryRun.summary.brokenSkip > 0) {
    throw new Error(`構造不正・評価例外: ${freshDryRun.summary.brokenSkip}件`);
  }
  if (freshDryRun.summary.humanReviewSkip > 0) {
    throw new Error(`要人間確認スキップ: ${freshDryRun.summary.humanReviewSkip}件`);
  }

  const baselineEligible = baselineReport.updateEligibleCandidates ?? [];
  const freshEligible = freshDryRun.updateEligibleCandidates;
  if (baselineEligible.length !== freshEligible.length) {
    throw new Error(
      `baseline report と fresh の eligible 件数不一致: ${baselineEligible.length} vs ${freshEligible.length}`
    );
  }

  const baselineById = new Map(
    baselineEligible.map((r) => [r.externalCandidateId, r])
  );
  for (const fresh of freshEligible) {
    const base = baselineById.get(fresh.externalCandidateId);
    if (!base) {
      throw new Error(
        `dry-run 対象外の candidateId が eligible に含まれています: ${fresh.externalCandidateId}`
      );
    }
    if (!rowMatchesBaseline(fresh, base)) {
      throw new Error(
        `fresh 評価が baseline dry-run と不一致: ${fresh.externalCandidateId}`
      );
    }
  }

  const restrictiveInEligible = freshEligible.filter((r) => r.toMoreRestrictive);
  if (restrictiveInEligible.length > 0) {
    const detail = restrictiveInEligible
      .map(
        (r) =>
          `${r.companyName} (${r.externalCandidateId}) stored=${r.storedStatus} fresh=${r.freshStatus}`
      )
      .join('; ');
    throw new Error(
      `厳しくなる候補が更新対象に含まれています — 人間確認が必要: ${detail}`
    );
  }
}

export function runPhase415H2ComplianceApplyAudit(
  rawCandidates: ExternalLeadCandidate[],
  existingLeads: Lead[]
): Phase415HComplianceDryRunResult['summary'] & {
  storedFreshMismatch: number;
} {
  const rows = rawCandidates.map((c) =>
    auditCandidateComplianceDryRun(c, existingLeads, rawCandidates)
  );
  const storedFreshMismatch = rows.filter((r) => !r.exactComplianceMatch).length;
  const summary = runPhase415HComplianceDryRun({
    rawCandidates,
    existingLeads,
    storageBackend: 'gcs',
    gcsMetadata: null,
    storeUpdatedAt: null,
    preconditionContradictions: 0,
  }).summary;
  return { ...summary, storedFreshMismatch };
}
