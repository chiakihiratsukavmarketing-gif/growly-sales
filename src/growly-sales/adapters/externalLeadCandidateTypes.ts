import type { RiskLevel } from '../types/lead.js';
import type {
  Daily30GmailDraftStatus,
  Daily30HumanReviewStatus,
  Daily30PipelineStatus,
  Daily30RegionGroup,
  Daily30SendStatus,
} from '../candidates/daily30CandidateStatus.js';

export type {
  Daily30GmailDraftStatus,
  Daily30HumanReviewStatus,
  Daily30PipelineStatus,
  Daily30RegionGroup,
  Daily30SendStatus,
};

export type ExternalCandidateSourceType = 'google_places' | 'web_search' | 'manual';

export type ExternalCandidateImportStatus =
  | 'preview'
  | 'approved_for_import'
  | 'approved_for_lead'
  | 'imported'
  | 'skipped'
  | 'duplicate'
  | 'needs_review';

export const EXTERNAL_CANDIDATE_SOURCE_TYPES: readonly ExternalCandidateSourceType[] = [
  'google_places',
  'web_search',
  'manual',
];

export const EXTERNAL_CANDIDATE_IMPORT_STATUSES: readonly ExternalCandidateImportStatus[] = [
  'preview',
  'approved_for_import',
  'approved_for_lead',
  'imported',
  'skipped',
  'duplicate',
  'needs_review',
];

export interface ExternalLeadCandidate {
  externalCandidateId: string;
  sourceType: ExternalCandidateSourceType;
  companyName: string;
  area: string;
  industry: string;
  /** 公式サイトURL（取得時点。Lead取り込み後は day1 で連絡導線を補完） */
  websiteUrl: string | null;
  /** websiteUrl と同一ドメインの公式サイト（保存・監査用） */
  officialSiteUrl: string | null;
  phoneNumber: string | null;
  address: string | null;
  googlePlaceId: string | null;
  /** 確認元URL（Places / Web検索結果など） */
  sourceUrl: string | null;
  sourceQuery: string;
  /** 業種ラベル（industry と同値または派生） */
  category: string;
  contactFormUrl: string | null;
  emailCandidates: string[];
  confidenceScore: number;
  importStatus: ExternalCandidateImportStatus;
  riskLevel: RiskLevel;
  duplicateReason: string;
  /** companyName + domain 等の重複判定キー */
  duplicateKey: string;
  /** Phase 23: Daily 30 パイプライン状態 */
  pipelineStatus: Daily30PipelineStatus;
  prefecture: string;
  regionGroup: Daily30RegionGroup | '';
  collectionPriority: number;
  /** 探索に使ったエリア（例: 宮城県） */
  collectionAreaSource: string;
  /** 日次バッチ ID（YYYY-MM-DD） */
  collectionBatchId: string;
  /** メール確認元URL（ページ単位） */
  emailCandidateSourceUrls: string[];
  emailVerifiedAt: string | null;
  /** Phase 24: 生成済み営業メール件名 */
  generatedEmailSubject: string | null;
  /** Phase 24: 生成済み営業メール本文 */
  generatedEmailBody: string | null;
  generatedCustomHook: string | null;
  generatedCustomHookReason: string | null;
  /** Phase 24: 送信先（公開代表・問い合わせメール） */
  targetEmail: string | null;
  /** Phase 24: 主メール確認元URL */
  emailCandidateSourceUrl: string | null;
  failureReason: string | null;
  copyGeneratedAt: string | null;
  qualityCheckedAt: string | null;
  humanReviewStatus: Daily30HumanReviewStatus | null;
  gmailDraftStatus: Daily30GmailDraftStatus | null;
  sendStatus: Daily30SendStatus | null;
  notes: string;
  collectedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalCandidatesStore {
  candidates: ExternalLeadCandidate[];
  updatedAt: string;
  note: string;
}

export function createExternalCandidateId(): string {
  return crypto.randomUUID();
}
