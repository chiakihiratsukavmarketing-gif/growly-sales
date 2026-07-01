import { useEffect, useState } from 'react';
import type { Lead } from '../../types/lead.js';
import {
  approveLead,
  doNotContactLead,
  needsRevisionLead,
  rejectLeadApi,
  saveEmailDraft,
} from './api.js';

interface LeadReviewActionsProps {
  lead: Lead;
  onUpdated: (lead: Lead) => void;
  onError: (message: string) => void;
}

export function LeadReviewActions({ lead, onUpdated, onError }: LeadReviewActionsProps) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  async function runAction(action: () => Promise<Lead>): Promise<void> {
    setBusy(true);
    try {
      const updated = await action();
      onUpdated(updated);
      setComment('');
    } catch (err) {
      onError(err instanceof Error ? err.message : '操作に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="review-actions review-actions-compact">
      <h3>人間承認</h3>
      <p className="hint">承認は下書き候補化の許可です。自動送信はしません。</p>

      <label className="field-label" htmlFor="review-comment">
        コメント（修正・却下・連絡禁止時）
      </label>
      <textarea
        id="review-comment"
        className="textarea textarea-review-comment"
        rows={2}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="修正点や却下理由を入力"
        disabled={busy}
      />

      <div className="action-buttons action-buttons-compact">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || lead.doNotContact}
          onClick={() => void runAction(() => approveLead(lead.id))}
        >
          承認する
        </button>
        <button
          type="button"
          className="btn btn-warn btn-sm"
          disabled={busy || lead.doNotContact}
          onClick={() => void runAction(() => needsRevisionLead(lead.id, comment))}
        >
          修正が必要
        </button>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={busy || lead.doNotContact}
          onClick={() => void runAction(() => rejectLeadApi(lead.id, comment))}
        >
          却下する
        </button>
        <button
          type="button"
          className="btn btn-danger-outline btn-sm"
          disabled={busy}
          onClick={() => void runAction(() => doNotContactLead(lead.id, comment))}
        >
          連絡禁止にする
        </button>
      </div>

      <EmailDraftEditor lead={lead} busy={busy} onUpdated={onUpdated} onError={onError} />
    </section>
  );
}

interface EmailDraftEditorProps {
  lead: Lead;
  busy: boolean;
  onUpdated: (lead: Lead) => void;
  onError: (message: string) => void;
}

function EmailDraftEditor({ lead, busy, onUpdated, onError }: EmailDraftEditorProps) {
  const [emailSubject, setEmailSubject] = useState(lead.emailSubject);
  const [emailBody, setEmailBody] = useState(lead.emailBody);
  const [reviewComment, setReviewComment] = useState(lead.reviewComment);
  const [nextAction, setNextAction] = useState(lead.nextAction);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEmailSubject(lead.emailSubject);
    setEmailBody(lead.emailBody);
    setReviewComment(lead.reviewComment);
    setNextAction(lead.nextAction);
  }, [lead.id, lead.updatedAt, lead.emailSubject, lead.emailBody, lead.reviewComment, lead.nextAction]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      const updated = await saveEmailDraft(lead.id, {
        emailSubject,
        emailBody,
        reviewComment,
        nextAction,
      });
      onUpdated(updated);
    } catch (err) {
      onError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  const disabled = busy || saving || lead.doNotContact;

  return (
    <div className="email-editor email-editor-compact">
      <h3>メール文編集</h3>
      <label className="field-label" htmlFor="email-subject">
        件名
      </label>
      <input
        id="email-subject"
        className="input"
        value={emailSubject}
        onChange={(e) => setEmailSubject(e.target.value)}
        disabled={disabled}
      />

      <label className="field-label" htmlFor="email-body">
        本文
      </label>
      <textarea
        id="email-body"
        className="textarea email-body email-body-compact"
        rows={6}
        value={emailBody}
        onChange={(e) => setEmailBody(e.target.value)}
        disabled={disabled}
      />

      <label className="field-label" htmlFor="review-comment-field">
        校閲コメント
      </label>
      <textarea
        id="review-comment-field"
        className="textarea"
        rows={2}
        value={reviewComment}
        onChange={(e) => setReviewComment(e.target.value)}
        disabled={disabled}
      />

      <label className="field-label" htmlFor="next-action">
        次アクション
      </label>
      <input
        id="next-action"
        className="input"
        value={nextAction}
        onChange={(e) => setNextAction(e.target.value)}
        disabled={disabled}
      />

      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={disabled}
        onClick={() => void handleSave()}
      >
        {saving ? '保存中…' : 'メール文を保存'}
      </button>
    </div>
  );
}
