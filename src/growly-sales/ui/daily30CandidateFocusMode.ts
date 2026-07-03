import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { evaluateSourceCompliance } from '../candidates/sourceCompliance.js';
import { representativeEmailJudgmentLabel } from '../candidates/resolveDaily30LeadApprovalJudgment.js';
import { resolveEmailSourceFromCandidate } from '../candidates/resolveEmailSourceDisplay.js';

export type CandidateDisplayMode = 'focus' | 'list';

export const DISPLAY_MODE_STORAGE_KEY_RESULTS = 'growly-sales-display-mode-results';
export const DISPLAY_MODE_STORAGE_KEY_LEAD = 'growly-sales-display-mode-lead';

export function loadStoredDisplayMode(
  storageKey: string,
  defaultMode: CandidateDisplayMode = 'focus'
): CandidateDisplayMode {
  try {
    const v = localStorage.getItem(storageKey);
    if (v === 'focus' || v === 'list') return v;
  } catch {
    /* ignore */
  }
  return defaultMode;
}

export function saveStoredDisplayMode(storageKey: string, mode: CandidateDisplayMode): void {
  try {
    localStorage.setItem(storageKey, mode);
  } catch {
    /* ignore */
  }
}

export type ApprovalBlockHints = Record<
  string,
  { blockReason: string; duplicateLeadName?: string }
>;

export function isRepresentativeEmailOfficialSiteVerified(
  candidate: ExternalLeadCandidate
): boolean {
  return evaluateSourceCompliance(candidate).status === 'official_site_verified';
}

export function representativeEmailJudgmentLabelForUi(
  candidate: ExternalLeadCandidate
): string {
  return representativeEmailJudgmentLabel(candidate);
}

function isApprovableCandidate(
  c: ExternalLeadCandidate,
  approvalBlockHints: ApprovalBlockHints
): boolean {
  if (c.importStatus === 'approved_for_lead') return false;
  if (approvalBlockHints[c.externalCandidateId]?.blockReason) return false;
  const emailSource = resolveEmailSourceFromCandidate(c);
  if (emailSource.isPlaceholderEmail || emailSource.isPersonalEmail) return false;
  return isRepresentativeEmailOfficialSiteVerified(c);
}

/** 一覧モード: 承認可能を先頭（Phase 41.5D） */
export function sortCandidatesForListMode(
  list: ExternalLeadCandidate[],
  approvalBlockHints: ApprovalBlockHints
): ExternalLeadCandidate[] {
  const score = (c: ExternalLeadCandidate) => (isApprovableCandidate(c, approvalBlockHints) ? 0 : 1);
  return [...list].sort((a, b) => score(a) - score(b));
}

/**
 * フォーカスモード順序:
 * 1. Lead化承認可能
 * 2. 要確認（placeholder / 個人メール等）
 * 3. メール確認済みだが承認不可
 * 4. メール未確認
 * 5. その他ブロック
 */
export function focusSortScore(
  c: ExternalLeadCandidate,
  approvalBlockHints: ApprovalBlockHints
): number {
  const hint = approvalBlockHints[c.externalCandidateId];
  const email = c.emailCandidates?.[0] ?? c.targetEmail ?? '';
  const hasEmail = Boolean(email);
  const blocked = Boolean(hint?.blockReason);
  const alreadyApproved = c.importStatus === 'approved_for_lead';
  const emailSource = resolveEmailSourceFromCandidate(c);
  const badEmail = emailSource.isPlaceholderEmail || emailSource.isPersonalEmail;
  const approvable = isApprovableCandidate(c, approvalBlockHints);

  if (approvable) return 0;
  if (hasEmail && badEmail && !blocked && !alreadyApproved) return 1;
  if (hasEmail && (blocked || alreadyApproved)) return 2;
  if (!hasEmail) return 3;
  return 4;
}

export function sortCandidatesForFocusMode(
  list: ExternalLeadCandidate[],
  approvalBlockHints: ApprovalBlockHints
): ExternalLeadCandidate[] {
  return [...list].sort(
    (a, b) => focusSortScore(a, approvalBlockHints) - focusSortScore(b, approvalBlockHints)
  );
}

export function applyDeferredOrder(
  sorted: ExternalLeadCandidate[],
  deferredIds: readonly string[]
): ExternalLeadCandidate[] {
  if (deferredIds.length === 0) return sorted;
  const deferredSet = new Set(deferredIds);
  const active: ExternalLeadCandidate[] = [];
  const deferred: ExternalLeadCandidate[] = [];
  for (const c of sorted) {
    if (deferredSet.has(c.externalCandidateId)) deferred.push(c);
    else active.push(c);
  }
  return [...active, ...deferred];
}

export function allCandidatesDeferred(
  sorted: ExternalLeadCandidate[],
  deferredIds: readonly string[]
): boolean {
  if (sorted.length === 0) return false;
  const deferredSet = new Set(deferredIds);
  return sorted.every((c) => deferredSet.has(c.externalCandidateId));
}

export type FocusLeadability =
  | 'approvable'
  | 'needs_review'
  | 'not_approvable'
  | 'no_email'
  | 'blocked';

export function resolveFocusLeadability(
  c: ExternalLeadCandidate,
  approvalBlockHints: ApprovalBlockHints
): {
  kind: FocusLeadability;
  label: string;
  blockReasonJa: string | null;
  representativeEmailLabel: string;
} {
  const hint = approvalBlockHints[c.externalCandidateId];
  const email = c.emailCandidates?.[0] ?? c.targetEmail ?? '';
  const hasEmail = Boolean(email);
  const blocked = Boolean(hint?.blockReason);
  const emailSource = resolveEmailSourceFromCandidate(c);
  const badEmail = emailSource.isPlaceholderEmail || emailSource.isPersonalEmail;
  const alreadyApproved = c.importStatus === 'approved_for_lead';
  const representativeEmailLabel = representativeEmailJudgmentLabelForUi(c);

  let blockReasonJa: string | null = null;
  if (hint?.duplicateLeadName) {
    blockReasonJa = `既存Leadと重複（${hint.duplicateLeadName}）`;
  } else if (hint?.blockReason) {
    blockReasonJa = hint.blockReason;
  }

  if (alreadyApproved) {
    return { kind: 'not_approvable', label: 'Lead化承認済み', blockReasonJa, representativeEmailLabel };
  }
  if (!hasEmail) {
    return { kind: 'no_email', label: 'メール未確認', blockReasonJa, representativeEmailLabel };
  }
  if (blocked) {
    return { kind: 'blocked', label: '承認不可', blockReasonJa, representativeEmailLabel };
  }
  if (badEmail) {
    return {
      kind: 'needs_review',
      label: '要確認（メール要確認）',
      blockReasonJa,
      representativeEmailLabel,
    };
  }
  if (isRepresentativeEmailOfficialSiteVerified(c)) {
    return { kind: 'approvable', label: 'Lead化可能', blockReasonJa: null, representativeEmailLabel };
  }
  if (hasEmail) {
    return {
      kind: 'needs_review',
      label: '要確認（取得元を確認してください）',
      blockReasonJa: null,
      representativeEmailLabel,
    };
  }
  return { kind: 'not_approvable', label: '承認不可', blockReasonJa, representativeEmailLabel };
}
