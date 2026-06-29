import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Lead } from '../../types/lead.js';
import { fetchLeads } from './api.js';
import { markDealStatusApi, updateLeadReplyManagementApi } from './communicationApi.js';
import {
  isAwaitingReplyLead,
  isFollowUpOnlySentLead,
} from '../workflow/replyManagement.js';
import { InfoBanner } from './InfoBanner.js';
import { SectionCard } from './SectionCard.js';
import { ReplyManagementLeadCard } from './ReplyManagementLeadCard.js';
import { ReplyManagementConfirmDialog } from './ReplyManagementConfirmDialog.js';
import {
  buildReplyFormPayload,
  getReplyRowCategory,
  leadToReplyFormDraft,
  type ReplyFormDraft,
} from './replyManagementUiUtils.js';

interface ReplyManagementViewProps {
  onError: (message: string) => void;
  onUpdated?: (lead: Lead) => void;
  refreshKey?: number;
}

type DraftMap = Record<string, ReplyFormDraft>;
type AwaitingFilter = 'all' | 'follow_up' | 'normal' | 'watch' | 'unknown';
type AwaitBucket = 'watch' | 'normal' | 'follow_up' | 'unknown';

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function formatSentDate(lead: Lead): string {
  const sentAt = lead.manualSentAt ?? null;
  if (!sentAt) return '—';
  const d = new Date(sentAt);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ja-JP');
}

function elapsedDays(lead: Lead, today: Date): number | null {
  const sentAt = lead.manualSentAt ?? null;
  if (!sentAt) return null;
  const t = Date.parse(sentAt);
  if (!Number.isFinite(t)) return null;
  return Math.floor((today.getTime() - t) / (24 * 3600 * 1000));
}

function awaitBucket(lead: Lead, today: Date): AwaitBucket {
  const days = elapsedDays(lead, today);
  if (days === null) return 'unknown';
  if (days <= 2) return 'watch';
  if (days <= 6) return 'normal';
  return 'follow_up';
}

