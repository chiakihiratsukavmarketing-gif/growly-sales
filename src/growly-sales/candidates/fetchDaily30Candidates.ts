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
  DAILY_30_MAX_EMAIL_CHECKS,
  DAILY_30_TARGET,
} from './daily30CandidateStatus.js';
import { applyDaily30DuplicateStatus } from './daily30Dedupe.js';
import { enrichCandidateEmailFromWebsite } from './enrichCandidateEmailFromWebsite.js';

export interface Daily30FetchStats {
  batchId: string;
  target: number;
  queriesRun: number;
  placesResults: number;
  webResults: number;
  rawCandidates: number;
  acceptedNew: number;
  duplicates: number;
  emailFound: number;
  emailNotFound: number;
  emailChecksRun: number;
  areasUsed: string[];
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

function isAcceptedToday(candidate: ExternalLeadCandidate, batchId: string): boolean {
  return (
    candidate.collectionBatchId === batchId &&
    candidate.pipelineStatus !== 'duplicate' &&
    candidate.pipelineStatus !== 'excluded' &&
    candidate.importStatus !== 'duplicate'
  );
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

export async function fetchDaily30Candidates(
  profile: TargetProfile,
  existingLeads: Lead[],
  existingCandidates: ExternalLeadCandidate[] = [],
  options?: { batchId?: string; verifyEmails?: boolean }
): Promise<{ candidates: ExternalLeadCandidate[]; stats: Daily30FetchStats }> {
  if (!isApiProductionEnabled()) {
    throw new Error('API_PRODUCTION_ENABLED is not true');
  }

  const batchId = options?.batchId ?? todayBatchId();
  const verifyEmails = options?.verifyEmails !== false;

  const alreadyToday = existingCandidates.filter((c) => isAcceptedToday(c, batchId)).length;
  let needed = Math.max(0, DAILY_30_TARGET - alreadyToday);

  const allNewRaw: ExternalLeadCandidate[] = [];
  let queriesRun = 0;
  let placesResults = 0;
  let webResults = 0;
  const areasUsed: string[] = [];

  for (const area of DAILY_30_AREA_EXPANSION) {
    if (needed <= 0) break;
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
    const withDupes = applyDaily30DuplicateStatus(deduped, existingLeads, [
      ...existingCandidates,
      ...allNewRaw,
    ]);

    const accepted = withDupes.filter(
      (c) => c.pipelineStatus !== 'duplicate' && c.importStatus !== 'duplicate'
    );
    allNewRaw.push(...accepted.slice(0, needed));
    needed = Math.max(0, DAILY_30_TARGET - alreadyToday - allNewRaw.length);
  }

  let emailChecksRun = 0;
  let emailFound = 0;
  let emailNotFound = 0;
  const enriched: ExternalLeadCandidate[] = [];

  for (const candidate of allNewRaw) {
    if (verifyEmails && emailChecksRun < DAILY_30_MAX_EMAIL_CHECKS && candidate.websiteUrl) {
      const verified = await enrichCandidateEmailFromWebsite(candidate);
      emailChecksRun++;
      if (verified.pipelineStatus === 'email_found') emailFound++;
      else if (verified.pipelineStatus === 'email_not_found') emailNotFound++;
      enriched.push(verified);
    } else {
      enriched.push(candidate);
    }
  }

  const duplicatesInBatch = enriched.filter(
    (c) => c.pipelineStatus === 'duplicate' || c.importStatus === 'duplicate'
  ).length;

  const mergedMap = new Map(existingCandidates.map((c) => [c.externalCandidateId, c]));
  for (const c of enrichExternalLeadCandidates(enriched)) {
    mergedMap.set(c.externalCandidateId, c);
  }

  return {
    candidates: Array.from(mergedMap.values()),
    stats: {
      batchId,
      target: DAILY_30_TARGET,
      queriesRun,
      placesResults,
      webResults,
      rawCandidates: allNewRaw.length,
      acceptedNew: enriched.filter((c) => isAcceptedToday(c, batchId)).length,
      duplicates: duplicatesInBatch,
      emailFound,
      emailNotFound,
      emailChecksRun,
      areasUsed,
    },
  };
}

/** dry-run: エリア拡大プランのみ（外部APIなし） */
export function buildDaily30FetchPlan(): {
  target: number;
  areas: Daily30AreaSpec[];
  note: string;
} {
  return {
    target: DAILY_30_TARGET,
    areas: [...DAILY_30_AREA_EXPANSION],
    note: '宮城で不足時に福島→北関東（茨城→栃木→群馬）へ拡大。FETCH_DAILY_30 明示時のみ実行。',
  };
}
