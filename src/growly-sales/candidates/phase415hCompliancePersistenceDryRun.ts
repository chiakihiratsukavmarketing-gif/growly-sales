/**
 * Phase 41.5H — GCS compliance 永続化 dry-run（読み取り専用）
 */
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { Lead } from '../types/lead.js';
import type { Daily30SourceComplianceStatus } from './daily30CollectionProfile.js';
import {
  evaluateSourceCompliance,
  getOfficialSiteUrl,
  getPrimaryEmailSourceUrl,
  isEmailSourceFromExternalListingSite,
} from './sourceCompliance.js';
import { resolveDaily30LeadApprovalJudgment } from './resolveDaily30LeadApprovalJudgment.js';
import {
  isPersonalEmailAddress,
  isPlaceholderEmailAddress,
} from './resolveEmailSourceDisplay.js';
import { findDuplicateReason } from '../adapters/dedupeExternalCandidates.js';

export const PHASE415H_COMPLIANCE_FIELDS = [
  'sourceComplianceStatus',
  'sourceComplianceNote',
  'sourceComplianceCheckedAt',
] as const;

export const PHASE415H_PROPOSED_CHECKED_AT_FIELD = 'sourceComplianceCheckedAt';

/** 人間承認済み dry-run 基準（Phase 41.5H） */
export const PHASE415H_APPROVED_BASELINE = {
  expectedGeneration: '1782965285076398',
  expectedSize: 467577,
  expectedMd5Hash: 'F6RlRQ4xTUcptA+8KtwQpQ==',
  expectedTotalCandidates: 156,
  expectedUpdateEligible: 23,
  confirmPhrase: 'APPLY_COMPLIANCE_REFRESH',
} as const;

export function maskEmailForReport(email: string | null | undefined): string {
  const e = email?.trim();
  if (!e) return '—';
  const at = e.indexOf('@');
  if (at <= 1) return '***@***';
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const maskedLocal = local.length <= 2 ? '**' : `${local.slice(0, 2)}***`;
  const dot = domain.lastIndexOf('.');
  const maskedDomain =
    dot > 0 ? `***${domain.slice(dot)}` : '***';
  return `${maskedLocal}@${maskedDomain}`;
}

function normNote(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t || null;
}

function isValidHttpUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export type Phase415HSkipReason =
  | 'missing_candidate_id'
  | 'broken_structure'
  | 'invalid_official_site_url'
  | 'invalid_email_source_url'
  | 'evaluation_error'
  | 'imported_or_excluded'
  | 'lead_approved_or_imported'
  | 'duplicate_pipeline'
  | 'ambiguous_human_review'
  | 'policy_unknown_legacy';

export interface Phase415HCandidateDryRunRow {
  externalCandidateId: string;
  companyName: string;
  collectionBatchId: string | null;
  storedStatus: Daily30SourceComplianceStatus | null;
  freshStatus: Daily30SourceComplianceStatus;
  storedNote: string | null;
  freshNote: string | null;
  storedRepresentativeVerified: boolean;
  freshRepresentativeVerified: boolean;
  storedLeadApprovalBlocked: boolean;
  freshLeadApprovalBlocked: boolean;
  freshBlockReason: string | null;
  emailMasked: string;
  officialSiteUrl: string | null;
  emailSourceUrl: string | null;
  discoverySourceUrl: string | null;
  importStatus: string;
  pipelineStatus: string;
  skipReason: Phase415HSkipReason | null;
  updateEligible: boolean;
  exactComplianceMatch: boolean;
  statusOnlyDiff: boolean;
  noteOnlyDiff: boolean;
  toMorePermissive: boolean;
  toMoreRestrictive: boolean;
  toNeedsReview: boolean;
  emailSourceUrlMissing: boolean;
  officialSiteUrlMissing: boolean;
  externalDomainEmail: boolean;
  personalOrPlaceholder: boolean;
  duplicateFlag: boolean;
}

export interface Phase415HComplianceDryRunSummary {
  generatedAt: string;
  storageBackend: string;
  gcsObjectGeneration: string | null;
  gcsObjectSize: number | null;
  gcsObjectUpdated: string | null;
  gcsObjectMd5: string | null;
  storeUpdatedAt: string | null;
  preconditionContradictions: number;
  totalCandidates: number;
  exactMatch: number;
  statusOnlyDiff: number;
  noteOnlyDiff: number;
  statusAndNoteDiff: number;
  toMorePermissive: number;
  toMoreRestrictive: number;
  toNeedsReview: number;
  emailSourceUrlMissing: number;
  officialSiteUrlMissing: number;
  externalDomainEmail: number;
  personalOrPlaceholder: number;
  duplicateFlag: number;
  importedExcludedSkip: number;
  leadHistorySkip: number;
  humanReviewSkip: number;
  brokenSkip: number;
  updateEligible: number;
  updateNotNeeded: number;
  gcsWritesPerformed: 0;
  backupObjectsCreated: 0;
}

