import type { Lead } from '../types/lead.js';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import {
  DAILY_30_AREA_EXPANSION,
  todayBatchIdJst,
} from './daily30AreaConfig.js';
import { DAILY_30_TARGET, DAILY_30_TARGET_EMAIL_FOUND } from './daily30CandidateStatus.js';
import { isExternalFetchConfigured } from '../config/env.js';
import {
  isDaily30LeadApprovalPending,
} from './selectDaily30LeadCandidates.js';
import { isDaily30ReadyForDraftImportCandidate } from './getDaily30DraftImportBlockReason.js';
import {
  countDaily30BatchMetrics,
  isDaily30BatchAccepted,
  type Daily30StoppedReason,
} from './daily30BatchMetrics.js';
import type { Daily30CloudRunStateEntry } from '../storage/daily30CloudRunState.js';
import {
  countDaily30HumanExcluded,
  isDaily30CandidateVisibleInLists,
} from './daily30CandidateVisibility.js';

export interface Daily30Dashboard {
  batchId: string;
  target: number;
  targetEmailFound: number;
  /** 収集実行時点の email_found 件数（GCS state 優先・Lead化後も減らない） */
  emailFoundAtCollection: number;
  formOnlyAtCollection: number;
  noEmailAtCollection: number;
  totalCollectedAtCollection: number;
  collectionMetricsLoaded: boolean;
  collectionRunStatus: string | null;
  stoppedReason: Daily30StoppedReason | null;
  collectedToday: number;
  totalCollected: number;
  formOnlyCount: number;
  noEmailCount: number;
  miyagiCount: number;
  fukushimaCount: number;
  yamagataCount: number;
  northKantoCount: number;
  withEmailCount: number;
  withoutEmailCount: number;
  duplicateExcludedCount: number;
  emailFoundCount: number;
  leadApprovalPendingCount: number;
  leadApprovalApprovedCount: number;
  copyGeneratedCount: number;
  qualityCheckPassedCount: number;
  readyForDraftCount: number;
  draftImportPendingCount: number;
  needsReviewCount: number;
  excludedCount: number;
  humanExcludedCount: number;
  shortfall: number;
  emailShortfall: number;
  nextExploreArea: string;
  nextAction: string;
  fetchConfigured: boolean;
  safetyNote: string;
}

function countByRegion(candidates: ExternalLeadCandidate[], batchId: string): {
  miyagi: number;
  fukushima: number;
  yamagata: number;
  northKanto: number;
} {
  const today = candidates.filter(
    (c) => c.collectionBatchId === batchId && c.pipelineStatus === 'email_found'
  );
  return {
    miyagi: today.filter((c) => c.regionGroup === '宮城').length,
    fukushima: today.filter((c) => c.regionGroup === '福島').length,
    yamagata: today.filter((c) => c.regionGroup === '山形').length,
    northKanto: today.filter((c) => c.regionGroup === '北関東').length,
  };
}

function resolveNextExploreArea(
  counts: { miyagi: number; fukushima: number; yamagata: number; northKanto: number },
  emailShortfall: number
): string {
  if (emailShortfall <= 0) return '本日のメール目標達成（追加収集は任意）';
  if (counts.miyagi < DAILY_30_TARGET_EMAIL_FOUND) return '宮城県（優先）';
  if (counts.miyagi + counts.fukushima < DAILY_30_TARGET_EMAIL_FOUND) return '福島県';
  if (counts.miyagi + counts.fukushima + counts.yamagata < DAILY_30_TARGET_EMAIL_FOUND) return '山形県';
  return '北関東（茨城県 → 栃木県 → 群馬県）';
}

function buildNextAction(input: {
  emailShortfall: number;
  emailFound: number;
  leadApprovalPending: number;
  approvedForCopy: number;
  readyForDraft: number;
  importPending: number;
  needsReview: number;
  fetchConfigured: boolean;
}): string {
  if (input.emailShortfall > 0) {
    return input.fetchConfigured
      ? '候補収集タブで FETCH_DAILY_30 を入力してメール取得済み30件まで収集'
      : 'APIキー設定後、FETCH_DAILY_30 で収集を実行';
  }
  if (input.leadApprovalPending > 0) {
    return 'Lead化承認待ち候補を確認し、個別に承認してください';
  }
  if (input.approvedForCopy > 0) {
    return 'GENERATE_DAILY_30_COPY を入力して営業文生成・品質チェックを実行';
  }
  if (input.readyForDraft > 0 || input.importPending > 0) {
    return 'ready_for_draft 候補を「下書き候補として取り込む」→ 下書き候補タブで承認 → CREATE_DRAFTS';
  }
  if (input.needsReview > 0) {
    return 'needs_review 候補の failureReason を確認し、修正後に再生成';
  }
  if (input.emailFound > 0) {
    return 'メールあり候補の Lead 化承認 → 営業文生成へ進めてください';
  }
  return '本日の Daily 30 フローは完了または追加収集は任意';
}

