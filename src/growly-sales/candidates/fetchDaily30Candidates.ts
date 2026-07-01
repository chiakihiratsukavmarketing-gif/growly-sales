import type { TargetProfile } from '../config/targetProfile.js';
import type { Lead } from '../types/lead.js';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { searchPlaces } from '../adapters/placesAdapter.js';
import { searchWeb } from '../adapters/webSearchAdapter.js';
import { buildExternalLeadCandidate } from '../adapters/normalizeExternalLeadCandidate.js';
import { dedupeExternalCandidates } from '../adapters/dedupeExternalCandidates.js';
import { enrichExternalLeadCandidates } from '../candidates/enrichCandidateFields.js';
import { isApiProductionEnabled } from '../config/env.js';
import {
  DAILY_30_AREA_EXPANSION,
  buildDaily30QueriesForArea,
  todayBatchId,
  type Daily30AreaSpec,
} from './daily30AreaConfig.js';
import {
  DAILY_30_MAX_COLLECTED_CANDIDATES,
  DAILY_30_MAX_DURATION_MS,
  DAILY_30_MAX_EMAIL_CHECKS,
  DAILY_30_MAX_PLACES_RESULTS,
  DAILY_30_TARGET_EMAIL_FOUND,
} from './daily30CandidateStatus.js';
import {
  countDaily30BatchMetrics,
  resolveDaily30StoppedReason,
  type Daily30StoppedReason,
} from './daily30BatchMetrics.js';
import { applyDaily30DuplicateStatus } from './daily30Dedupe.js';
import { enrichCandidateEmailFromWebsite } from './enrichCandidateEmailFromWebsite.js';

export interface Daily30FetchStats {
  batchId: string;
  target: number;
  targetEmailFound: number;
  queriesRun: number;
  placesResults: number;
  webResults: number;
  rawCandidates: number;
  acceptedNew: number;
  collected: number;
  totalCollected: number;
  emailFound: number;
  formOnly: number;
  noEmail: number;
  emailNotFound: number;
  excluded: number;
  duplicates: number;
  emailChecksRun: number;
  areasUsed: string[];
  reachedTarget: boolean;
  stoppedReason: Daily30StoppedReason;
  durationMs: number;
}

function extractCompanyNameFromWebResult(title: string, url: string): string {
  const withoutSuffix = title.split('|')[0]?.split('－')[0]?.split('-')[0]?.trim();
  if (withoutSuffix && withoutSuffix.length >= 2) return withoutSuffix;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.split('.')[0] ?? title;
  } catch {
    return title;
  }
}

function upsertCandidate(
  list: ExternalLeadCandidate[],
  updated: ExternalLeadCandidate
): ExternalLeadCandidate[] {
  const idx = list.findIndex((c) => c.externalCandidateId === updated.externalCandidateId);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = updated;
    return next;
  }
  return [...list, updated];
}

async function fetchAreaCandidates(
  area: Daily30AreaSpec,
  profile: TargetProfile,
  batchId: string
): Promise<{ raw: ExternalLeadCandidate[]; queriesRun: number; placesResults: number; webResults: number }> {
  const queries = buildDaily30QueriesForArea(area, 4);
  const raw: ExternalLeadCandidate[] = [];
  let placesResults = 0;
  let webResults = 0;

  for (const query of queries) {
    const places = await searchPlaces(query, profile);
    if (places.enabled) {
      for (const place of places.results) {
        placesResults++;
        raw.push(
          buildExternalLeadCandidate(
            {
              sourceType: 'google_places',
              companyName: place.name,
              area: area.prefecture,
              address: place.address,
              websiteUrl: place.websiteUrl,
              phoneNumber: place.phoneNumber,
              googlePlaceId: place.placeId,
              sourceUrl: place.placeId
                ? `https://www.google.com/maps/place/?q=place_id:${place.placeId}`
                : null,
              sourceQuery: query,
              prefecture: area.prefecture,
              regionGroup: area.regionGroup,
              collectionPriority: area.collectionPriority,
              collectionAreaSource: area.prefecture,
              collectionBatchId: batchId,
            },
            profile
          )
        );
      }
    }

    const web = await searchWeb(`${query} 公式サイト`, profile);
    if (web.enabled) {
      for (const item of web.results) {
        webResults++;
        raw.push(
          buildExternalLeadCandidate(
            {
              sourceType: 'web_search',
              companyName: extractCompanyNameFromWebResult(item.title, item.url),
              area: area.prefecture,
              websiteUrl: item.url,
              sourceUrl: item.url,
              sourceQuery: query,
              prefecture: area.prefecture,
              regionGroup: area.regionGroup,
              collectionPriority: area.collectionPriority,
              collectionAreaSource: area.prefecture,
              collectionBatchId: batchId,
            },
            profile
          )
        );
      }
    }
  }

  return { raw, queriesRun: queries.length, placesResults, webResults };
}

