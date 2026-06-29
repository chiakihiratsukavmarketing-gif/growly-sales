import { useMemo, useState } from 'react';
import type { Lead, ManualSendMethod, ReplyStatus, DealStatus } from '../../types/lead.js';
import {
  markDealStatusApi,
  markFollowUpApi,
  markManualSentApi,
  markReplyStatusApi,
  updateCommunicationMemoApi,
} from './communicationApi.js';
import { LeadStatusBadge } from './LeadStatusBadge.js';

export const COMMUNICATION_WARNING =
  'この操作は記録のみです。メール送信は行いません。自動送信も行いません。';

interface LeadCommunicationActionsProps {
  lead: Lead;
  onUpdated: (lead: Lead) => void;
  onError: (message: string) => void;
}

const METHODS: Array<{ value: ManualSendMethod; label: string }> = [
  { value: 'contact_form', label: '問い合わせフォーム' },
  { value: 'email', label: 'メール' },
  { value: 'instagram_dm', label: 'Instagram DM' },
  { value: 'other', label: 'その他' },
];

export function LeadCommunicationActions({ lead, onUpdated, onError }: LeadCommunicationActionsProps) {
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<ManualSendMethod>('contact_form');
  const [memo, setMemo] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  const manualSendDisabledReason = useMemo(() => {
    if (lead.doNotContact) return 'doNotContact=true のため送信記録不可';
    if (lead.humanReviewStatus !== 'approved') return '人間承認（approved）が必要';
    if (lead.reviewStatus !== 'approve') return '校閲（approve）が必要';
    if (lead.riskLevel === 'high') return 'riskLevel=high のため送信記録不可';
    return null;
  }, [lead.doNotContact, lead.humanReviewStatus, lead.reviewStatus, lead.riskLevel]);

  async function run(action: () => Promise<Lead>): Promise<void> {
    setBusy(true);
    try {
      const updated = await action();
      onUpdated(updated);
      setMemo('');
    } catch (err) {
      onError(err instanceof Error ? err.message : '操作に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  function replyButton(label: string, replyStatus: ReplyStatus) {
    return (
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy}
        onClick={() => void run(() => markReplyStatusApi(lead.id, { replyStatus, memo }))}
      >
        {label}
      </button>
    );
  }

  function dealButton(label: string, dealStatus: DealStatus) {
    return (
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy}
        onClick={() => void run(() => markDealStatusApi(lead.id, { dealStatus, memo }))}
      >
        {label}
      </button>
    );
  }

  return (
    <section className="detail-section">
      <h3>手動送信・返信ステータス管理</h3>
      <p className="hint">{COMMUNICATION_WARNING}</p>

      <div className="info-grid">
        <div className="info-row">
          <span className="info-key">sendStatus</span>
          <span className="info-value">
            <LeadStatusBadge kind="send" value={lead.sendStatus ?? 'not_sent'} />
          </span>
        </div>
        <div className="info-row">
          <span className="info-key">manualSentAt</span>
          <span className="info-value">{lead.manualSentAt ? new Date(lead.manualSentAt).toLocaleString('ja-JP') : '—'}</span>
        </div>
        <div className="info-row">
          <span className="info-key">manualSendMethod</span>
          <span className="info-value">{lead.manualSendMethod ?? '—'}</span>
        </div>
        <div className="info-row">
          <span className="info-key">replyStatus</span>
          <span className="info-value">
            <LeadStatusBadge kind="send" value={lead.replyStatus ?? 'none'} />
          </span>
        </div>
        <div className="info-row">
          <span className="info-key">dealStatus</span>
          <span className="info-value">
            <LeadStatusBadge kind="send" value={lead.dealStatus ?? 'none'} />
          </span>
        </div>
        <div className="info-row">
          <span className="info-key">nextAction</span>
          <span className="info-value">{lead.nextAction || '—'}</span>
        </div>
        <div className="info-row">
          <span className="info-key">repliedAt</span>
          <span className="info-value">{lead.repliedAt ? new Date(lead.repliedAt).toLocaleString('ja-JP') : '—'}</span>
        </div>
        <div className="info-row">
          <span className="info-key">replySummary</span>
          <span className="info-value">{lead.replySummary || '—'}</span>
        </div>
        <div className="info-row">
          <span className="info-key">followUpDueAt</span>
          <span className="info-value">{lead.followUpDueAt ? new Date(lead.followUpDueAt).toLocaleDateString('ja-JP') : '—'}</span>
        </div>
        <div className="info-row">
          <span className="info-key">followUpDate</span>
          <span className="info-value">{lead.followUpDate ? new Date(lead.followUpDate).toLocaleDateString('ja-JP') : '—'}</span>
        </div>
      </div>

      <div className="communication-form">
        <label className="field-label">メモ（送信・返信・商談・フォロー共通）</label>
        <textarea
          className="textarea"
          rows={2}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          disabled={busy}
          placeholder="必要ならメモを入力"
        />

        <div className="communication-block">
          <h4 className="subheading">手動送信管理</h4>
          <div className="row">
            <select
              className="input"
              value={method}
              onChange={(e) => setMethod(e.target.value as ManualSendMethod)}
              disabled={busy}
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || Boolean(manualSendDisabledReason)}
              onClick={() => void run(() => markManualSentApi(lead.id, { method, memo }))}
              title={manualSendDisabledReason ?? undefined}
            >
              手動送信済みにする（記録）
            </button>
          </div>
          {manualSendDisabledReason && <p className="hint">送信記録不可: {manualSendDisabledReason}</p>}
        </div>

        <div className="communication-block">
          <h4 className="subheading">返信管理</h4>
          <div className="action-buttons">
            {replyButton('返信あり', 'replied')}
            {replyButton('興味あり', 'interested')}
            {replyButton('診断希望', 'requested_report')}
            {replyButton('辞退', 'declined')}
            {replyButton('バウンス', 'bounced')}
            {replyButton('興味なし', 'not_interested')}
            {replyButton('商談化', 'meeting_scheduled')}
            {replyButton('返信なし', 'no_reply')}
          </div>
        </div>

        <div className="communication-block">
          <h4 className="subheading">フォロー</h4>
          <div className="row">
            <input
              className="input"
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              disabled={busy}
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || !followUpDate}
              onClick={() => void run(() => markFollowUpApi(lead.id, { followUpDate, memo }))}
            >
              フォロー必要
            </button>
          </div>
        </div>

        <div className="communication-block">
          <h4 className="subheading">結果（商談ステータス）</h4>
          <div className="action-buttons">
            {dealButton('対応中', 'open')}
            {dealButton('受注', 'won')}
            {dealButton('失注', 'lost')}
            {dealButton('一時停止', 'paused')}
          </div>
        </div>

        <div className="communication-block">
          <h4 className="subheading">通信メモ（保存）</h4>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void run(() => updateCommunicationMemoApi(lead.id, memo))}
          >
            メモを保存
          </button>
        </div>
      </div>
    </section>
  );
}

