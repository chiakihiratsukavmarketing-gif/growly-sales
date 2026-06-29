import { loadEnv, isApiProductionEnabled } from '../config/env.js';
import type { TargetProfile } from '../config/targetProfile.js';

export const PLACES_TEXT_SEARCH_URL =
  'https://maps.googleapis.com/maps/api/place/textsearch/json';

export const PLACES_DETAILS_URL =
  'https://maps.googleapis.com/maps/api/place/details/json';

/** 1クエリあたりの最大取得件数（大量収集防止） */
export const MAX_PLACES_RESULTS_PER_QUERY = 5;

export interface PlaceCandidate {
  name: string;
  address: string;
  websiteUrl: string | null;
  placeId: string | null;
  phoneNumber: string | null;
}

export interface PlacesSearchResult {
  enabled: boolean;
  mock: boolean;
  disabledReason: string | null;
  results: PlaceCandidate[];
  sourceQuery: string;
}

/**
 * Google Places API adapter — Text Search + Place Details（website取得）。
 * Google Maps HTML画面のスクレイピングは行わない。
 */
export async function searchPlaces(
  query: string,
  _targetProfile?: TargetProfile
): Promise<PlacesSearchResult> {
  const env = loadEnv();

  if (!env.isPlacesConfigured) {
    return disabledResult(query, 'GOOGLE_PLACES_API_KEY is not set');
  }

  if (!isApiProductionEnabled()) {
    return disabledResult(query, 'API_PRODUCTION_ENABLED is not true');
  }

  const apiKey = env.googlePlacesApiKey!;
  const searchUrl = `${PLACES_TEXT_SEARCH_URL}?query=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}&language=ja`;

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) {
    throw new Error(`Places Text Search failed (${searchRes.status})`);
  }

  const searchData = (await searchRes.json()) as {
    results?: Array<{ place_id?: string; name?: string; formatted_address?: string }>;
    status?: string;
    error_message?: string;
  };

  if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
    throw new Error(`Places API status: ${searchData.status ?? 'UNKNOWN'} ${searchData.error_message ?? ''}`);
  }

  const places = (searchData.results ?? []).slice(0, MAX_PLACES_RESULTS_PER_QUERY);
  const results: PlaceCandidate[] = [];

  for (const place of places) {
    if (!place.place_id || !place.name) continue;
    const details = await fetchPlaceDetails(place.place_id, apiKey);
    results.push({
      name: place.name,
      address: details.address || place.formatted_address || '',
      websiteUrl: details.websiteUrl,
      placeId: place.place_id,
      phoneNumber: details.phoneNumber,
    });
  }

  return {
    enabled: true,
    mock: false,
    disabledReason: null,
    results,
    sourceQuery: query,
  };
}

function disabledResult(query: string, reason: string): PlacesSearchResult {
  return {
    enabled: false,
    mock: true,
    disabledReason: reason,
    results: [],
    sourceQuery: query,
  };
}

async function fetchPlaceDetails(
  placeId: string,
  apiKey: string
): Promise<{ websiteUrl: string | null; phoneNumber: string | null; address: string }> {
  const url = `${PLACES_DETAILS_URL}?place_id=${encodeURIComponent(placeId)}&fields=name,formatted_address,website,formatted_phone_number&key=${encodeURIComponent(apiKey)}&language=ja`;
  const res = await fetch(url);
  if (!res.ok) {
    return { websiteUrl: null, phoneNumber: null, address: '' };
  }
  const data = (await res.json()) as {
    result?: {
      website?: string;
      formatted_phone_number?: string;
      formatted_address?: string;
    };
  };
  return {
    websiteUrl: data.result?.website?.trim() || null,
    phoneNumber: data.result?.formatted_phone_number?.trim() || null,
    address: data.result?.formatted_address?.trim() || '',
  };
}

export function isPlacesAdapterActive(): boolean {
  const env = loadEnv();
  return env.isPlacesConfigured && isApiProductionEnabled();
}