function shouldStopCollection(input: {
  metrics: ReturnType<typeof countDaily30BatchMetrics>;
  startedMs: number;
  placesResults: number;
}): Daily30StoppedReason | null {
  if (input.metrics.reachedTarget) return 'target_email_found_reached';
  if (input.metrics.totalCollected >= DAILY_30_MAX_COLLECTED_CANDIDATES) {
    return 'max_candidates_reached';
  }
  if (Date.now() - input.startedMs >= DAILY_30_MAX_DURATION_MS) return 'max_duration_reached';
  if (input.placesResults >= DAILY_30_MAX_PLACES_RESULTS) return 'max_places_requests_reached';
  return null;
}

async function verifyPendingBatchCandidates(input: {
  workingCandidates: ExternalLeadCandidate[];
  batchId: string;
  verifyEmails: boolean;
  startedMs: number;
  placesResults: number;
  emailChecksRun: number;
}): Promise<{ workingCandidates: ExternalLeadCandidate[]; emailChecksRun: number }> {
  let { workingCandidates, emailChecksRun } = input;
  if (!input.verifyEmails) return { workingCandidates, emailChecksRun };

  const pending = workingCandidates.filter(
    (c) =>
      c.collectionBatchId === input.batchId &&
      !c.emailVerifiedAt &&
      c.pipelineStatus !== 'duplicate' &&
      c.pipelineStatus !== 'excluded' &&
      c.websiteUrl
  );

  for (const candidate of pending) {
    const metrics = countDaily30BatchMetrics(workingCandidates, input.batchId);
    const stop = shouldStopCollection({
      metrics,
      startedMs: input.startedMs,
      placesResults: input.placesResults,
    });
    if (stop) break;
    if (emailChecksRun >= DAILY_30_MAX_EMAIL_CHECKS) break;

    const verified = await enrichCandidateEmailFromWebsite(candidate);
    emailChecksRun++;
    workingCandidates = upsertCandidate(workingCandidates, verified);
  }

  return { workingCandidates, emailChecksRun };
}

export async function fetchDaily30Candidates(
  profile: TargetProfile,
  existingLeads: Lead[],
  existingCandidates: ExternalLeadCandidate[] = [],
  options?: { batchId?: string; verifyEmails?: boolean }
): Promise<{ candidates: ExternalLeadCandidate[]; stats: Daily30FetchStats }> {
  if (!isApiProductionEnabled()) {
    throw new Error('API_PRODUCTION_ENABLED is not true');
  }

  const startedMs = Date.now();
  const batchId = options?.batchId ?? todayBatchId();
  const verifyEmails = options?.verifyEmails !== false;

  let workingCandidates = [...existingCandidates];
  const initialCount = workingCandidates.length;
  let queriesRun = 0;
  let placesResults = 0;
  let webResults = 0;
  const areasUsed: string[] = [];
  let emailChecksRun = 0;
  let stoppedReason: Daily30StoppedReason = 'source_exhausted';
  let areasExhausted = false;

  const beforeMetrics = countDaily30BatchMetrics(workingCandidates, batchId);
  if (beforeMetrics.reachedTarget) {
    stoppedReason = 'target_email_found_reached';
    return {
      candidates: workingCandidates,
      stats: buildFetchStats({
        batchId,
        workingCandidates,
        initialCount,
        queriesRun,
        placesResults,
        webResults,
        areasUsed,
        emailChecksRun,
        stoppedReason,
        startedMs,
      }),
    };
  }

  ({ workingCandidates, emailChecksRun } = await verifyPendingBatchCandidates({
    workingCandidates,
    batchId,
    verifyEmails,
    startedMs,
    placesResults,
    emailChecksRun,
  }));

  let earlyStop = shouldStopCollection({
    metrics: countDaily30BatchMetrics(workingCandidates, batchId),
    startedMs,
    placesResults,
  });
  if (earlyStop) {
    stoppedReason = earlyStop;
    return {
      candidates: workingCandidates,
      stats: buildFetchStats({
        batchId,
        workingCandidates,
        initialCount,
        queriesRun,
        placesResults,
        webResults,
        areasUsed,
        emailChecksRun,
        stoppedReason,
        startedMs,
      }),
    };
  }

  for (const area of DAILY_30_AREA_EXPANSION) {
    const metricsBeforeArea = countDaily30BatchMetrics(workingCandidates, batchId);
    const limitStop = shouldStopCollection({ metrics: metricsBeforeArea, startedMs, placesResults });
    if (limitStop) {
      stoppedReason = limitStop;
      break;
    }

    areasUsed.push(area.prefecture);

    const { raw, queriesRun: q, placesResults: p, webResults: w } = await fetchAreaCandidates(
      area,
      profile,
      batchId
    );
    queriesRun += q;
    placesResults += p;
    webResults += w;

    const deduped = dedupeExternalCandidates(raw);
    const withDupes = applyDaily30DuplicateStatus(deduped, existingLeads, workingCandidates);
    const accepted = withDupes.filter(
      (c) => c.pipelineStatus !== 'duplicate' && c.importStatus !== 'duplicate'
    );

    const metrics = countDaily30BatchMetrics(workingCandidates, batchId);
    const room = DAILY_30_MAX_COLLECTED_CANDIDATES - metrics.totalCollected;
    const toAdd = enrichExternalLeadCandidates(accepted.slice(0, Math.max(0, room)));

    for (const c of toAdd) {
      workingCandidates = upsertCandidate(workingCandidates, c);
    }

    ({ workingCandidates, emailChecksRun } = await verifyPendingBatchCandidates({
      workingCandidates,
      batchId,
      verifyEmails,
      startedMs,
      placesResults,
      emailChecksRun,
    }));

    const afterArea = shouldStopCollection({
      metrics: countDaily30BatchMetrics(workingCandidates, batchId),
      startedMs,
      placesResults,
    });
    if (afterArea) {
      stoppedReason = afterArea;
      break;
    }
  }

  if (areasUsed.length >= DAILY_30_AREA_EXPANSION.length) {
    areasExhausted = true;
  }

  const finalMetrics = countDaily30BatchMetrics(workingCandidates, batchId);
  if (finalMetrics.reachedTarget) {
    stoppedReason = 'target_email_found_reached';
  } else if (stoppedReason === 'source_exhausted') {
    stoppedReason = resolveDaily30StoppedReason({
      metrics: finalMetrics,
      durationMs: Date.now() - startedMs,
      placesResults,
      areasExhausted,
      areasUsedCount: areasUsed.length,
      totalAreas: DAILY_30_AREA_EXPANSION.length,
    });
  }

  return {
    candidates: workingCandidates,
    stats: buildFetchStats({
      batchId,
      workingCandidates,
      initialCount,
      queriesRun,
      placesResults,
      webResults,
      areasUsed,
      emailChecksRun,
      stoppedReason,
      startedMs,
    }),
  };
}

