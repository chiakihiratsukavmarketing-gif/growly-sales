import { EmptyState } from './EmptyState.js';

interface FilterEmptyStateProps {
  onClear: () => void;
}

export function FilterEmptyState({ onClear }: FilterEmptyStateProps) {
  return (
    <EmptyState
      title="条件に一致するLeadはありません"
      reason="検索条件を変更するか、フィルターをクリアしてください。"
      actionLabel="条件をクリア"
      onAction={onClear}
    />
  );
}
