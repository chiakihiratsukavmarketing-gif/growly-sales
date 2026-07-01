import type { GmailDraftCandidateDetail } from './gmailDraftCandidatesApi.js';
import { EmailSourceConfirmBlock, emailSourceInfoFromOutreachView } from './EmailSourceDisplay.js';
import { CollectionProfileDisplay } from './CollectionProfileDisplay.js';

interface GmailDraftCreateDialogProps {
  candidate: GmailDraftCandidateDetail;
  creating: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function GmailDraftCreateDialog({
  candidate,
  creating,
  onConfirm,
  onCancel,
}: GmailDraftCreateDialogProps) {
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
          Gmail下書きを作成する
        </h3>
        <p className="modal-lead">
          承認済みの下書き候補について、Gmail下書きを作成します。これは送信ではありません。
          Gmail送信は人間がGmail画面で手動で行います。実行しますか？
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
        </dl>

        <EmailSourceConfirmBlock info={emailSourceInfoFromOutreachView({ ...candidate, to: candidate.to })} />

        <CollectionProfileDisplay
          info={candidate.collectionProfile}
          variant="compact"
          emailSourceInfo={emailSourceInfoFromOutreachView({ ...candidate, to: candidate.to })}
          showEmailSource={Boolean(candidate.to) && candidate.discoverySource === 'job_site_reference'}
        />

        <dl className="confirm-dl">
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

        <ul className="human-gate-safety-list hint-list">
          <li>Gmail下書きのみ作成します（users.drafts.create）</li>
          <li>自動送信は行いません</li>
          <li>messages.send は使いません</li>
          <li>対象件数: 1 件</li>
          <li>From / Reply-To は {candidate.fromEmail} を確認</li>
        </ul>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={creating}>
            キャンセル
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={creating || !candidate.canCreate}
          >
            {creating ? '作成中…' : 'Gmail下書きを作成する'}
          </button>
        </div>
      </div>
    </div>
  );
}