export interface Phase415HComplianceDryRunResult {
  summary: Phase415HComplianceDryRunSummary;
  samples: Phase415HCandidateDryRunRow[];
  updateEligibleCandidates: Phase415HCandidateDryRunRow[];
  restrictiveCandidates: Phase415HCandidateDryRunRow[];
  permissiveNotEligible: Phase415HCandidateDryRunRow[];
  humanReviewRequired: Phase415HCandidateDryRunRow[];
  backupPlan: {
    objectPath: string;
    backupNamePattern: string;
    rollbackSteps: string[];
  };
  applySafetyDesign: string[];
  proposedApplyCommand: string;
}

function storedWouldRepresentativeVerify(
  status: Daily30SourceComplianceStatus | null | undefined
): boolean {
  return status === 'official_site_verified';
}

function isImportedOrExcluded(candidate: ExternalLeadCandidate): boolean {
  return (
    candidate.importStatus === 'excluded' ||
    candidate.importStatus === 'duplicate' ||
    candidate.importStatus === 'imported' ||
    candidate.pipelineStatus === 'excluded' ||
    candidate.pipelineStatus === 'duplicate'
  );
}

function isLeadHistoryLocked(candidate: ExternalLeadCandidate): boolean {
  return (
    candidate.importStatus === 'approved_for_lead' ||
    candidate.importStatus === 'imported' ||
    Boolean(candidate.copyGeneratedAt) ||
    Boolean(candidate.generatedEmailBody)
  );
}

function detectSkipReason(
  candidate: ExternalLeadCandidate,
  evalError: string | null
): Phase415HSkipReason | null {
  if (!candidate.externalCandidateId?.trim()) return 'missing_candidate_id';
  if (!candidate.companyName?.trim()) return 'broken_structure';
  if (evalError) return 'evaluation_error';
  if (isImportedOrExcluded(candidate)) return 'imported_or_excluded';
  if (isLeadHistoryLocked(candidate)) return 'lead_approved_or_imported';

  const official = getOfficialSiteUrl(candidate);
  const emailSource = getPrimaryEmailSourceUrl(candidate);
  if (official && !isValidHttpUrl(official)) return 'invalid_official_site_url';
  if (emailSource && !isValidHttpUrl(emailSource)) return 'invalid_email_source_url';

  const email =
    candidate.targetEmail?.trim() ||
    candidate.emailCandidates?.find((e) => e.trim())?.trim() ||
    '';
  if (email) {
    const fresh = evaluateSourceCompliance(candidate);
    if (fresh.status === 'needs_human_review' && candidate.sourceComplianceStatus === 'blocked_by_policy') {
      return 'ambiguous_human_review';
    }
  }

  return null;
}

