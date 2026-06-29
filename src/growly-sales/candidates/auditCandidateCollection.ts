import type { Lead } from '../types/lead.js';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { externalCandidateDedupeKey, leadMatchesCandidate } from '../adapters/dedupeExternalCandidates.js';
import { leadDedupeKey } from '../workflow/dedupeLeads.js';
import { countTowardCollectionTarget } from './limitCandidateCollection.js';
import {
  CANDIDATE_COLLECTION_TARGET,
  CANDIDATE_TARGET_AREAS,
  CANDIDATE_TARGET_CATEGORIES,
} from './candidateCollectionConfig.js';

export interface LeadCollectionAuditRow {
  companyName: string;
  websiteUrl: string;
  officialSiteUrl: string;
  sourceUrls: string[];
  contactFormUrl: string | null;
  emailCandidates: string[];
  contactPathType: Lead['contactPathType'];
  duplicateKey: string;
  humanReviewStatus: Lead['humanReviewStatus'];
  gmailDraftStatus: Lead['gmailDraftStatus'];
}

export interface CandidateCollectionAudit {
  target: number;
  leadCount: number;
  remainingToTarget: number;
  externalCandidateCount: number;
  externalImportable: number;
  externalDuplicate: number;
  externalNeedsReview: number;
  externalWithoutWebsite: number;
  leadsWithEmail: number;
  leadsWithContactForm: number;
  leadsWithBothPaths: number;
  duplicateKeysAmongLeads: string[];
  targetAreas: readonly string[];
  targetCategories: readonly string[];
  leadRows: LeadCollectionAuditRow[];
  externalRows: Array<{
    companyName: string;
    websiteUrl: string | null;
    officialSiteUrl: string | null;
    sourceUrl: string | null;
    duplicateKey: string;
    importStatus: ExternalLeadCandidate['importStatus'];
    duplicateReason: string;
  }>;
  notes: string[];
}

export function auditCandidateCollection(
  leads: Lead[],
  externalCandidates: ExternalLeadCandidate[] = []
): CandidateCollectionAudit {
  const { target, current, remaining } = countTowardCollectionTarget(leads.length);

  const leadRows: LeadCollectionAuditRow[] = leads.map((lead) => ({
    companyName: lead.companyName,
    websiteUrl: lead.websiteUrl,
    officialSiteUrl: lead.websiteUrl,
    sourceUrls: lead.sourceUrls,
    contactFormUrl: lead.contactFormUrl,
    emailCandidates: lead.emailCandidates,
    contactPathType: lead.contactPathType,
    duplicateKey: leadDedupeKey(lead),
    humanReviewStatus: lead.humanReviewStatus,
    gmailDraftStatus: lead.gmailDraftStatus,
  }));

  const duplicateKeysAmongLeads = findDuplicateLeadKeys(leads);

  const externalRows = externalCandidates.map((c) => ({
    companyName: c.companyName,
    websiteUrl: c.websiteUrl,
    officialSiteUrl: c.officialSiteUrl ?? c.websiteUrl,
    sourceUrl: c.sourceUrl,
    duplicateKey: c.duplicateKey || externalCandidateDedupeKey(c),
    importStatus: c.importStatus,
    duplicateReason: c.duplicateReason,
  }));

  const notes: string[] = [
    '公式サイトURLがない外部候補は needs_review 扱い。Lead取り込み前に人間確認が必要です。',
    'contactFormUrl / emailCandidates は day1 解析後に Lead へ反映されます。',
    '同一ドメイン・同一社名は duplicateKey で重複排除します。',
    '実fetchは FETCH_CANDIDATES 入力後のみ実行してください。',
  ];

  for (const ext of externalCandidates) {
    for (const lead of leads) {
      if (leadMatchesCandidate(lead, ext)) {
        notes.push(`外部候補「${ext.companyName}」は既存Lead「${lead.companyName}」と一致の可能性`);
        break;
      }
    }
  }

  return {
    target,
    leadCount: current,
    remainingToTarget: remaining,
    externalCandidateCount: externalCandidates.length,
    externalImportable: externalCandidates.filter(
      (c) => c.importStatus === 'preview' || c.importStatus === 'approved_for_import'
    ).length,
    externalDuplicate: externalCandidates.filter((c) => c.importStatus === 'duplicate').length,
    externalNeedsReview: externalCandidates.filter((c) => c.importStatus === 'needs_review').length,
    externalWithoutWebsite: externalCandidates.filter((c) => !c.websiteUrl && !c.officialSiteUrl).length,
    leadsWithEmail: leads.filter((l) => l.emailCandidates.length > 0).length,
    leadsWithContactForm: leads.filter((l) => Boolean(l.contactFormUrl)).length,
    leadsWithBothPaths: leads.filter((l) => l.contactPathType === 'both').length,
    duplicateKeysAmongLeads,
    targetAreas: CANDIDATE_TARGET_AREAS,
    targetCategories: CANDIDATE_TARGET_CATEGORIES,
    leadRows,
    externalRows,
    notes: [...new Set(notes)],
  };
}

function findDuplicateLeadKeys(leads: Lead[]): string[] {
  const seen = new Map<string, string>();
  const dupes: string[] = [];
  for (const lead of leads) {
    const key = leadDedupeKey(lead);
    if (seen.has(key)) {
      dupes.push(`${seen.get(key)} / ${lead.companyName} (${key})`);
    } else {
      seen.set(key, lead.companyName);
    }
  }
  return dupes;
}

export function formatCollectionProgress(audit: CandidateCollectionAudit): string[] {
  return [
    `目標: ${audit.target}件 / 現在Lead: ${audit.leadCount}件 / 残り: ${audit.remainingToTarget}件`,
    `外部候補プール: ${audit.externalCandidateCount}件（取り込み可: ${audit.externalImportable} / 重複: ${audit.externalDuplicate} / 要確認: ${audit.externalNeedsReview}）`,
    `Lead連絡導線: email ${audit.leadsWithEmail} / form ${audit.leadsWithContactForm} / both ${audit.leadsWithBothPaths}`,
  ];
}
