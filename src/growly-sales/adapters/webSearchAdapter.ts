import { loadEnv, isApiProductionEnabled } from '../config/env.js';
import type { TargetProfile } from '../config/targetProfile.js';

export const WEB_SEARCH_API_URL = 'https://www.googleapis.com/customsearch/v1';

/** 1クエリあたりの最大取得件数（大量収集防止） */
export const MAX_WEB_SEARCH_RESULTS_PER_QUERY = 5;

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResponse {
  enabled: boolean;
  mock: boolean;
  disabledReason: string | null;
  results: WebSearchResult[];
  sourceQuery: string;
}

/**
 * Web Search API adapter — Google Custom Search JSON API。
 * 無差別な大量URL収集は行わない（件数制限あり）。
 */
export async function searchWeb(
  query: string,
  _targetProfile?: TargetProfile
): Promise<WebSearchResponse> {
  const env = loadEnv();

  if (!env.isWebSearchConfigured) {
    return disabledResult(query, 'WEB_SEARCH_API_KEY or WEB_SEARCH_ENGINE_ID is not set');
  }

  if (!isApiProductionEnabled()) {
    return disabledResult(query, 'API_PRODUCTION_ENABLED is not true');
  }

  const apiKey = env.webSearchApiKey!;
  const cx = env.webSearchEngineId!;
  const url = `${WEB_SEARCH_API_URL}?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=${MAX_WEB_SEARCH_RESULTS_PER_QUERY}&lr=lang_ja`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Web Search API failed (${res.status})`);
  }

  const data = (await res.json()) as {
    items?: Array<{ title?: string; link?: string; snippet?: string }>;
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new Error(`Web Search API error: ${data.error.message}`);
  }

  const results: WebSearchResult[] = (data.items ?? [])
    .filter((item) => item.title && item.link)
    .slice(0, MAX_WEB_SEARCH_RESULTS_PER_QUERY)
    .map((item) => ({
      title: item.title!.trim(),
      url: item.link!.trim(),
      snippet: item.snippet?.trim() ?? '',
    }));

  return {
    enabled: true,
    mock: false,
    disabledReason: null,
    results,
    sourceQuery: query,
  };
}

function disabledResult(query: string, reason: string): WebSearchResponse {
  return {
    enabled: false,
    mock: true,
    disabledReason: reason,
    results: [],
    sourceQuery: query,
  };
}

export function isWebSearchAdapterActive(): boolean {
  const env = loadEnv();
  return env.isWebSearchConfigured && isApiProductionEnabled();
}
