import type { TargetProfile } from '../config/targetProfile.js';
import { searchPlaces } from './placesAdapter.js';
import { searchWeb } from './webSearchAdapter.js';
import { buildLeadSearchQueries } from './buildLeadSearchQueries.js';
import { buildExternalLeadCandidate } from './normalizeExternalLeadCandidate.js';
import {
  applyDuplicateStatus,
  dedupeExternalCandidates,
} from './dedupeExternalCandidates.js';
import type { ExternalLeadCandidate } from './externalLeadCandidateTypes.js';
import type { Lead } from '../types/lead.js';
import { isApiProductionEnabled } from '../config/env.js';
import { enrichExternalLeadCandidates } from '../candidates/enrichCandidateFields.js';
import { limitNewCandidates } from '../candidates/limitCandidateCollection.js';
import { CANDIDATE_FETCH_MAX_QUERIES } from '../candidates/candidateCollectionConfig.js';

export interface ExternalFetchStats {
  queries: number;
  placesResults: number;
  webResults: number;
  candidates: number;
  duplicates: number;
  needsReview: number;
  deferredByLimit: number;
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

export async function fetchExternalLeadCandidates(
  profile: TargetProfile,
  existingLeads: Lead[],
  existingCandidates: ExternalLeadCandidate[] = [],
  options?: { maxQueries?: number; maxNewCandidates?: number }
): Promise<{ candidates: ExternalLeadCandidate[]; stats: ExternalFetchStats }> {
  if (!isApiProductionEnabled()) {
    throw new Error('API_PRODUCTION_ENABLED is not true');
  }

  const queries = buildLeadSearchQueries(profile, options?.maxQueries ?? CANDIDATE_FETCH_MAX_QUERIES);
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
              address: place.address,
              websiteUrl: place.websiteUrl,
              phoneNumber: place.phoneNumber,
              googlePlaceId: place.placeId,
              sourceUrl: place.placeId
                ? `https://www.google.com/maps/place/?q=place_id:${place.placeId}`
                : null,
              sourceQuery: query,
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
              websiteUrl: item.url,
              sourceUrl: item.url,
              sourceQuery: query,
            },
            profile
          )
        );
      }
    }
  }

  const deduped = dedupeExternalCandidates(raw);
  const withDupes = enrichExternalLeadCandidates(
    applyDuplicateStatus(deduped, existingLeads, existingCandidates)
  );

  const maxNew = options?.maxNewCandidates;
  const limited =
    maxNew !== undefined
      ? (() => {
          const { accepted, deferred } = limitNewCandidates(withDupes, maxNew);
          return { candidates: [...accepted, ...deferred], deferred };
        })()
      : { candidates: withDupes, deferred: [] as ExternalLeadCandidate[] };

  return {
    candidates: limited.candidates,
    stats: {
      queries: queries.length,
      placesResults,
      webResults,
      candidates: limited.candidates.length,
      duplicates: limited.candidates.filter((c) => c.importStatus === 'duplicate').length,
      needsReview: limited.candidates.filter((c) => c.importStatus === 'needs_review').length,
      deferredByLimit: limited.deferred.length,
    },
  };
}

export function buildExternalPreviewSample(profile: TargetProfile): ExternalLeadCandidate[] {
  const query = buildLeadSearchQueries(profile)[0] ?? '宮城県 工務店';
  return [
    buildExternalLeadCandidate(
      {
        sourceType: 'google_places',
        companyName: '（サンプル）宮城工務店',
        area: '宮城県仙台市',
        industry: '工務店',
        websiteUrl: 'https://example-housing.test',
        phoneNumber: '022-000-0000',
        address: '宮城県仙台市青葉区',
        googlePlaceId: 'ChIJ_sample_place_id',
        sourceUrl: 'https://www.google.com/maps/place/?q=place_id:ChIJ_sample',
        sourceQuery: query,
      },
      profile
    ),
    buildExternalLeadCandidate(
      {
        sourceType: 'web_search',
        companyName: '（サンプル）公式サイト未取得候補',
        area: '宮城県',
        industry: '工務店',
        websiteUrl: null,
        sourceUrl: null,
        sourceQuery: query,
      },
      profile
    ),
  ];
}