export function auditCandidateComplianceDryRun(
  candidate: ExternalLeadCandidate,
  existingLeads: Lead[],
  allCandidates: ExternalLeadCandidate[]
): Phase415HCandidateDryRunRow {
  const email =
    candidate.targetEmail?.trim() ||
    candidate.emailCandidates?.find((e) => e.trim())?.trim() ||
    '';
  let freshStatus: Daily30SourceComplianceStatus = 'email_not_found';
  let freshNote: string | null = null;
  let freshRepresentativeVerified = false;
  let freshLeadApprovalBlocked = false;
  let freshBlockReason: string | null = null;
  let evalError: string | null = null;

  try {
    const compliance = evaluateSourceCompliance(candidate);
    freshStatus = compliance.status;
    freshNote = compliance.note;
    freshRepresentativeVerified = compliance.status === 'official_site_verified';
    const judgment = resolveDaily30LeadApprovalJudgment(candidate, existingLeads, allCandidates);
    freshLeadApprovalBlocked = judgment.blockHint !== null;
    freshBlockReason = judgment.blockHint?.blockReason ?? null;
  } catch (err) {
    evalError = err instanceof Error ? err.message : String(err);
  }

  const storedStatus = candidate.sourceComplianceStatus ?? null;
  const storedNote = normNote(candidate.sourceComplianceNote);
  const storedRepresentativeVerified = storedWouldRepresentativeVerify(storedStatus);
  const storedLeadApprovalBlocked = Boolean(
    findDuplicateReason(candidate, existingLeads, allCandidates) ||
      (storedStatus && storedStatus !== 'official_site_verified')
  );

  const skipReason = detectSkipReason(candidate, evalError);
  const exactComplianceMatch =
    storedStatus === freshStatus && normNote(storedNote) === normNote(freshNote);
  const statusOnlyDiff = storedStatus !== freshStatus && normNote(storedNote) === normNote(freshNote);
  const noteOnlyDiff = storedStatus === freshStatus && normNote(storedNote) !== normNote(freshNote);

  const toMorePermissive =
    !storedRepresentativeVerified && freshRepresentativeVerified && !freshLeadApprovalBlocked;
  const toMoreRestrictive =
    storedRepresentativeVerified && (freshLeadApprovalBlocked || !freshRepresentativeVerified);
  const toNeedsReview =
    freshStatus === 'needs_human_review' && storedStatus !== 'needs_human_review';

  const emailSourceUrlMissing = Boolean(email) && !getPrimaryEmailSourceUrl(candidate);
  const officialSiteUrlMissing = !getOfficialSiteUrl(candidate);
  const externalDomainEmail = isEmailSourceFromExternalListingSite(candidate);
  const personalOrPlaceholder =
    Boolean(email) &&
    (isPlaceholderEmailAddress(email) || isPersonalEmailAddress(email));
  const duplicateFlag =
    candidate.pipelineStatus === 'duplicate' ||
    candidate.importStatus === 'duplicate' ||
    Boolean(findDuplicateReason(candidate, existingLeads, allCandidates));

  const updateEligible = skipReason === null && !exactComplianceMatch;

  return {
    externalCandidateId: candidate.externalCandidateId,
    companyName: candidate.companyName,
    collectionBatchId: candidate.collectionBatchId ?? null,
    storedStatus,
    freshStatus,
    storedNote,
    freshNote,
    storedRepresentativeVerified,
    freshRepresentativeVerified,
    storedLeadApprovalBlocked,
    freshLeadApprovalBlocked,
    freshBlockReason,
    emailMasked: maskEmailForReport(email),
    officialSiteUrl: getOfficialSiteUrl(candidate),
    emailSourceUrl: getPrimaryEmailSourceUrl(candidate),
    discoverySourceUrl: candidate.discoverySourceUrl ?? null,
    importStatus: candidate.importStatus,
    pipelineStatus: candidate.pipelineStatus,
    skipReason,
    updateEligible,
    exactComplianceMatch,
    statusOnlyDiff,
    noteOnlyDiff,
    toMorePermissive,
    toMoreRestrictive,
    toNeedsReview,
    emailSourceUrlMissing,
    officialSiteUrlMissing,
    externalDomainEmail,
    personalOrPlaceholder,
    duplicateFlag,
  };
}

