import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import type { Lead } from '../types/lead.js';
import { buildLeadFromDaily30ReadyForDraft } from '../candidates/buildLeadFromDaily30ReadyForDraft.js';
import {
  getDaily30DraftImportBlockReason,
  isDaily30ReadyForDraftImportCandidate,
} from '../candidates/getDaily30DraftImportBlockReason.js';
import { getLeadsCsvPath, getLeadsJsonPath } from '../config/paths.js';
import { saveLeadsToCsv } from '../storage/csvLeadRepository.js';
import { appendLeadsToJson, loadLeadsFromJson } from '../storage/jsonLeadRepository.js';
import {
  loadExternalCandidatesFromJson,
  persistExternalCandidates,
} from '../storage/externalCandidatesRepository.js';
import { IMPORT_DAILY_30_DRAFT_CANDIDATES_CONFIRM_TOKEN } from '../scripts/externalCandidateCliTokens.js';

export interface Daily30DraftImportResult {
  imported: Array<{ lead: Lead; candidate: ExternalLeadCandidate }>;
  skipped: Array<{ candidate: ExternalLeadCandidate; reason: string }>;
}

export class Daily30DraftImportGateError extends Error {
  constructor() {
    super(
      `確認トークンが必要です。「${IMPORT_DAILY_30_DRAFT_CANDIDATES_CONFIRM_TOKEN}」と入力してください`
    );
    this.name = 'Daily30DraftImportGateError';
  }
}

function markCandidateImported(
  candidate: ExternalLeadCandidate,
  leadId: string
): ExternalLeadCandidate {
  const stamp = `leads.json 取り込み済 leadId=${leadId}`;
  return {
    ...candidate,
    importStatus: 'imported',
    notes: candidate.notes?.trim() ? `${candidate.notes} / ${stamp}` : stamp,
    updatedAt: new Date().toISOString(),
  };
}

/** 1件取り込み（ゲート不要） */
export async function importDaily30DraftCandidateAsLead(
  externalCandidateId: string
): Promise<{ lead: Lead; candidate: ExternalLeadCandidate }> {
  const candidates = await loadExternalCandidatesFromJson();
  const index = candidates.findIndex((c) => c.externalCandidateId === externalCandidateId);
  if (index < 0) throw new Error(`外部候補が見つかりません: ${externalCandidateId}`);

  const candidate = candidates[index];
  const existingLeads = await loadLeadsFromJson(getLeadsJsonPath());
  const blockReason = getDaily30DraftImportBlockReason(candidate, existingLeads, candidates);
  if (blockReason) throw new Error(blockReason);

  const lead = buildLeadFromDaily30ReadyForDraft(candidate);
  const merged = await appendLeadsToJson(getLeadsJsonPath(), [lead]);
  await saveLeadsToCsv(getLeadsCsvPath(), merged);

  const updatedCandidate = markCandidateImported(candidate, lead.id);
  candidates[index] = updatedCandidate;
  await persistExternalCandidates(candidates);

  return { lead, candidate: updatedCandidate };
}

/** 一括取り込み（IMPORT_DAILY_30_DRAFT_CANDIDATES ゲート必須） */
export async function importDaily30DraftCandidatesBulk(options: {
  confirmToken?: string;
}): Promise<Daily30DraftImportResult> {
  if (options.confirmToken?.trim() !== IMPORT_DAILY_30_DRAFT_CANDIDATES_CONFIRM_TOKEN) {
    throw new Daily30DraftImportGateError();
  }

  const candidates = await loadExternalCandidatesFromJson();
  const existingLeads = await loadLeadsFromJson(getLeadsJsonPath());
  const targets = candidates.filter(isDaily30ReadyForDraftImportCandidate);

  const imported: Daily30DraftImportResult['imported'] = [];
  const skipped: Daily30DraftImportResult['skipped'] = [];
  const newLeads: Lead[] = [];
  const candidateUpdates = new Map<string, ExternalLeadCandidate>();

  let leadsSnapshot = existingLeads;

  for (const candidate of targets) {
    const blockReason = getDaily30DraftImportBlockReason(
      candidate,
      leadsSnapshot,
      candidates
    );
    if (blockReason) {
      skipped.push({ candidate, reason: blockReason });
      continue;
    }

    const lead = buildLeadFromDaily30ReadyForDraft(candidate);
    newLeads.push(lead);
    leadsSnapshot = [...leadsSnapshot, lead];
    const updatedCandidate = markCandidateImported(candidate, lead.id);
    candidateUpdates.set(candidate.externalCandidateId, updatedCandidate);
    imported.push({ lead, candidate: updatedCandidate });
  }

  if (newLeads.length > 0) {
    const merged = await appendLeadsToJson(getLeadsJsonPath(), newLeads);
    await saveLeadsToCsv(getLeadsCsvPath(), merged);

    const updatedCandidates = candidates.map((c) =>
      candidateUpdates.has(c.externalCandidateId)
        ? candidateUpdates.get(c.externalCandidateId)!
        : c
    );
    await persistExternalCandidates(updatedCandidates);
  }

  return { imported, skipped };
}

export function selectDaily30ReadyForDraftImportCandidates(
  candidates: ExternalLeadCandidate[]
): ExternalLeadCandidate[] {
  return candidates.filter(isDaily30ReadyForDraftImportCandidate);
}
