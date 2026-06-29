import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Lead } from '../../types/lead.js';
import { fetchLeads } from './api.js';
import { fetchSalesAnalytics } from './salesAnalyticsApi.js';
import { FollowUpList } from './FollowUpList.js';
import { NextActionList } from './NextActionList.js';
import { InfoBanner } from './InfoBanner.js';
import { SectionCard } from './SectionCard.js';
import { LeadStatusBadge } from './LeadStatusBadge.js';

interface FollowUpDashboardViewProps {
  onError: (message: string) => void;
  refreshKey?: number;
}

export function FollowUpDashboardView({ onError, refreshKey = 0 }: FollowUpDashboardViewProps) {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof fetchSalesAnalytics>> | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, allLeads] = await Promise.all([fetchSalesAnalytics(), fetchLeads()]);
      setAnalytics(data);
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

  if (loading) return <p className="loading">フォローアップを読み込み中…</p>;
  if (!analytics) {
    return <p className="hint">フォローアップ情報を取得できませんでした。</p>;
  }

  function classifyDue(lead: Lead): 'overdue' | 'today' | 'this_week' | 'unset' {
    if (!lead.followUpDueAt) return 'unset';
    const t = Date.parse(lead.followUpDueAt);
    if (!Number.isFinite(t)) return 'unset';
    const due = new Date(t);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((due.getTime() - today.getTime()) / (24 * 3600 * 1000));
    if (diffDays < 0) return 'overdue';
    if (diffDays === 0) return 'today';
    if (diffDays <= 7) return 'this_week';
    return 'this_week';
  }

  const requestedReport = leads.filter(
    (l) =>
      (l.sendStatus === 'sent' || l.sendStatus === 'manual_sent') &&
      l.replyStatus === 'requested_report' &&
      !l.doNotContact
  );
  const followUpTargets = leads.filter((l) => l.nextAction === 'フォローアップ' && !l.doNotContact);
  const dueBuckets = {
    today: followUpTargets.filter((l) => classifyDue(l) === 'today'),
    overdue: followUpTargets.filter((l) => classifyDue(l) === 'overdue'),
    thisWeek: followUpTargets.filter((l) => classifyDue(l) === 'this_week'),
    unset: followUpTargets.filter((l) => classifyDue(l) === 'unset'),
  };

  const followUpActions = (analytics.analytics?.nextActionList ?? []).filter(
    (item) =>
      item.reason.includes('follow_up') ||
      item.reason.includes('followUpDate') ||
      item.reason.includes('interested')
  );

  return (
    <div className="follow-up-dashboard-view">
      <InfoBanner variant="info">
        フォローアップ対象の確認（読み取り専用）。自動送信は行いません。診断希望（requested_report）もここで見える化します。
      </InfoBanner>

      {requestedReport.length > 0 && (
        <SectionCard title={`診断希望（${requestedReport.length}件）`} className="requested-report-card">
          <InfoBanner variant="warning">
            replyStatus=requested_report の Lead です。診断レポートは自動生成しません（次アクション整理のみ）。
          </InfoBanner>
          <ul className="policy-list compact">
            {requestedReport.slice(0, 10).map((l) => (
              <li key={l.id}>
                <strong>{l.companyName}</strong> / <LeadStatusBadge kind="send" value={l.replyStatus} />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard title="followUpDueAt アラート" className="followup-due-alerts">
        <p className="hint">今日以前（期限切れ/今日対応）を優先してください。</p>
        <div className="stats-grid">
          <div className="stat-card highlight">
            <div className="stat-value">{dueBuckets.today.length}</div>
            <div className="stat-label">今日対応</div>
          </div>
          <div className="stat-card highlight">
            <div className="stat-value">{dueBuckets.overdue.length}</div>
            <div className="stat-label">期限超過</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{dueBuckets.thisWeek.length}</div>
            <div className="stat-label">今週対応</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{dueBuckets.unset.length}</div>
            <div className="stat-label">期限未設定</div>
          </div>
        </div>
      </SectionCard>

      <FollowUpList items={analytics.analytics?.followUpList ?? []} />
      <SectionCard title="フォローアップ優先アクション" className="analytics-section">
        <NextActionList items={followUpActions} />
      </SectionCard>
    </div>
  );
}
