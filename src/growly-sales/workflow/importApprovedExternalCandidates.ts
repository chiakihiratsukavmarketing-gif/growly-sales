import { readFile, appendFile, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { findDuplicateReason } from '../adapters/dedupeExternalCandidates.js';
import { getInputSitesCsvPath } from '../config/paths.js';
import { loadInputSitesCsv } from '../storage/csvLeadRepository.js';
import { loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import { getLeadsJsonPath } from '../config/paths.js';
import {
  loadExternalCandidatesFromJson,
  saveExternalCandidatesToJson,
  saveExternalCandidatesToCsv,
} from '../storage/externalCandidatesRepository.js';

export interface ImportApprovedResult {
  imported: ExternalLeadCandidate[];
  skipped: Array<{ candidate: ExternalLeadCandidate; reason: string }>;
  inputSitesPath: string;
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function inputSitesRow(candidate: ExternalLeadCandidate): string {
  return [
    escapeCsv(candidate.companyName),
    escapeCsv(candidate.area),
    escapeCsv(candidate.industry),
    escapeCsv(candidate.websiteUrl ?? ''),
  ].join(',');
}

export function isCandidateImportable(
  candidate: ExternalLeadCandidate,
  existingLeads: Awaited<ReturnType<typeof loadLeadsFromJson>>,
  allCandidates: ExternalLeadCandidate[]
): string | null {
  if (candidate.importStatus === 'imported') return '既に取り込み済み';
  if (candidate.importStatus === 'skipped') return 'スキップ済み';
  if (candidate.importStatus === 'duplicate') return candidate.duplicateReason || '重複';
  if (candidate.importStatus === 'needs_review') return 'websiteUrl なし（要レビュー）';
  if (!candidate.websiteUrl?.trim()) return 'websiteUrl がありません';

  if (
    candidate.importStatus !== 'approved_for_import' &&
    candidate.importStatus !== 'preview'
  ) {
    return `取り込み対象外ステータス: ${candidate.importStatus}`;
  }

  const dup = findDuplicateReason(candidate, existingLeads, allCandidates);
  if (dup) {
    if (dup.includes('doNotContact')) return dup;
    return dup;
  }

  return null;
}

export async function importApprovedExternalCandidates(
  options?: { onlyApproved?: boolean }
): Promise<ImportApprovedResult> {
  const onlyApproved = options?.onlyApproved ?? true;
  const candidates = await loadExternalCandidatesFromJson();
  const existingLeads = await loadLeadsFromJson(getLeadsJsonPath());
  const inputPath = getInputSitesCsvPath();

  const imported: ExternalLeadCandidate[] = [];
  const skipped: ImportApprovedResult['skipped'] = [];
  const rowsToAppend: string[] = [];

  let headerNeeded = false;
  try {
    await access(inputPath);
    const { rows } = await loadInputSitesCsv(inputPath);
    if (rows.length === 0) {
      const content = await readFile(inputPath, 'utf-8').catch(() => '');
      headerNeeded = !content.trim();
    }
  } catch {
    headerNeeded = true;
  }

  for (const candidate of candidates) {
    if (onlyApproved && candidate.importStatus !== 'approved_for_import') {
      if (candidate.importStatus === 'preview') {
        skipped.push({ candidate, reason: '人間承認待ち（approved_for_import が必要）' });
      }
      continue;
    }

    const blockReason = isCandidateImportable(candidate, existingLeads, candidates);
    if (blockReason) {
      skipped.push({ candidate, reason: blockReason });
      continue;
    }

    const { rows: existingRows } = await loadInputSitesCsv(inputPath);
    const website = candidate.websiteUrl!.trim().toLowerCase();
    const alreadyInInput = existingRows.some(
      (r) => r.websiteUrl.trim().toLowerCase() === website
    );
    if (alreadyInInput) {
      skipped.push({ candidate, reason: 'input-sites.csv に既に存在' });
      continue;
    }

    rowsToAppend.push(inputSitesRow(candidate));
    imported.push({
      ...candidate,
      importStatus: 'imported',
      updatedAt: new Date().toISOString(),
    });
  }

  if (rowsToAppend.length > 0) {
    await mkdir(dirname(inputPath), { recursive: true });
    if (headerNeeded) {
      await appendFile(inputPath, 'companyName,area,industry,websiteUrl\n', 'utf-8');
    }
    await appendFile(inputPath, rowsToAppend.join('\n') + '\n', 'utf-8');
  }

  if (imported.length > 0) {
    const importedIds = new Set(imported.map((c) => c.externalCandidateId));
    const updated = candidates.map((c) =>
      importedIds.has(c.externalCandidateId)
        ? imported.find((i) => i.externalCandidateId === c.externalCandidateId)!
        : c
    );
    await saveExternalCandidatesToJson(updated);
    await saveExternalCandidatesToCsv(updated);
  }

  return { imported, skipped, inputSitesPath: inputPath };
}

export async function approveExternalCandidateForImport(
  externalCandidateId: string
): Promise<ExternalLeadCandidate> {
  const candidates = await loadExternalCandidatesFromJson();
  const index = candidates.findIndex((c) => c.externalCandidateId === externalCandidateId);
  if (index < 0) throw new Error(`外部候補が見つかりません: ${externalCandidateId}`);

  const candidate = candidates[index];
  if (!candidate.websiteUrl?.trim()) {
    throw new Error('websiteUrl がない候補は取り込み承認できません');
  }
  if (candidate.importStatus === 'duplicate') {
    throw new Error('重複候補は取り込み承認できません');
  }

  const existingLeads = await loadLeadsFromJson(getLeadsJsonPath());
  const dup = findDuplicateReason(candidate, existingLeads, candidates);
  if (dup?.includes('doNotContact')) {
    throw new Error(dup);
  }

  const updated: ExternalLeadCandidate = {
    ...candidate,
    importStatus: 'approved_for_import',
    updatedAt: new Date().toISOString(),
  };
  candidates[index] = updated;
  await saveExternalCandidatesToJson(candidates);
  await saveExternalCandidatesToCsv(candidates);
  return updated;
}
