import type { GmailDraftCandidateDetail } from './gmailDraftCandidatesApi.js';
import { CREATE_DRAFTS_GATE_LABEL } from './gmailDraftCandidatesApi.js';

interface GmailDraftCreateDialogProps {
  candidate: GmailDraftCandidateDetail;
  gateInput: string;
  creating: boolean;
  onGateInputChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function GmailDraftCreateDialog({
  candidate,
  gateInput,
  creating,
  onGateInputChange,
  onConfirm,
  onCancel,
}: GmailDraftCreateDialogProps) {
  const gateOk = gateInput.trim() === CREATE_DRAFTS_GATE_LABEL;

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-dialog gmail-draft-create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gmail-draft-create-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="gmail-draft-create-title" className="modal-title">
          Gmail下書きを作成
        </h3>
        <p className="modal-lead">
          users.drafts.create のみ実行します。<strong>メール送信はされません。</strong>
        </p>

        <dl className="confirm-dl">
          <div className="confirm-row">
            <dt>会社名</dt>
            <dd>{candidate.companyName}</dd>
          </div>
          <div className="confirm-row">
            <dt>To</dt>
            <dd>{candidate.to}</dd>
          </div>
          <div className="confirm-row">
            <dt>From</dt>
            <dd>
              {candidate.fromDisplayName} &lt;{candidate.fromEmail}&gt;
            </dd>
          </div>
          <div className="confirm-row">
            <dt>Reply-To</dt>
            <dd>{candidate.replyToEmail}</dd>
          </div>
          <div className="confirm-row">
            <dt>署名Email</dt>
            <dd>{candidate.signatureEmail}</dd>
          </div>
          <div className="confirm-row">
            <dt>件名</dt>
            <dd>{candidate.subject}</dd>
          </div>
          <div className="confirm-row">
            <dt>customHook</dt>
            <dd>{candidate.customHook || '—'}</dd>
          </div>
        </dl>

        <div className="draft-body-preview">
          <p className="preview-label">本文プレビュー</p>
          <pre className="email-body-preview">{candidate.emailBodyPreview}</pre>
        </div>

        <label className="gate-field">
          <span className="gate-label">
            確認のため <code>{CREATE_DRAFTS_GATE_LABEL}</code> と入力してください
          </span>
          <input
            type="text"
            value={gateInput}
            onChange={(e) => onGateInputChange(e.target.value)}
            placeholder={CREATE_DRAFTS_GATE_LABEL}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={creating}>
            キャンセル
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={creating || !gateOk || !candidate.canCreate}
          >
            {creating ? '作成中…' : '下書きを作成'}
          </button>
        </div>
      </div>
    </div>
  );
}
