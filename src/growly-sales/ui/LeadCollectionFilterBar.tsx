import type { Lead } from '../types/lead.js';
import {
  LEAD_AREA_STRATEGY_FILTER_OPTIONS,
  LEAD_COLLECTION_MODE_FILTER_OPTIONS,
  LEAD_DISCOVERY_SOURCE_FILTER_OPTIONS,
  LEAD_DISCOVERY_SOURCE_SITE_FILTER_OPTIONS,
  LEAD_EMAIL_COMPLIANCE_FILTER_OPTIONS,
  LEAD_PREFECTURE_FILTER_OPTIONS,
  matchesLeadAreaStrategyFilter,
  matchesLeadCollectionModeFilter,
  matchesLeadDiscoverySourceFilter,
  matchesLeadDiscoverySourceSiteFilter,
  matchesLeadEmailComplianceFilter,
  matchesLeadPrefectureFilter,
} from '../candidates/resolveCollectionProfileDisplay.js';
import type { FilterOption } from './leadFilterUtils.js';

export interface LeadCollectionFilterState {
  discoverySource: string;
  discoverySourceSite: string;
  prefecture: string;
  areaStrategy: string;
  collectionMode: string;
  emailCompliance: string;
}

export const DEFAULT_LEAD_COLLECTION_FILTERS: LeadCollectionFilterState = {
  discoverySource: 'all',
  discoverySourceSite: 'all',
  prefecture: 'all',
  areaStrategy: 'all',
  collectionMode: 'all',
  emailCompliance: 'all',
};

interface LeadCollectionFilterBarProps {
  filters: LeadCollectionFilterState;
  onChange: (next: LeadCollectionFilterState) => void;
  onClear: () => void;
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly FilterOption[] | readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      className="search-filter-select collection-filter-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      title={label}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function LeadCollectionFilterBar({
  filters,
  onChange,
  onClear,
}: LeadCollectionFilterBarProps) {
  const hasActive = Object.values(filters).some((v) => v !== 'all');

  return (
    <div className="collection-filter-bar">
      <p className="collection-filter-bar-title">収集プロファイルで絞り込み</p>
      <div className="collection-filter-controls">
        <SelectFilter
          label="収集元"
          value={filters.discoverySource}
          options={[{ value: 'all', label: '収集元: すべて' }, ...LEAD_DISCOVERY_SOURCE_FILTER_OPTIONS.slice(1)]}
          onChange={(discoverySource) => onChange({ ...filters, discoverySource })}
        />
        <SelectFilter
          label="求人サイト"
          value={filters.discoverySourceSite}
          options={[
            { value: 'all', label: '求人サイト: すべて' },
            ...LEAD_DISCOVERY_SOURCE_SITE_FILTER_OPTIONS.slice(1),
          ]}
          onChange={(discoverySourceSite) => onChange({ ...filters, discoverySourceSite })}
        />
        <SelectFilter
          label="エリア"
          value={filters.prefecture}
          options={[{ value: 'all', label: 'エリア: すべて' }, ...LEAD_PREFECTURE_FILTER_OPTIONS.slice(1)]}
          onChange={(prefecture) => onChange({ ...filters, prefecture })}
        />
        <SelectFilter
          label="エリア戦略"
          value={filters.areaStrategy}
          options={[
            { value: 'all', label: 'エリア戦略: すべて' },
            ...LEAD_AREA_STRATEGY_FILTER_OPTIONS.slice(1),
          ]}
          onChange={(areaStrategy) => onChange({ ...filters, areaStrategy })}
        />
        <SelectFilter
          label="収集プロファイル"
          value={filters.collectionMode}
          options={[
            { value: 'all', label: '収集プロファイル: すべて' },
            ...LEAD_COLLECTION_MODE_FILTER_OPTIONS.slice(1),
          ]}
          onChange={(collectionMode) => onChange({ ...filters, collectionMode })}
        />
        <SelectFilter
          label="メール確認"
          value={filters.emailCompliance}
          options={[
            { value: 'all', label: 'メール確認: すべて' },
            ...LEAD_EMAIL_COMPLIANCE_FILTER_OPTIONS.slice(1),
          ]}
          onChange={(emailCompliance) => onChange({ ...filters, emailCompliance })}
        />
        {hasActive ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClear}>
            収集フィルターをクリア
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function matchesLeadCollectionFilters(lead: Lead, filters: LeadCollectionFilterState): boolean {
  return (
    matchesLeadDiscoverySourceFilter(lead, filters.discoverySource) &&
    matchesLeadDiscoverySourceSiteFilter(lead, filters.discoverySourceSite) &&
    matchesLeadPrefectureFilter(lead, filters.prefecture) &&
    matchesLeadAreaStrategyFilter(lead, filters.areaStrategy) &&
    matchesLeadCollectionModeFilter(lead, filters.collectionMode) &&
    matchesLeadEmailComplianceFilter(lead, filters.emailCompliance)
  );
}