export function runPhase415HComplianceDryRun(input: {
  rawCandidates: ExternalLeadCandidate[];
  existingLeads: Lead[];
  storageBackend: string;
  gcsMetadata?: {
    generation: string;
    size: number;
    updated: string | null;
    md5Hash: string | null;
  } | null;
  storeUpdatedAt: string | null;
  preconditionContradictions: number;
}): Phase415HComplianceDryRunResult {
  const rows = input.rawCandidates.map((c) =>
    auditCandidateComplianceDryRun(c, input.existingLeads, input.rawCandidates)
  );

  const summary: Phase415HComplianceDryRunSummary = {
    generatedAt: new Date().toISOString(),
    storageBackend: input.storageBackend,
    gcsObjectGeneration: input.gcsMetadata?.generation ?? null,
    gcsObjectSize: input.gcsMetadata?.size ?? null,
    gcsObjectUpdated: input.gcsMetadata?.updated ?? null,
    gcsObjectMd5: input.gcsMetadata?.md5Hash ?? null,
    storeUpdatedAt: input.storeUpdatedAt,
    preconditionContradictions: input.preconditionContradictions,
    totalCandidates: rows.length,
    exactMatch: rows.filter((r) => r.exactComplianceMatch).length,
    statusOnlyDiff: rows.filter((r) => r.statusOnlyDiff).length,
    noteOnlyDiff: rows.filter((r) => r.noteOnlyDiff).length,
    statusAndNoteDiff: rows.filter(
      (r) => r.storedStatus !== r.freshStatus && normNote(r.storedNote) !== normNote(r.freshNote)
    ).length,
    toMorePermissive: rows.filter((r) => r.toMorePermissive).length,
    toMoreRestrictive: rows.filter((r) => r.toMoreRestrictive).length,
    toNeedsReview: rows.filter((r) => r.toNeedsReview).length,
    emailSourceUrlMissing: rows.filter((r) => r.emailSourceUrlMissing).length,
    officialSiteUrlMissing: rows.filter((r) => r.officialSiteUrlMissing).length,
    externalDomainEmail: rows.filter((r) => r.externalDomainEmail).length,
    personalOrPlaceholder: rows.filter((r) => r.personalOrPlaceholder).length,
    duplicateFlag: rows.filter((r) => r.duplicateFlag).length,
    importedExcludedSkip: rows.filter((r) => r.skipReason === 'imported_or_excluded').length,
    leadHistorySkip: rows.filter((r) => r.skipReason === 'lead_approved_or_imported').length,
    humanReviewSkip: rows.filter(
      (r) => r.skipReason === 'ambiguous_human_review' || r.skipReason === 'policy_unknown_legacy'
    ).length,
    brokenSkip: rows.filter(
      (r) =>
        r.skipReason === 'broken_structure' ||
        r.skipReason === 'missing_candidate_id' ||
        r.skipReason === 'invalid_official_site_url' ||
        r.skipReason === 'invalid_email_source_url' ||
        r.skipReason === 'evaluation_error'
    ).length,
    updateEligible: rows.filter((r) => r.updateEligible).length,
    updateNotNeeded: rows.filter((r) => !r.updateEligible).length,
    gcsWritesPerformed: 0,
    backupObjectsCreated: 0,
  };

  const changeSamples = rows
    .filter((r) => r.updateEligible)
    .slice(0, 10);

  const updateEligibleCandidates = rows.filter((r) => r.updateEligible);
  const restrictiveCandidates = rows.filter((r) => r.toMoreRestrictive);
  const permissiveNotEligible = rows.filter(
    (r) => r.toMorePermissive && !r.updateEligible
  );

  const humanReviewRequired = rows.filter(
    (r) =>
      r.skipReason === 'ambiguous_human_review' ||
      r.skipReason === 'policy_unknown_legacy' ||
      (r.toMorePermissive && r.duplicateFlag)
  );

  const objectPath = 'prod/growly-sales/external-candidates.json';

  return {
    summary,
    samples: changeSamples,
    updateEligibleCandidates,
    restrictiveCandidates,
    permissiveNotEligible,
    humanReviewRequired: humanReviewRequired.slice(0, 20),
    backupPlan: {
      objectPath: `gs://growly-sales-daily30/${objectPath}`,
      backupNamePattern: `${objectPath}.YYYY-MM-DDTHHmmss.bak`,
      rollbackSteps: [
        '1. gsutil ls gs://growly-sales-daily30/prod/growly-sales/external-candidates.json.*.bak で直前バックアップを確認',
        '2. gsutil cp gs://growly-sales-daily30/prod/growly-sales/external-candidates.json.<stamp>.bak gs://growly-sales-daily30/prod/growly-sales/external-candidates.json',
        '3. npm run growly-sales:audit-lead-approval-judgment で矛盾0を確認',
        '4. npm run growly-sales:phase415h-compliance-dry-run で件数・generation を再確認',
      ],
    },
    applySafetyDesign: [
      '--apply フラグ必須（デフォルトは dry-run）',
      '実行直前に人間承認フレーズ入力（例: APPLY_COMPLIANCE_REFRESH）',
      'dry-run summary の updateEligible 件数と apply 時件数が一致しない場合は中止',
      'apply 直前に GCS を再読込し generation / md5 が dry-run 記録と一致すること',
      'gcsBackupBeforeWrite 成功後のみ writeJsonDocument',
      '一時ファイルへ JSON 生成 → parse → 件数・candidateId 集合・compliance 以外差分0を検証',
      '書き込み後に再読込・phase415h dry-run 再実行',
      '失敗時は自動継続せずロールバック手順を表示',
    ],
    proposedApplyCommand:
      'npm run growly-sales:phase415h-compliance-apply -- --apply --confirm=APPLY_COMPLIANCE_REFRESH',
  };
}
