import type { FilterOption } from '../leadFilterUtils.js';

export interface AreaFilterOption {
  value: string;
  label: string;
}

interface SearchAndFilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  filterValue: string;
  onFilterChange: (value: string) => void;
  filterOptions: FilterOption[];
  resultCount: number;
  totalCount: number;
  onClear: () => void;
  areaFilterValue?: string;
  onAreaFilterChange?: (value: string) => void;
  areaFilterOptions?: AreaFilterOption[];
  searchPlaceholder?: string;
}

export function SearchAndFilterBar({
  searchValue,
  onSearchChange,
  filterValue,
  onFilterChange,
  filterOptions,
  resultCount,
  totalCount,
  onClear,
  areaFilterValue,
  onAreaFilterChange,
  areaFilterOptions,
  searchPlaceholder = '企業名で検索',
}: SearchAndFilterBarProps) {
  const hasActiveFilters =
    searchValue.trim().length > 0 ||
    (filterValue !== 'all' && filterValue !== '') ||
    (areaFilterValue !== undefined && areaFilterValue !== 'all' && areaFilterValue !== '');

  return (
    <div className="search-filter-bar">
      <div className="search-filter-controls">
        <input
          type="search"
          className="search-filter-input"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="企業名で検索"
        />
        <select
          className="search-filter-select"
          value={filterValue}
          onChange={(e) => onFilterChange(e.target.value)}
          aria-label="状態で絞り込み"
        >
          {filterOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {areaFilterOptions && onAreaFilterChange && (
          <select
            className="search-filter-select"
            value={areaFilterValue ?? 'all'}
            onChange={(e) => onAreaFilterChange(e.target.value)}
            aria-label="地域で絞り込み"
          >
            <option value="all">地域で絞り込み</option>
            {areaFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
        {hasActiveFilters && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClear}>
            クリア
          </button>
        )}
      </div>
      <p className="search-filter-count">
        表示中：<strong>{resultCount}</strong>件 / 全<strong>{totalCount}</strong>件
      </p>
    </div>
  );
}