export function buildDaily30Dashboard(
  candidates: ExternalLeadCandidate[],
  _leads: Lead[],
  batchId = todayBatchIdJst(),
  cloudRunEntry: Daily30CloudRunStateEntry | null = null
): Daily30Dashboard {
  const todayAll = candidates.filter((c) => c.collectionBatchId === batchId);
  const accepted = todayAll.filter((c) => isDaily30BatchAccepted(c, batchId));
  const batchMetrics = countDaily30BatchMetrics(candidates, batchId);
  const regionCounts = countByRegion(candidates, batchId);

  const withEmailCount = accepted.filter(
    (c) =>
      c.pipelineStatus === 'email_found' ||
      c.pipelineStatus === 'ready_for_copy' ||
      c.pipelineStatus === 'ready_for_draft' ||
      (c.emailCandidates?.length ?? 0) > 0
  ).length;

  const withoutEmailCount = accepted.filter(
    (c) => c.pipelineStatus === 'email_not_found' || (c.emailCandidates?.length ?? 0) === 0
  ).length;

  const duplicateExcludedCount = todayAll.filter(
    (c) => c.pipelineStatus === 'duplicate' || c.importStatus === 'duplicate'
  ).length;

  const emailFoundCount = accepted.filter((c) => c.pipelineStatus === 'email_found').length;

  const leadApprovalPendingCount = todayAll.filter(isDaily30LeadApprovalPending).length;

  const leadApprovalApprovedCount = todayAll.filter(
    (c) =>
      isDaily30CandidateVisibleInLists(c) &&
      c.importStatus === 'approved_for_lead' &&
      c.pipelineStatus !== 'excluded'
  ).length;

  const copyGeneratedCount = todayAll.filter(
    (c) => isDaily30CandidateVisibleInLists(c) && Boolean(c.copyGeneratedAt)
  ).length;

  const qualityCheckPassedCount = accepted.filter(
    (c) => c.pipelineStatus === 'ready_for_draft'
  ).length;

  const readyForDraftCount = qualityCheckPassedCount;

  const needsReviewCount = accepted.filter((c) => c.pipelineStatus === 'needs_review').length;

  const excludedCount = todayAll.filter(
    (c) => c.pipelineStatus === 'excluded' || c.importStatus === 'duplicate'
  ).length;

  const humanExcludedCount = countDaily30HumanExcluded(todayAll);

  const approvedForCopyCount = accepted.filter(
    (c) => c.importStatus === 'approved_for_lead' && c.pipelineStatus === 'ready_for_copy'
  ).length;

  const importPendingCount = accepted.filter(isDaily30ReadyForDraftImportCandidate).length;

  const collectedToday = batchMetrics.totalCollected;

  const hasCloudRunMetrics =
    cloudRunEntry !== null &&
    cloudRunEntry.batchId === batchId &&
    cloudRunEntry.mode === 'run';
  const staleFormMetrics =
    hasCloudRunMetrics &&
    cloudRunEntry!.formOnly === 0 &&
    cloudRunEntry!.noEmail === 0 &&
    (batchMetrics.formOnly > 0 || batchMetrics.noEmail > 0);

  const emailFoundAtCollection = hasCloudRunMetrics
    ? cloudRunEntry!.emailFound
    : batchMetrics.emailFound;
  const formOnlyAtCollection = hasCloudRunMetrics
    ? staleFormMetrics
      ? batchMetrics.formOnly
      : cloudRunEntry!.formOnly
    : batchMetrics.formOnly;
  const noEmailAtCollection = hasCloudRunMetrics
    ? staleFormMetrics
      ? batchMetrics.noEmail
      : cloudRunEntry!.noEmail
    : batchMetrics.noEmail;
  const totalCollectedAtCollection = hasCloudRunMetrics
    ? cloudRunEntry!.totalCollected
    : batchMetrics.totalCollected;

  const emailShortfall = Math.max(0, DAILY_30_TARGET_EMAIL_FOUND - emailFoundAtCollection);
  const shortfall = emailShortfall;

  return {
    batchId,
    target: DAILY_30_TARGET,
    targetEmailFound: DAILY_30_TARGET_EMAIL_FOUND,
    emailFoundAtCollection,
    formOnlyAtCollection,
    noEmailAtCollection,
    totalCollectedAtCollection,
    collectionMetricsLoaded: hasCloudRunMetrics,
    collectionRunStatus: hasCloudRunMetrics ? cloudRunEntry!.status : null,
    stoppedReason: hasCloudRunMetrics ? cloudRunEntry!.stoppedReason ?? null : null,
    collectedToday,
    totalCollected: batchMetrics.totalCollected,
    formOnlyCount: batchMetrics.formOnly,
    noEmailCount: batchMetrics.noEmail,
    miyagiCount: regionCounts.miyagi,
    fukushimaCount: regionCounts.fukushima,
    yamagataCount: regionCounts.yamagata,
    northKantoCount: regionCounts.northKanto,
    withEmailCount,
    withoutEmailCount,
    duplicateExcludedCount,
    emailFoundCount: batchMetrics.emailFound,
    leadApprovalPendingCount,
    leadApprovalApprovedCount,
    copyGeneratedCount,
    qualityCheckPassedCount,
    readyForDraftCount,
    draftImportPendingCount: importPendingCount,
    needsReviewCount,
    excludedCount,
    humanExcludedCount,
    shortfall,
    emailShortfall,
    nextExploreArea: resolveNextExploreArea(regionCounts, emailShortfall),
    nextAction: buildNextAction({
      emailShortfall,
      emailFound: emailFoundAtCollection,
      leadApprovalPending: leadApprovalPendingCount,
      approvedForCopy: approvedForCopyCount,
      readyForDraft: readyForDraftCount,
      importPending: importPendingCount,
      needsReview: needsReviewCount,
      fetchConfigured: isExternalFetchConfigured(),
    }),
    fetchConfigured: isExternalFetchConfigured(),
    safetyNote:
      '自動送信なし / Gmail下書きは CREATE_DRAFTS ゲートのみ / 取り込みと下書き作成は分離 / 既存Lead送信履歴は上書きしない',
  };
}

export function describeDaily30AreaExpansion(): string {
  return DAILY_30_AREA_EXPANSION.map(
    (a) => `${a.collectionPriority}. ${a.prefecture}（${a.regionGroup}）`
  ).join(' → ');
}
