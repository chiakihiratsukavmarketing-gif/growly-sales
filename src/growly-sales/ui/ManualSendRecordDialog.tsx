import type { ManualGmailSendPreview } from '../workflow/recordManualGmailSent.js';
import { EmailSourceConfirmBlock } from './EmailSourceDisplay.js';
import { CollectionProfileDisplay } from './CollectionProfileDisplay.js';

interface ManualSendRecordDialogProps {
  preview: ManualGmailSendPreview;
  recording: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ManualSendRecordDialog({
  preview,
  recording,
  onConfirm,
  onCancel,
}: ManualSendRecordDialogProps) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-dialog manual-send-record-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-send-record-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="manual-send-record-title" className="modal-title">
          手動送信済みに記録
        </h3>
        <p className="modal-lead">
          Gmail で送信済みであることを確認してください。Growly Sales からメールは送信しません。
        </p>
        <dl className="confirm-dl">
          <div className="confirm-row">
            <dt>会社名</dt>
            <dd>{preview.companyName}</dd>
          </div>
          <div className="confirm-row">
            <dt>To</dt>
            <dd>{preview.to}</dd>
          </div>
          <div className="confirm-row">
            <dt>From</dt>
            <dd>{preview.from}</dd>
          </div>
          <div className="confirm-row">
            <dt>Reply-To</dt>
            <dd>{preview.replyTo}</dd>
          </div>
          <div className="confirm-row">
            <dt>draftId</dt>
            <dd className="mono-cell">{preview.draftId}</dd>
          </div>
          <div className="confirm-row">
            <dt>件名</dt>
            <dd>{preview.subject}</dd>
          </div>
        </dl>
        <EmailSourceConfirmBlock
          info={{
            email: preview.to,
            emailSourceUrl: preview.emailSourceUrl,
            emailSourceLabel: preview.emailSourceLabel,
            sourcePageType: 'unknown',
            officialSiteUrl: preview.officialSiteUrl,
            isOfficialSiteOrigin: preview.isOfficialSiteOrigin,
            isPlaceholderEmail: preview.isPlaceholderEmail,
            isPersonalEmail: preview.isPersonalEmail,
            checkedUrls: preview.emailSourceUrl ? [preview.emailSourceUrl] : [],
            batchId: preview.batchId,
            source: preview.source,
          }}
        />
        <CollectionProfileDisplay
          info={preview.collectionProfile}
          variant="compact"
          emailSourceInfo={{
            email: preview.to,
            emailSourceUrl: preview.emailSourceUrl,
            emailSourceLabel: preview.emailSourceLabel,
            sourcePageType: 'unknown',
            officialSiteUrl: preview.officialSiteUrl,
            isOfficialSiteOrigin: preview.isOfficialSiteOrigin,
            isPlaceholderEmail: preview.isPlaceholderEmail,
            isPersonalEmail: preview.isPersonalEmail,
            checkedUrls: preview.emailSourceUrl ? [preview.emailSourceUrl] : [],
            batchId: preview.batchId,
            source: preview.source,
          }}
          showEmailSource={Boolean(preview.to) && preview.discoverySource === 'job_site_reference'}
        />
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={recording}>
            キャンセル
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={recording}>
            {recording ? '記録中…' : '記録する'}
          </button>
        </div>
      </div>
    </div>
  );
}