function buildFetchStats(input: {
  batchId: string;
  workingCandidates: ExternalLeadCandidate[];
  initialCount: number;
  queriesRun: number;
  placesResults: number;
  webResults: number;
  areasUsed: string[];
  emailChecksRun: number;
  stoppedReason: Daily30StoppedReason;
  startedMs: number;
}): Daily30FetchStats {
  const metrics = countDaily30BatchMetrics(input.workingCandidates, input.batchId);
  const acceptedNew = Math.max(0, input.workingCandidates.length - input.initialCount);
  const emailNotFound = metrics.noEmail + metrics.formOnly;

  return {
    batchId: input.batchId,
    target: DAILY_30_TARGET_EMAIL_FOUND,
    targetEmailFound: DAILY_30_TARGET_EMAIL_FOUND,
    queriesRun: input.queriesRun,
    placesResults: input.placesResults,
    webResults: input.webResults,
    rawCandidates: acceptedNew,
    acceptedNew,
    collected: metrics.totalCollected,
    totalCollected: metrics.totalCollected,
    emailFound: metrics.emailFound,
    formOnly: metrics.formOnly,
    noEmail: metrics.noEmail,
    emailNotFound,
    excluded: metrics.excluded,
    duplicates: metrics.duplicates,
    emailChecksRun: input.emailChecksRun,
    areasUsed: input.areasUsed,
    reachedTarget: metrics.reachedTarget,
    stoppedReason: input.stoppedReason,
    durationMs: Date.now() - input.startedMs,
  };
}

/** dry-run: エリア拡大プランのみ（外部APIなし） */
export function buildDaily30FetchPlan(): {
  target: number;
  targetEmailFound: number;
  maxCollectedCandidates: number;
  areas: Daily30AreaSpec[];
  note: string;
} {
  return {
    target: DAILY_30_TARGET_EMAIL_FOUND,
    targetEmailFound: DAILY_30_TARGET_EMAIL_FOUND,
    maxCollectedCandidates: DAILY_30_MAX_COLLECTED_CANDIDATES,
    areas: [...DAILY_30_AREA_EXPANSION],
    note: '宮城で email_found 不足時に福島→北関東（茨城→栃木→群馬）へ拡大。FETCH_DAILY_30 明示時のみ実行。',
  };
}
