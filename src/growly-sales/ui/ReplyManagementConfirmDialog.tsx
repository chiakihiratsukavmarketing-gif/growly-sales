import type { Lead } from '../../types/lead.js';
import type { ReplyFormDraft } from './replyManagementUiUtils.js';
import { formatReplySummaryPreview } from './replyManagementUiUtils.js';
import { replyStatusLabel } from '../workflow/replyManagementValidation.js';

interface ReplyManagementConfirmDialogProps {
  lead: Lead;
  draft: ReplyFormDraft;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ReplyManagementConfirmDialog({
  lead,
  draft,
  saving,
  onConfirm,
  onCancel,
}: ReplyManagementConfirmDialogProps) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-dialog reply-management-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reply-management-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="reply-management-confirm-title" className="modal-title">
          返信管理を保存
        </h3>
        <p className="modal-lead">
          {lead.companyName} の返信情報を更新します。Gmail送信は行いません。
        </p>
        <dl className="confirm-dl">
          <div className="confirm-row">
            <dt>返信状態</dt>
            <dd>{replyStatusLabel(draft.replyStatus)}</dd>
          </div>
          <div className="confirm-row">
            <dt>返信要約</dt>
            <dd>{formatReplySummaryPreview(draft.replySummary)}</dd>
          </div>
          <div className="confirm-row">
            <dt>返信日時</dt>
            <dd>{draft.repliedAtLocal || '（なし）'}</dd>
          </div>
          <div className="confirm-row">
            <dt>フォロー予定</dt>
            <dd>{draft.followUpDueAt || '（なし）'}</dd>
          </div>
          <div className="confirm-row">
            <dt>次アクション</dt>
            <dd>{draft.nextAction}</dd>
          </div>
        </dl>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            キャンセル
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={saving}>
            {saving ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  );
}
