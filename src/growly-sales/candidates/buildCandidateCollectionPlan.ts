import type { TargetProfile } from '../config/targetProfile.js';
import type { GrowlyEnv } from '../config/env.js';
import { isApiProductionEnabled } from '../config/env.js';
import { buildLeadSearchQueries } from '../adapters/buildLeadSearchQueries.js';
import { getExternalCandidatesCsvPath, getExternalCandidatesJsonPath } from '../config/paths.js';
import {
  CANDIDATE_COLLECTION_TARGET,
  CANDIDATE_FETCH_MAX_QUERIES,
  CANDIDATE_MAX_RESULTS_PER_QUERY,
  CANDIDATE_TARGET_AREAS,
  CANDIDATE_TARGET_CATEGORIES,
  CANDIDATE_TARGET_SIGNALS,
  FETCH_CANDIDATES_PROMPT,
} from './candidateCollectionConfig.js';
import { countTowardCollectionTarget } from './limitCandidateCollection.js';

export interface CandidateCollectionPlan {
  targetCount: number;
  currentLeadCount: number;
  remainingToTarget: number;
  targetAreas: readonly string[];
  targetCategories: readonly string[];
  targetSignals: readonly string[];
  searchQueries: string[];
  maxQueries: number;
  maxResultsPerQuery: number;
  apis: {
    placesConfigured: boolean;
    webSearchConfigured: boolean;
    productionEnabled: boolean;
  };
  savePaths: {
    externalJson: string;
    externalCsv: string;
    leadsJson: string;
    inputSitesCsv: string;
  };
  dedupeRules: string[];
  limitRules: string[];
  fetchGate: string;
  importGate: string;
  workflowSteps: string[];
}

export function buildCandidateCollectionPlan(
  profile: TargetProfile,
  env: GrowlyEnv,
  currentLeadCount: number,
  leadsJsonPath: string,
  inputSitesCsvPath: string
): CandidateCollectionPlan {
  const { remaining } = countTowardCollectionTarget(currentLeadCount);
  const searchQueries = buildLeadSearchQueries(profile, CANDIDATE_FETCH_MAX_QUERIES);

  return {
    targetCount: CANDIDATE_COLLECTION_TARGET,
    currentLeadCount,
    remainingToTarget: remaining,
    targetAreas: CANDIDATE_TARGET_AREAS,
    targetCategories: CANDIDATE_TARGET_CATEGORIES,
    targetSignals: CANDIDATE_TARGET_SIGNALS,
    searchQueries,
    maxQueries: CANDIDATE_FETCH_MAX_QUERIES,
    maxResultsPerQuery: CANDIDATE_MAX_RESULTS_PER_QUERY,
    apis: {
      placesConfigured: env.isPlacesConfigured,
      webSearchConfigured: env.isWebSearchConfigured,
      productionEnabled: isApiProductionEnabled(),
    },
    savePaths: {
      externalJson: getExternalCandidatesJsonPath(),
      externalCsv: getExternalCandidatesCsvPath(),
      leadsJson: leadsJsonPath,
      inputSitesCsv: inputSitesCsvPath,
    },
    dedupeRules: [
      'website domain（hostname）が同一なら同一企業',
      'companyName + area でフォールバック重複判定',
      '既存Lead・既存外部候補・同一バッチ内で重複排除',
      '同一企業の別ページは別Leadにしない',
    ],
    limitRules: [
      `目標 ${CANDIDATE_COLLECTION_TARGET}件まで（現在Lead数を差し引いた残枠で新規候補を制限）`,
      `1クエリあたり最大 ${CANDIDATE_MAX_RESULTS_PER_QUERY} 件（Places / Web各）`,
      `クエリ数最大 ${CANDIDATE_FETCH_MAX_QUERIES} 件`,
      '公式サイトURLなしは needs_review（自動Lead化しない）',
    ],
    fetchGate: FETCH_CANDIDATES_PROMPT,
    importGate: 'IMPORT_APPROVED 入力 + UI承認後のみ input-sites.csv へ追記',
    workflowSteps: [
      'npm run growly-sales:candidates-preview（dry-run）',
      'npm run growly-sales:fetch-candidates（FETCH_CANDIDATES 必須）',
      'UIで候補レビュー → approved_for_import',
      'npm run growly-sales:external-import-approved',
      'npm run growly-sales:day1（contactFormUrl / emailCandidates 解析）',
      'npm run growly-sales:candidates-audit',
    ],
  };
}
