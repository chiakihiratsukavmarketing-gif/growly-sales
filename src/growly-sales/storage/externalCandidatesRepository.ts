import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ExternalLeadCandidate, ExternalCandidatesStore } from '../adapters/externalLeadCandidateTypes.js';
import { enrichExternalLeadCandidates } from '../candidates/enrichCandidateFields.js';
import { isGcsStorageBackend } from '../config/storageBackend.js';
import { getExternalCandidatesCsvPath, getExternalCandidatesJsonPath } from '../config/paths.js';
import { EXTERNAL_CANDIDATES_JSON } from './jsonDocumentNames.js';
import { readJsonDocument, writeJsonDocument } from './jsonDocumentStorage.js';

const EMPTY_STORE: ExternalCandidatesStore = {
  candidates: [],
  updatedAt: new Date().toISOString(),
  note: '外部営業候補（直接Lead化しない。人間確認後にのみ取り込み）',
};

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function loadExternalCandidatesFromJson(
  _filePath = getExternalCandidatesJsonPath()
): Promise<ExternalLeadCandidate[]> {
  try {
    const raw = await readJsonDocument(EXTERNAL_CANDIDATES_JSON);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ExternalCandidatesStore | ExternalLeadCandidate[];
    if (Array.isArray(parsed)) return enrichExternalLeadCandidates(parsed);
    if (parsed?.candidates) return enrichExternalLeadCandidates(parsed.candidates);
    return [];
  } catch (err) {
    if (!isGcsStorageBackend() && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

export async function saveExternalCandidatesToJson(
  candidates: ExternalLeadCandidate[],
  filePath = getExternalCandidatesJsonPath(),
  note = EMPTY_STORE.note
): Promise<void> {
  void filePath;
  const store: ExternalCandidatesStore = {
    candidates,
    updatedAt: new Date().toISOString(),
    note,
  };
  await writeJsonDocument(EXTERNAL_CANDIDATES_JSON, JSON.stringify(store, null, 2));
}

export async function saveExternalCandidatesToCsv(
  candidates: ExternalLeadCandidate[],
  filePath = getExternalCandidatesCsvPath()
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const headers = [
    'externalCandidateId',
    'sourceType',
    'companyName',
    'area',
    'industry',
    'category',
    'websiteUrl',
    'officialSiteUrl',
    'contactFormUrl',
    'emailCandidates',
    'phoneNumber',
    'address',
    'googlePlaceId',
    'sourceUrl',
    'sourceQuery',
    'duplicateKey',
    'confidenceScore',
    'importStatus',
    'riskLevel',
    'duplicateReason',
    'pipelineStatus',
    'prefecture',
    'regionGroup',
    'collectionPriority',
    'collectionAreaSource',
    'collectionBatchId',
    'emailCandidateSourceUrls',
    'emailVerifiedAt',
    'generatedEmailSubject',
    'generatedEmailBody',
    'generatedCustomHook',
    'generatedCustomHookReason',
    'targetEmail',
    'emailCandidateSourceUrl',
    'failureReason',
    'copyGeneratedAt',
    'qualityCheckedAt',
    'humanReviewStatus',
    'gmailDraftStatus',
    'sendStatus',
    'notes',
    'collectedAt',
    'createdAt',
    'updatedAt',
  ];
  const lines = [headers.join(',')];
  for (const c of candidates) {
    lines.push(
      [
        c.externalCandidateId,
        c.sourceType,
        c.companyName,
        c.area,
        c.industry,
        c.category,
        c.websiteUrl ?? '',
        c.officialSiteUrl ?? '',
        c.contactFormUrl ?? '',
        (c.emailCandidates ?? []).join(';'),
        c.phoneNumber ?? '',
        c.address ?? '',
        c.googlePlaceId ?? '',
        c.sourceUrl ?? '',
        c.sourceQuery,
        c.duplicateKey,
        String(c.confidenceScore),
        c.importStatus,
        c.riskLevel,
        c.duplicateReason,
        c.pipelineStatus ?? 'collected',
        c.prefecture ?? '',
        c.regionGroup ?? '',
        String(c.collectionPriority ?? 0),
        c.collectionAreaSource ?? '',
        c.collectionBatchId ?? '',
        (c.emailCandidateSourceUrls ?? []).join(';'),
        c.emailVerifiedAt ?? '',
        c.generatedEmailSubject ?? '',
        c.generatedEmailBody ?? '',
        c.generatedCustomHook ?? '',
        c.generatedCustomHookReason ?? '',
        c.targetEmail ?? '',
        c.emailCandidateSourceUrl ?? '',
        c.failureReason ?? '',
        c.copyGeneratedAt ?? '',
        c.qualityCheckedAt ?? '',
        c.humanReviewStatus ?? '',
        c.gmailDraftStatus ?? '',
        c.sendStatus ?? '',
        c.notes,
        c.collectedAt,
        c.createdAt,
        c.updatedAt,
      ]
        .map((v) => escapeCsv(String(v)))
        .join(',')
    );
  }
  await writeFile(filePath, lines.join('\n'), 'utf-8');
}

export async function persistExternalCandidates(candidates: ExternalLeadCandidate[]): Promise<void> {
  await saveExternalCandidatesToJson(candidates);
  if (!isGcsStorageBackend()) {
    await saveExternalCandidatesToCsv(candidates);
  }
}
