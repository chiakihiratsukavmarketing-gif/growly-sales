import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Lead } from '../types/lead.js';
import type { OfferProfile } from '../config/offerProfile.js';
import {
  getDraftCandidatesCsvPath,
  getDraftCandidatesJsonPath,
  getDraftCopyTxtPath,
  getDraftsDir,
} from '../config/paths.js';
import {
  selectDraftCandidates,
  type DraftCandidateRecord,
  type DraftSelectionResult,
} from './selectDraftCandidates.js';

export const DEFAULT_DRAFTS_DIR = getDraftsDir();

export const DRAFT_OUTPUT_PATHS = {
  json: getDraftCandidatesJsonPath(),
  csv: getDraftCandidatesCsvPath(),
  copyText: getDraftCopyTxtPath(),
} as const;

export interface DraftExportResult extends DraftSelectionResult {
  exportedAt: string;
  outputFiles: string[];
  totalLeads: number;
}

function escapeCsvField(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function contactUrlForCopy(candidate: DraftCandidateRecord): string {
  if (candidate.contactFormUrl?.trim()) {
    return candidate.contactFormUrl;
  }
  if (candidate.emailCandidates.length > 0) {
    return candidate.emailCandidates.join('; ');
  }
  return '';
}

export function formatDraftCopyText(candidates: DraftCandidateRecord[]): string {
  const blocks = candidates.map((c) => {
    return [
      '==============================',
      `会社名：${c.companyName}`,
      `問い合わせURL：${contactUrlForCopy(c)}`,
      `件名：${c.emailSubject}`,
      '本文：',
      c.emailBody,
      '===',
    ].join('\n');
  });

  const header = [
    'Growly Sales — 手動コピー用下書きエクスポート',
    '※ Gmail下書きではありません。自動送信は行いません。',
    '',
  ].join('\n');

  return header + blocks.join('\n\n') + (blocks.length > 0 ? '\n' : '');
}

const CSV_HEADERS = [
  'companyName',
  'area',
  'industry',
  'contactFormUrl',
  'emailSubject',
  'emailBody',
  'salesAngle',
  'riskLevel',
  'humanReviewStatus',
  'sendStatus',
] as const;

function buildCsvRow(candidate: DraftCandidateRecord, lead?: Lead): string {
  const riskLevel = lead?.riskLevel ?? 'low';
  const humanReviewStatus = lead?.humanReviewStatus ?? 'approved';
  const sendStatus = lead?.sendStatus ?? 'not_sent';

  return [
    candidate.companyName,
    candidate.area,
    candidate.industry,
    candidate.contactFormUrl ?? '',
    candidate.emailSubject,
    candidate.emailBody,
    candidate.salesAngle,
    riskLevel,
    humanReviewStatus,
    sendStatus,
  ]
    .map(escapeCsvField)
    .join(',');
}

export function buildDraftCsv(
  candidates: DraftCandidateRecord[],
  leadsById: Map<string, Lead>
): string {
  const header = CSV_HEADERS.join(',');
  const rows = candidates.map((c) => buildCsvRow(c, leadsById.get(c.leadId)));
  return [header, ...rows].join('\n') + '\n';
}

export async function exportDraftCandidates(
  leads: Lead[],
  offer?: OfferProfile,
  outputDir = DEFAULT_DRAFTS_DIR
): Promise<DraftExportResult> {
  const exportedAt = new Date().toISOString();
  const selection = selectDraftCandidates(leads, offer, exportedAt);

  await mkdir(outputDir, { recursive: true });

  const jsonPath = join(outputDir, 'draftCandidates.json');
  const csvPath = join(outputDir, 'draftCandidates.csv');
  const txtPath = join(outputDir, 'draft-copy.txt');

  const jsonPayload = {
    exportedAt,
    totalLeads: leads.length,
    candidateCount: selection.candidates.length,
    excludedCount: selection.excluded.length,
    note: 'Gmail下書きではなく手動確認用エクスポート。自動送信は行いません。',
    candidates: selection.candidates,
    excluded: selection.excluded,
  };

  await writeFile(jsonPath, JSON.stringify(jsonPayload, null, 2) + '\n', 'utf-8');

  const leadsById = new Map(leads.map((l) => [l.id, l]));
  await writeFile(csvPath, buildDraftCsv(selection.candidates, leadsById), 'utf-8');
  await writeFile(txtPath, formatDraftCopyText(selection.candidates), 'utf-8');

  return {
    ...selection,
    exportedAt,
    totalLeads: leads.length,
    outputFiles: [jsonPath, csvPath, txtPath],
  };
}
