import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Lead } from '../../types/lead.js';
import { fetchLeads } from './api.js';
import { LeadStatusBadge } from './LeadStatusBadge.js';
import { SectionCard } from './SectionCard.js';
import { PageHeader } from './common/PageHeader.js';
import { EmptyState } from './common/EmptyState.js';
import { SearchAndFilterBar } from './common/SearchAndFilterBar.js';
import { FilterEmptyState } from './common/FilterEmptyState.js';
import {
  classifyFollowUpDue,
  filterByCompanyName,
  FOLLOW_UP_FILTER_OPTIONS,
  matchesFollowUpFilter,
} from './leadFilterUtils.js';
import type { SalesFlowTab } from './GrowlySalesDashboard.js';

interface FollowUpDashboardViewProps {
  onError: (message: string) => void;
  refreshKey?: number;
  onNavigateToTab?: (tab: SalesFlowTab, leadId?: string) => void;
}

function formatDue(lead: Lead): string {
  if (!lead.followUpDueAt) return '日付未設定';
  const d = new Date(lead.followUpDueAt);
  if (Number.isNaN(d.getTime())) return '日付未設定';
  return d.toLocaleDateString('ja-JP');
}

const BUCKET_LABELS: Record<string, string> = {
  today: '今日対応',
  overdue: '期限切れ',
  this_week: '今週対応',
  unset: '日付未設定',
  no_action: '対応不要',
};

export function FollowUpDashboardView({
  onError,
  refreshKey = 0,
  onNavigateToTab,
}: FollowUpDashboardViewProps) {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const contactedLeads = useMemo(
    () =>
      leads.filter(
        (l) =>
          (l.sendStatus === 'sent' || l.sendStatus === 'manual_sent') && !l.doNotContact
      ),
    [leads]
  );

  const filteredLeads = useMemo(() => {
    let items = contactedLeads;
    items = items.filter((l) => matchesFollowUpFilter(l, statusFilter, today));
    items = filterByCompanyName(items, search, (l) => l.companyName);
    return items;
  }, [contactedLeads, statusFilter, search, today]);

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('all');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const allLeads = await fetchLeads();
      setLeads(allLeads);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'フォローアップ情報の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const grouped = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const lead of filteredLeads) {
      const bucket = classifyFollowUpDue(lead, today);
      const list = map.get(bucket) ?? [];
      list.push(lead);
      map.set(bucket, list);
    }
    return map;
  }, [filteredLeads, today]);

  if (loading) return <p className="loading">次の連絡を読み込み中…</p>;

  const followTargets = contactedLeads.filter(
    (l) => l.nextAction === 'フォローアップ' || l.replyStatus === 'requested_report'
  );

  const showBucketSections = statusFilter === 'all';

  return (
    <div className="follow-up-dashboard-view">
      <PageHeader
        title="次の連絡"
        subtitle="次に連絡すべき Lead を確認します。自動送信は行いません。"
      />

      <SearchAndFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={FOLLOW_UP_FILTER_OPTIONS}
        resultCount={filteredLeads.length}
        totalCount={contactedLeads.length}
        onClear={clearFilters}
      />

      {contactedLeads.length === 0 ? (
        <EmptyState
          title="再連絡予定はありません"
          nextHint="返信管理でフォロー予定日を設定すると、ここに表示されます。"
          actionLabel="返信管理で設定する"
          onAction={() => onNavigateToTab?.('reply-management')}
        />
      ) : filteredLeads.length === 0 ? (
        <FilterEmptyState onClear={clearFilters} />
      ) : showBucketSections ? (
        <>
          {(['today', 'overdue', 'this_week', 'unset', 'no_action'] as const).map((bucket) => {
            const items = grouped.get(bucket) ?? [];
            if (items.length === 0 && bucket !== 'unset') return null;
            return (
              <FollowBucket
                key={bucket}
                title={BUCKET_LABELS[bucket]}
                items={items}
                emptyLabel={`${BUCKET_LABELS[bucket]}はありません`}
                highlight={bucket === 'overdue'}
                onOpenLead={(leadId) => onNavigateToTab?.('reply-management', leadId)}
              />
            );
          })}
        </>
      ) : (
        <SectionCard title={`${BUCKET_LABELS[statusFilter] ?? '一覧'}（${filteredLeads.length}件）`}>
          <ul className="follow-up-filtered-list">
            {filteredLeads.map((l) => (
              <li key={l.id}>
                <FollowUpLeadButton
                  lead={l}
                  formatDue={formatDue}
                  onOpen={() => onNavigateToTab?.('reply-management', l.id)}
                />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {followTargets.length > 0 && statusFilter === 'all' && search === '' && (
        <p className="hint">
          フォロー対象 {followTargets.length} 件 — 企業名をクリックすると返信管理で開きます（日付未設定は返信管理タブから予定日を設定）
        </p>
      )}
    </div>
  );
}

function FollowUpLeadButton({
  lead,
  formatDue,
  onOpen,
}: {
  lead: Lead;
  formatDue: (lead: Lead) => string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="follow-up-lead-button" onClick={onOpen}>
      <span className="follow-up-lead-name">{lead.companyName}</span>
      <span className="follow-up-meta">
        予定 {formatDue(lead)} · {lead.nextAction || '—'}
      </span>
      <span className="follow-up-lead-action-hint">返信管理で開く</span>
    </button>
  );
}

function FollowBucket({
  title,
  items,
  emptyLabel,
  highlight,
  onOpenLead,
}: {
  title: string;
  items: Lead[];
  emptyLabel: string;
  highlight?: boolean;
  onOpenLead: (leadId: string) => void;
}) {
  return (
    <SectionCard title={`${title}（${items.length}件）`} className={highlight ? 'follow-bucket-attn' : ''}>
      {items.length === 0 ? (
        <p className="hint">{emptyLabel}</p>
      ) : (
        <ul className="follow-up-simple-list">
          {items.map((l) => (
            <li key={l.id}>
              <FollowUpLeadButton
                lead={l}
                formatDue={formatDue}
                onOpen={() => onOpenLead(l.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