export function ReplyManagementView({
  onError,
  onUpdated,
  refreshKey = 0,
}: ReplyManagementViewProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingDeal, setTogglingDeal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ lead: Lead; draft: ReplyFormDraft } | null>(
    null
  );
  const [awaitingFilter, setAwaitingFilter] = useState<AwaitingFilter>('all');
  const [sortDesc, setSortDesc] = useState(true);
  const [onlyUnchecked, setOnlyUnchecked] = useState(true);
  const [checkVersion, setCheckVersion] = useState(0);

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const checkKeyPrefix = `growly-sales-reply-check-${todayKey}-`;

  const isChecked = useCallback(
    (leadId: string): boolean => {
      try {
        return localStorage.getItem(`${checkKeyPrefix}${leadId}`) === '1';
      } catch {
        return false;
      }
    },
    [checkKeyPrefix, checkVersion]
  );

  const setChecked = useCallback(
    (leadId: string, checked: boolean): void => {
      try {
        localStorage.setItem(`${checkKeyPrefix}${leadId}`, checked ? '1' : '0');
        setCheckVersion((v) => v + 1);
      } catch {
        // ignore
      }
    },
    [checkKeyPrefix]
  );

  const awaitingLeads = useMemo(() => leads.filter(isAwaitingReplyLead), [leads]);

  const awaitingSorted = useMemo(() => {
    const today = startOfToday();
    const filtered = awaitingLeads.filter((lead) => {
      if (onlyUnchecked && isChecked(lead.id)) return false;
      if (awaitingFilter === 'all') return true;
      const b = awaitBucket(lead, today);
      if (awaitingFilter === 'follow_up') return b === 'follow_up';
      if (awaitingFilter === 'normal') return b === 'normal';
      if (awaitingFilter === 'watch') return b === 'watch';
      return b === 'unknown';
    });
    const withDays = filtered.map((l) => ({ lead: l, days: elapsedDays(l, today) }));
    withDays.sort((a, b) => {
      if (a.days === null && b.days === null) {
        return a.lead.companyName.localeCompare(b.lead.companyName, 'ja');
      }
      if (a.days === null) return 1;
      if (b.days === null) return -1;
      return sortDesc ? b.days - a.days : a.days - b.days;
    });
    return withDays.map((x) => x.lead);
  }, [awaitingLeads, awaitingFilter, onlyUnchecked, sortDesc, isChecked]);

  const load = useCallback(async () => {
    setLoading(true);
    setSuccessMessage(null);
    try {
      const data = await fetchLeads();
      const contacted = data
        .filter((l) => l.sendStatus === 'sent' || l.sendStatus === 'manual_sent')
        .sort((a, b) => {
          const catOrder = (lead: Lead) => {
            const cat = getReplyRowCategory(lead);
            const order: Record<string, number> = {
              requested_report: 0,
              awaiting: 1,
              interested: 2,
              replied: 3,
              follow_up: 4,
              declined: 5,
              bounced: 6,
            };
            return order[cat] ?? 9;
          };
          if (catOrder(a) !== catOrder(b)) return catOrder(a) - catOrder(b);
          return a.companyName.localeCompare(b.companyName, 'ja');
        });
      setLeads(contacted);
      setDrafts(Object.fromEntries(contacted.map((l) => [l.id, leadToReplyFormDraft(l)])));
    } catch (err) {
      onError(err instanceof Error ? err.message : '返信管理の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  function handleDraftChange(leadId: string, draft: ReplyFormDraft): void {
    setDrafts((prev) => ({ ...prev, [leadId]: draft }));
  }

  async function handleConfirmSave(): Promise<void> {
    if (!confirmTarget) return;
    setSaving(true);
    try {
      const payload = buildReplyFormPayload(confirmTarget.draft);
      const updated = await updateLeadReplyManagementApi(confirmTarget.lead.id, payload);
      setConfirmTarget(null);
      setSuccessMessage(`${updated.companyName} の返信管理を更新しました`);
      onUpdated?.(updated);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : '返信管理の保存に失敗しました');
      setConfirmTarget(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleRequestedReportDone(lead: Lead, done: boolean): Promise<void> {
    setTogglingDeal(true);
    try {
      const updated = await markDealStatusApi(lead.id, {
        dealStatus: done ? 'open' : 'none',
        memo: done ? '診断レポート対応中/済（Phase21）' : '診断レポート未着手（Phase21）',
      });
      setSuccessMessage(
        `${updated.companyName} を ${done ? '対応中/済（dealStatus=open）' : '未着手（dealStatus=none）'} にしました`
      );
      onUpdated?.(updated);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : '診断希望フラグの更新に失敗しました');
    } finally {
      setTogglingDeal(false);
    }
  }

  if (loading) return <p className="loading">返信管理を読み込み中…</p>;

  const requestedReportLeads = leads.filter((l) => l.replyStatus === 'requested_report');
  const otherLeads = leads.filter((l) => !isAwaitingReplyLead(l));
  const awaitingCount = awaitingLeads.length;
  const followUpCount = leads.filter(isFollowUpOnlySentLead).length;
  const requestedReportCount = leads.filter((l) => l.replyStatus === 'requested_report').length;
  const today = startOfToday();

  const awaitingBuckets = {
    watch: awaitingLeads.filter((l) => awaitBucket(l, today) === 'watch'),
    normal: awaitingLeads.filter((l) => awaitBucket(l, today) === 'normal'),
    followUp: awaitingLeads.filter((l) => awaitBucket(l, today) === 'follow_up'),
    unknown: awaitingLeads.filter((l) => awaitBucket(l, today) === 'unknown'),
  };

  function renderCard(lead: Lead) {
    const draft = drafts[lead.id] ?? leadToReplyFormDraft(lead);
    return (
      <ReplyManagementLeadCard
        key={lead.id}
        lead={lead}
        draft={draft}
        onDraftChange={(next) => handleDraftChange(lead.id, next)}
        onSave={() => setConfirmTarget({ lead, draft })}
      />
    );
  }

  return (
    <div className="reply-management-view">
      <InfoBanner variant="info">
        送信済み Lead の返信状況を更新できます。Gmail送信・自動送信は行いません。返信本文は保存せず要約のみ記録します。
      </InfoBanner>

      {awaitingCount > 0 && (
        <SectionCard title={`返信待ち ${awaitingCount}件を確認`} className="reply-routine-card">
          <InfoBanner variant="warning">
            <strong>日次ルーチン:</strong> Gmail受信トレイで返信有無を確認してください。
          </InfoBanner>
          <ul className="policy-list compact">
            <li>
              <strong>返信なし</strong> → 何も更新しなくてOK（この画面を閉じて次の作業へ）
            </li>
            <li>
              <strong>返信あり</strong> → 該当 Lead の replyStatus / replySummary（要約のみ）/
              followUpDueAt を更新して「変更を保存」
            </li>
            <li>返信本文全文は保存しません（replySummary のみ）</li>
          </ul>
        </SectionCard>
      )}

      {requestedReportCount > 0 && (
        <SectionCard
          title={`診断希望（${requestedReportCount}件）`}
          className="reply-awaiting-section requested-report-section"
        >
          <InfoBanner variant="warning">
            <strong>最優先:</strong> 診断レポート作成が必要です（自動作成はしません）。
          </InfoBanner>
          <p className="hint">
            nextAction は「診断レポート作成」になります。対応後、必要に応じて followUpDueAt を設定してください。
          </p>
          <p className="hint">
            対応フラグは <strong>dealStatus=open</strong> で管理します（診断レポート生成は行いません）。
          </p>
          <div className="reply-card-list">{requestedReportLeads.map(renderCard)}</div>
          <div className="requested-report-flag-list">
            {requestedReportLeads.map((lead) => (
              <div key={lead.id} className="requested-report-flag-row">
                <strong>{lead.companyName}</strong>
                <span className="hint">dealStatus: {lead.dealStatus}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={togglingDeal}
                  onClick={() => void handleToggleRequestedReportDone(lead, true)}
                >
                  対応中/済にする（open）
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={togglingDeal}
                  onClick={() => void handleToggleRequestedReportDone(lead, false)}
                >
                  未着手に戻す（none）
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {successMessage && <div className="alert alert-success">{successMessage}</div>}
      <p className="hint">
        返信待ち {awaitingCount}件 / 診断希望 {requestedReportCount}件 / フォローアップ対象{' '}
        {followUpCount}件
      </p>

      <div className="reply-legend">
        <span className="reply-legend-item reply-row-awaiting">返信待ち</span>
        <span className="reply-legend-item reply-row-replied">返信あり</span>
        <span className="reply-legend-item reply-row-requested_report">診断希望</span>
        <span className="reply-legend-item reply-row-follow_up">フォローアップ</span>
        <span className="reply-legend-item reply-row-declined">辞退</span>
        <span className="reply-legend-item reply-row-bounced">バウンス</span>
      </div>

      {awaitingCount > 0 && (
        <SectionCard title={`返信待ち（確認対象 ${awaitingCount}件）`} className="reply-awaiting-section">
          <InfoBanner variant="warn">
            送信日と経過日数で分類しています。7日以上返信なしは<strong>フォローアップ候補</strong>として強調（自動変更なし）。
          </InfoBanner>

          <div className="reply-awaiting-toolbar">
            <div className="reply-awaiting-filters">
              <button
                type="button"
                className={`btn btn-secondary btn-sm ${awaitingFilter === 'all' ? 'active' : ''}`}
                onClick={() => setAwaitingFilter('all')}
              >
                全部
              </button>
              <button
                type="button"
                className={`btn btn-secondary btn-sm ${awaitingFilter === 'follow_up' ? 'active' : ''}`}
                onClick={() => setAwaitingFilter('follow_up')}
              >
                7日以上
              </button>
              <button
                type="button"
                className={`btn btn-secondary btn-sm ${awaitingFilter === 'normal' ? 'active' : ''}`}
                onClick={() => setAwaitingFilter('normal')}
              >
                3〜6日
              </button>
              <button
                type="button"
                className={`btn btn-secondary btn-sm ${awaitingFilter === 'watch' ? 'active' : ''}`}
                onClick={() => setAwaitingFilter('watch')}
              >
                0〜2日
              </button>
              <button
                type="button"
                className={`btn btn-secondary btn-sm ${awaitingFilter === 'unknown' ? 'active' : ''}`}
                onClick={() => setAwaitingFilter('unknown')}
              >
                送信日不明
              </button>
            </div>

            <div className="reply-awaiting-sort">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSortDesc((v) => !v)}
              >
                経過日数: {sortDesc ? '多い順' : '少ない順'}
              </button>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={onlyUnchecked}
                  onChange={(e) => setOnlyUnchecked(e.target.checked)}
                />
                今日未確認のみ
              </label>
              <span className="hint">確認済みは localStorage のみ（{todayKey}）</span>
            </div>
          </div>

          <div className="lead-table-wrap">
            <table className="lead-table">
              <thead>
                <tr>
                  <th>確認</th>
                  <th>会社名</th>
                  <th>送信日</th>
                  <th>経過日数</th>
                  <th>To</th>
                  <th>replyStatus</th>
                  <th>nextAction</th>
                  <th>followUpDueAt</th>
                  <th>返信確認メモ</th>
                </tr>
              </thead>
              <tbody>
                {awaitingSorted.map((lead) => {
                    const days = elapsedDays(lead, today);
                    const isCandidate = (days ?? 0) >= 7;
                    const checked = isChecked(lead.id);
                    return (
                      <tr
                        key={lead.id}
                        className={[
                          isCandidate ? 'awaiting-followup-candidate' : '',
                          checked ? 'awaiting-checked' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setChecked(lead.id, e.target.checked)}
                          />
                        </td>
                        <td className="company-name">{lead.companyName}</td>
                        <td>{formatSentDate(lead)}</td>
                        <td>{days === null ? '要確認' : `${days}日`}</td>
                        <td>{lead.emailCandidates[0] ?? '—'}</td>
                        <td>{lead.replyStatus}</td>
                        <td>{lead.nextAction || '—'}</td>
                        <td>{lead.followUpDueAt ? new Date(lead.followUpDueAt).toLocaleDateString('ja-JP') : '—'}</td>
                        <td>{lead.replySummary?.trim() ? lead.replySummary : '—'}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {awaitingBuckets.followUp.length > 0 && (
            <InfoBanner variant="warning">
              フォローアップ候補（7日以上返信なし）: {awaitingBuckets.followUp.length}件。必要な場合のみ followUpDueAt / nextAction を更新してください。
            </InfoBanner>
          )}

          <div className="reply-card-list">{awaitingLeads.map(renderCard)}</div>
        </SectionCard>
      )}

      <SectionCard title={`その他の送信済み Lead（${otherLeads.length}件）`}>
        {leads.length === 0 ? (
          <p className="hint">送信済み Lead はありません。</p>
        ) : otherLeads.length === 0 ? (
          <p className="hint">返信待ち以外の Lead はありません。</p>
        ) : (
          <div className="reply-card-list">{otherLeads.map(renderCard)}</div>
        )}
      </SectionCard>

      {confirmTarget && (
        <ReplyManagementConfirmDialog
          lead={confirmTarget.lead}
          draft={confirmTarget.draft}
          saving={saving}
          onConfirm={() => void handleConfirmSave()}
          onCancel={() => !saving && setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
