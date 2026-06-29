import type { Lead } from '../types/lead.js';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import {
  DAILY_30_AREA_EXPANSION,
  todayBatchId,
} from './daily30AreaConfig.js';
import { DAILY_30_TARGET } from './daily30CandidateStatus.js';
import { isExternalFetchConfigured } from '../config/env.js';
import {
  isDaily30LeadApprovalPending,
} from './selectDaily30LeadCandidates.js';
import { isDaily30ReadyForDraftImportCandidate } from './getDaily30DraftImportBlockReason.js';

export interface Daily30Dashboard {
  batchId: string;
  target: number;
  collectedToday: number;
  miyagiCount: number;
  fukushimaCount: number;
  northKantoCount: number;
  withEmailCount: number;
  withoutEmailCount: number;
  duplicateExcludedCount: number;
  emailFoundCount: number;
  leadApprovalPendingCount: number;
  copyGeneratedCount: number;
  qualityCheckPassedCount: number;
  readyForDraftCount: number;
  needsReviewCount: number;
  excludedCount: number;
  shortfall: number;
  nextExploreArea: string;
  nextAction: string;
  fetchConfigured: boolean;
  safetyNote: string;
}

function isTodayAccepted(c: ExternalLeadCandidate, batchId: string): boolean {
  return (
    c.collectionBatchId === batchId &&
    c.pipelineStatus !== 'duplicate' &&
    c.pipelineStatus !== 'excluded' &&
    c.importStatus !== 'duplicate'
  );
}

function countByRegion(candidates: ExternalLeadCandidate[], batchId: string): {
  miyagi: number;
  fukushima: number;
  northKanto: number;
} {
  const today = candidates.filter((c) => isTodayAccepted(c, batchId));
  return {
    miyagi: today.filter((c) => c.regionGroup === '宮城').length,
    fukushima: today.filter((c) => c.regionGroup === '福島').length,
    northKanto: today.filter((c) => c.regionGroup === '北関東').length,
  };
}

function resolveNextExploreArea(
  counts: { miyagi: number; fukushima: number; northKanto: number },
  shortfall: number
): string {
  if (shortfall <= 0) return '本日の目標達成（追加収集は任意）';
  if (counts.miyagi < DAILY_30_TARGET) return '宮城県（優先）';
  if (counts.fukushima + counts.miyagi < DAILY_30_TARGET) return '福島県';
  return '北関東（茨城県 → 栃木県 → 群馬県）';
}

function buildNextAction(input: {
  shortfall: number;
  emailFound: number;
  leadApprovalPending: number;
  approvedForCopy: number;
  readyForDraft: number;
  importPending: number;
  needsReview: number;
  fetchConfigured: boolean;
}): string {
  if (input.shortfall > 0) {
    return input.fetchConfigured
      ? '候補収集タブで FETCH_DAILY_30 を入力して収集を実行'
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
  batchId = todayBatchId()
): Daily30Dashboard {
  const todayAll = candidates.filter((c) => c.collectionBatchId === batchId);
  const accepted = todayAll.filter((c) => isTodayAccepted(c, batchId));
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

  const leadApprovalPendingCount = accepted.filter(isDaily30LeadApprovalPending).length;

  const copyGeneratedCount = accepted.filter((c) => Boolean(c.copyGeneratedAt)).length;

  const qualityCheckPassedCount = accepted.filter(
    (c) => c.pipelineStatus === 'ready_for_draft'
  ).length;

  const readyForDraftCount = qualityCheckPassedCount;

  const needsReviewCount = accepted.filter((c) => c.pipelineStatus === 'needs_review').length;

  const excludedCount = accepted.filter(
    (c) => c.pipelineStatus === 'excluded' || c.importStatus === 'duplicate'
  ).length;

  const approvedForCopyCount = accepted.filter(
    (c) => c.importStatus === 'approved_for_lead' && c.pipelineStatus === 'ready_for_copy'
  ).length;

  const importPendingCount = accepted.filter(isDaily30ReadyForDraftImportCandidate).length;

  const collectedToday = accepted.length;
  const shortfall = Math.max(0, DAILY_30_TARGET - collectedToday);

  return {
    batchId,
    target: DAILY_30_TARGET,
    collectedToday,
    miyagiCount: regionCounts.miyagi,
    fukushimaCount: regionCounts.fukushima,
    northKantoCount: regionCounts.northKanto,
    withEmailCount,
    withoutEmailCount,
    duplicateExcludedCount,
    emailFoundCount,
    leadApprovalPendingCount,
    copyGeneratedCount,
    qualityCheckPassedCount,
    readyForDraftCount,
    needsReviewCount,
    excludedCount,
    shortfall,
    nextExploreArea: resolveNextExploreArea(regionCounts, shortfall),
    nextAction: buildNextAction({
      shortfall,
      emailFound: emailFoundCount,
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
