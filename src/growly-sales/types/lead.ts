export type LeadScore = 'A' | 'B' | 'C' | 'UNKNOWN';

export type ReviewStatus = 'pending' | 'approve' | 'revise' | 'reject';

export type HumanReviewStatus = 'pending' | 'approved' | 'rejected' | 'needs_revision';

/**
 * sendStatus は送信実行ではなく「状態の記録」。
 * Growly Sales は自動送信を実装しない（安全ルール）。
 */
export type SendStatus = 'not_sent' | 'manual_sent' | 'draft' | 'sent' | 'blocked';

export type CollectionStatus = 'pending' | 'collected' | 'failed' | 'needs_review';

export type Daily30PipelineStatus =
  | 'collected'
  | 'email_found'
  | 'email_not_found'
  | 'duplicate'
  | 'excluded'
  | 'ready_for_copy'
  | 'needs_review'
  | 'ready_for_draft';

export const DAILY30_PIPELINE_STATUSES: readonly Daily30PipelineStatus[] = [
  'collected',
  'email_found',
  'email_not_found',
  'duplicate',
  'excluded',
  'ready_for_copy',
  'needs_review',
  'ready_for_draft',
];

export const COLLECTION_STATUSES: readonly CollectionStatus[] = [
  'pending',
  'collected',
  'failed',
  'needs_review',
];

export const SEND_STATUSES: readonly SendStatus[] = [
  'not_sent',
  'manual_sent',
  'draft',
  'sent',
  'blocked',
];

export type ReplyStatus =
  | 'none'
  | 'no_reply'
  | 'replied'
  | 'interested'
  | 'not_interested'
  | 'declined'
  | 'requested_report'
  | 'meeting_scheduled'
  | 'follow_up_needed'
  | 'bounced';

export const REPLY_STATUSES: readonly ReplyStatus[] = [
  'none',
  'no_reply',
  'replied',
  'interested',
  'not_interested',
  'declined',
  'requested_report',
  'meeting_scheduled',
  'follow_up_needed',
  'bounced',
];

export type DealStatus = 'none' | 'open' | 'won' | 'lost' | 'paused';

export const DEAL_STATUSES: readonly DealStatus[] = ['none', 'open', 'won', 'lost', 'paused'];

export type ManualSendMethod = 'contact_form' | 'email' | 'instagram_dm' | 'other';

export const MANUAL_SEND_METHODS: readonly ManualSendMethod[] = [
  'contact_form',
  'email',
  'instagram_dm',
  'other',
];

export type RiskLevel = 'low' | 'medium' | 'high';

export const LEAD_SCORES: readonly LeadScore[] = ['A', 'B', 'C', 'UNKNOWN'];

export const REVIEW_STATUSES: readonly ReviewStatus[] = [
  'pending',
  'approve',
  'revise',
  'reject',
];

export const HUMAN_REVIEW_STATUSES: readonly HumanReviewStatus[] = [
  'pending',
  'approved',
  'rejected',
  'needs_revision',
];

export type GmailDraftStatus = 'none' | 'previewed' | 'draft_created' | 'failed' | 'skipped';

export type ContactPathConfidence = 'low' | 'medium' | 'high';
export type EmailContactType = 'corporate' | 'generic' | 'personal_rejected' | 'unknown';
export type ContactPathType = 'email' | 'contact_form' | 'both' | 'none';

export const CONTACT_PATH_CONFIDENCES: readonly ContactPathConfidence[] = ['low', 'medium', 'high'];
export const EMAIL_CONTACT_TYPES: readonly EmailContactType[] = [
  'corporate',
  'generic',
  'personal_rejected',
  'unknown',
];
export const CONTACT_PATH_TYPES: readonly ContactPathType[] = ['email', 'contact_form', 'both', 'none'];

export const GMAIL_DRAFT_STATUSES: readonly GmailDraftStatus[] = [
  'none',
  'previewed',
  'draft_created',
  'failed',
  'skipped',
];

