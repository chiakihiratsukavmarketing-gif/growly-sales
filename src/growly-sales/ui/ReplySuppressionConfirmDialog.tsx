import type { Lead } from '../../types/lead.js';
import { maskEmailForDisplay } from '../mail-operations/emailDisplayPrivacy.js';

interface ReplySuppressionConfirmDialogProps {
  lead: Lead;
  reason: string;
  confirmToken: string;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onConfirmTokenChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ReplySuppressionConfirmDialog({
  lead,
  reason,
  confirmToken,
  busy,
  onReasonChange,
  onConfirmTokenChange,
  onConfirm,
  onCancel,
}: ReplySuppressionConfirmDialogProps) {
  const primaryEmail = lead.emailCandidates[0]?.trim() ?? '';
  const maskedEmail = maskEmailForDisplay(primaryEmail) ?? '（メール未取得）';

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-dialog reply-suppression-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reply-suppression-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="reply-suppression-confirm-title" className="modal-title">
          配信禁止に登録
        </h3>
        <p className="modal-lead">
          {lead.companyName} の宛先を配信禁止リスト（suppression 正本）に登録します。以後、営業文生成・Gmail
          下書き・フォローがブロックされます。Gmail 送信は行いません。
        </p>
        <dl className="confirm-dl">
          <div className="confirm-row">
            <dt>対象（マスク表示）</dt>
            <dd>{maskedEmail}</dd>
          </div>
        </dl>
        <label className="reply-field reply-field-wide">
          <span className="reply-field-label">理由（必須）</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="返信による停止希望"
            disabled={busy}
          />
        </label>
        <label className="reply-field reply-field-wide">
          <span className="reply-field-label">確認トークン</span>
          <input
            type="text"
            value={confirmToken}
            onChange={(e) => onConfirmTokenChange(e.target.value)}
            placeholder="SUPPRESSION_REPLY_OPT_OUT"
            disabled={busy}
            autoComplete="off"
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            キャンセル
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? '登録中…' : '配信禁止に登録'}
          </button>
        </div>
      </div>
    </div>
  );
}

export const SUPPRESSION_REPLY_OPT_OUT_CONFIRM_TOKEN = 'SUPPRESSION_REPLY_OPT_OUT';
