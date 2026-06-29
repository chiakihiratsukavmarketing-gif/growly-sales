import type { Lead } from '../../types/lead.js';
import {
  NEXT_ACTION_OPTIONS,
  REPLY_MANAGEMENT_UI_STATUSES,
  REPLY_SUMMARY_MAX_LENGTH,
  applyReplyStatusToDraft,
  getReplyRowClass,
  hasDraftChanges,
  leadToReplyFormDraft,
  type ReplyFormDraft,
} from './replyManagementUiUtils.js';
import { replyStatusLabel } from '../workflow/replyManagementValidation.js';

interface ReplyManagementLeadCardProps {
  lead: Lead;
  draft: ReplyFormDraft;
  onDraftChange: (draft: ReplyFormDraft) => void;
  onSave: () => void;
}

export function ReplyManagementLeadCard({
  lead,
  draft,
  onDraftChange,
  onSave,
}: ReplyManagementLeadCardProps) {
  const dirty = hasDraftChanges(lead, draft);
  const displayLead = { ...lead, replyStatus: draft.replyStatus };
  const rowTag = replyStatusLabel(draft.replyStatus);

  return (
    <article className={getReplyRowClass(displayLead)}>
      <header className="reply-card-header">
        <h4 className="reply-card-company">{lead.companyName}</h4>
        <span className={`reply-category-tag reply-tag-${draft.replyStatus}`}>{rowTag}</span>
        {draft.replyStatus === 'requested_report' && (
          <span className="reply-category-tag reply-tag-highlight">診断希望</span>
        )}
      </header>

      <div className="reply-form-grid">
        <label className="reply-field">
          <span className="reply-field-label">返信状態</span>
          <select
            value={draft.replyStatus}
            onChange={(e) =>
              onDraftChange(applyReplyStatusToDraft(draft, e.target.value as ReplyFormDraft['replyStatus']))
            }
          >
            {REPLY_MANAGEMENT_UI_STATUSES.map((status) => (
              <option key={status} value={status}>
                {replyStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>

        <label className="reply-field">
          <span className="reply-field-label">次アクション</span>
          <select
            value={draft.nextAction}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                nextAction: e.target.value,
                nextActionManual: true,
              })
            }
          >
            {NEXT_ACTION_OPTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>

        <label className="reply-field">
          <span className="reply-field-label">返信日時</span>
          <input
            type="datetime-local"
            value={draft.repliedAtLocal}
            onChange={(e) => onDraftChange({ ...draft, repliedAtLocal: e.target.value })}
            disabled={draft.replyStatus === 'none'}
          />
        </label>

        <label className="reply-field">
          <span className="reply-field-label">フォロー予定日</span>
          <input
            type="date"
            value={draft.followUpDueAt}
            onChange={(e) => onDraftChange({ ...draft, followUpDueAt: e.target.value })}
          />
        </label>

        <label className="reply-field reply-field-wide">
          <span className="reply-field-label">返信要約（短いメモ）</span>
          <textarea
            rows={2}
            maxLength={REPLY_SUMMARY_MAX_LENGTH}
            placeholder="返信内容の要約のみ（本文は保存しません）"
            value={draft.replySummary}
            onChange={(e) => onDraftChange({ ...draft, replySummary: e.target.value })}
          />
          <span className="reply-field-hint">
            {draft.replySummary.length}/{REPLY_SUMMARY_MAX_LENGTH} 文字
          </span>
        </label>
      </div>

      <div className="reply-card-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSave}
          disabled={!dirty}
        >
          変更を保存
        </button>
      </div>
    </article>
  );
}