export interface Lead {
  id: string;
  companyName: string;
  area: string;
  industry: string;
  websiteUrl: string;
  instagramUrl: string | null;
  emailCandidates: string[];
  emailCandidateSourceUrls: string[];
  emailCandidateConfidence: ContactPathConfidence;
  emailContactType: EmailContactType;
  contactPathType: ContactPathType;
  contactPathConfidence: ContactPathConfidence;
  contactFormUrl: string | null;
  recruitUrl: string | null;
  caseStudyUrl: string | null;
  companyProfileUrl: string | null;
  sourceUrls: string[];
  leadScore: LeadScore;
  salesAngle: string;
  companyAnalysis: string;
  customHook: string;
  hookSourceType: string;
  hookSourceUrl: string | null;
  customHookReason: string;
  emailSubject: string;
  emailBody: string;
  reviewStatus: ReviewStatus;
  reviewComment: string;
  nextAction: string;
  collectionStatus: CollectionStatus;
  humanReviewStatus: HumanReviewStatus;
  sendStatus: SendStatus;
  replyStatus: ReplyStatus;
  manualSentAt: string | null;
  manualSendMethod: ManualSendMethod | null;
  replyReceivedAt: string | null;
  /** 返信管理: 返信受信日時（replyReceivedAt と同期） */
  repliedAt: string | null;
  replyMemo: string;
  /** 返信管理: 返信内容の要約 */
  replySummary: string;
  followUpDate: string | null;
  /** 返信管理: フォロー予定日（followUpDate と同期） */
  followUpDueAt: string | null;
  followUpMemo: string;
  dealStatus: DealStatus;
  outcomeMemo: string;
  communicationMemo: string;
  gmailDraftStatus: GmailDraftStatus;
  gmailDraftId: string | null;
  gmailDraftCreatedAt: string | null;
  gmailDraftError: string | null;
  gmailDraftPreviewedAt: string | null;
  doNotContact: boolean;
  riskLevel: RiskLevel;
  /** Phase 23: 都道府県 */
  prefecture?: string | null;
  /** Phase 23: 宮城 / 福島 / 北関東 */
  regionGroup?: string | null;
  /** Phase 23: 収集優先度（1=宮城 … 5=群馬） */
  collectionPriority?: number | null;
  collectionAreaSource?: string | null;
  collectionBatchId?: string | null;
  /** Phase 23: 収集元（daily30 / manual 等） */
  source?: string | null;
  /** Phase 23: Daily 30 パイプライン状態 */
  daily30PipelineStatus?: Daily30PipelineStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadInputRow {
  companyName: string;
  area: string;
  industry: string;
  websiteUrl: string;
}

export function createLeadId(): string {
  return crypto.randomUUID();
}

export function createEmptyLead(partial: Partial<Lead> & Pick<Lead, 'companyName' | 'area' | 'industry' | 'websiteUrl'>): Lead {
  const now = new Date().toISOString();
  return {
    id: createLeadId(),
    instagramUrl: null,
    emailCandidates: [],
    emailCandidateSourceUrls: [],
    emailCandidateConfidence: 'low',
    emailContactType: 'unknown',
    contactPathType: 'none',
    contactPathConfidence: 'low',
    contactFormUrl: null,
    recruitUrl: null,
    caseStudyUrl: null,
    companyProfileUrl: null,
    sourceUrls: [],
    leadScore: 'UNKNOWN',
    salesAngle: '',
    companyAnalysis: '',
    customHook: '',
    hookSourceType: '',
    hookSourceUrl: null,
    customHookReason: '',
    emailSubject: '',
    emailBody: '',
    reviewStatus: 'pending',
    reviewComment: '',
    nextAction: '人間レビュー待ち',
    collectionStatus: 'pending',
    humanReviewStatus: 'pending',
    sendStatus: 'not_sent',
    replyStatus: 'none',
    manualSentAt: null,
    manualSendMethod: null,
    replyReceivedAt: null,
    repliedAt: null,
    replyMemo: '',
    replySummary: '',
    followUpDate: null,
    followUpDueAt: null,
    followUpMemo: '',
    dealStatus: 'none',
    outcomeMemo: '',
    communicationMemo: '',
    gmailDraftStatus: 'none',
    gmailDraftId: null,
    gmailDraftCreatedAt: null,
    gmailDraftError: null,
    gmailDraftPreviewedAt: null,
    doNotContact: false,
    riskLevel: 'medium',
    prefecture: null,
    regionGroup: null,
    collectionPriority: null,
    collectionAreaSource: null,
    collectionBatchId: null,
    source: null,
    daily30PipelineStatus: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function isSendEligible(lead: Lead): boolean {
  return (
    lead.humanReviewStatus === 'approved' &&
    lead.reviewStatus === 'approve' &&
    !lead.doNotContact &&
    lead.sendStatus === 'not_sent'
  );
}

/** Gmail下書き作成候補（送信ではない） */
export function isDraftCandidate(lead: Lead): boolean {
  return (
    lead.humanReviewStatus === 'approved' &&
    !lead.doNotContact &&
    lead.sendStatus !== 'blocked' &&
    lead.sendStatus !== 'sent'
  );
}

export function isBlockedLead(lead: Lead): boolean {
  return lead.doNotContact || lead.sendStatus === 'blocked';
}

export function validateLeadEnums(lead: Lead): string[] {
  const errors: string[] = [];
  if (!LEAD_SCORES.includes(lead.leadScore)) {
    errors.push(`Invalid leadScore: ${lead.leadScore}`);
  }
  if (!REVIEW_STATUSES.includes(lead.reviewStatus)) {
    errors.push(`Invalid reviewStatus: ${lead.reviewStatus}`);
  }
  if (!HUMAN_REVIEW_STATUSES.includes(lead.humanReviewStatus)) {
    errors.push(`Invalid humanReviewStatus: ${lead.humanReviewStatus}`);
  }
  if (!SEND_STATUSES.includes(lead.sendStatus)) {
    errors.push(`Invalid sendStatus: ${lead.sendStatus}`);
  }
  if (!REPLY_STATUSES.includes(lead.replyStatus)) {
    errors.push(`Invalid replyStatus: ${lead.replyStatus}`);
  }
  if (!DEAL_STATUSES.includes(lead.dealStatus)) {
    errors.push(`Invalid dealStatus: ${lead.dealStatus}`);
  }
  if (lead.manualSendMethod !== null && !MANUAL_SEND_METHODS.includes(lead.manualSendMethod)) {
    errors.push(`Invalid manualSendMethod: ${lead.manualSendMethod}`);
  }
  if (!COLLECTION_STATUSES.includes(lead.collectionStatus)) {
    errors.push(`Invalid collectionStatus: ${lead.collectionStatus}`);
  }
  if (!GMAIL_DRAFT_STATUSES.includes(lead.gmailDraftStatus)) {
    errors.push(`Invalid gmailDraftStatus: ${lead.gmailDraftStatus}`);
  }
  if (lead.gmailDraftStatus === 'draft_created' && !lead.gmailDraftId?.trim()) {
    errors.push('gmailDraftStatus=draft_created requires gmailDraftId');
  }
  if (!CONTACT_PATH_CONFIDENCES.includes(lead.emailCandidateConfidence)) {
    errors.push(`Invalid emailCandidateConfidence: ${lead.emailCandidateConfidence}`);
  }
  if (!EMAIL_CONTACT_TYPES.includes(lead.emailContactType)) {
    errors.push(`Invalid emailContactType: ${lead.emailContactType}`);
  }
  if (!CONTACT_PATH_TYPES.includes(lead.contactPathType)) {
    errors.push(`Invalid contactPathType: ${lead.contactPathType}`);
  }
  if (!CONTACT_PATH_CONFIDENCES.includes(lead.contactPathConfidence)) {
    errors.push(`Invalid contactPathConfidence: ${lead.contactPathConfidence}`);
  }
  return errors;
}

export const LEAD_CSV_HEADERS: (keyof Lead)[] = [
  'id',
  'companyName',
  'area',
  'industry',
  'websiteUrl',
  'instagramUrl',
  'emailCandidates',
  'emailCandidateSourceUrls',
  'emailCandidateConfidence',
  'emailContactType',
  'contactPathType',
  'contactPathConfidence',
  'contactFormUrl',
  'recruitUrl',
  'caseStudyUrl',
  'companyProfileUrl',
  'sourceUrls',
  'leadScore',
  'salesAngle',
  'companyAnalysis',
  'customHook',
  'hookSourceType',
  'hookSourceUrl',
  'customHookReason',
  'emailSubject',
  'emailBody',
  'reviewStatus',
  'reviewComment',
  'nextAction',
  'collectionStatus',
  'humanReviewStatus',
  'sendStatus',
  'replyStatus',
  'manualSentAt',
  'manualSendMethod',
  'replyReceivedAt',
  'repliedAt',
  'replyMemo',
  'replySummary',
  'followUpDate',
  'followUpDueAt',
  'followUpMemo',
  'dealStatus',
  'outcomeMemo',
  'communicationMemo',
  'gmailDraftStatus',
  'gmailDraftId',
  'gmailDraftCreatedAt',
  'gmailDraftError',
  'gmailDraftPreviewedAt',
  'doNotContact',
  'riskLevel',
  'createdAt',
  'updatedAt',
];
