import type { GmailDraftCandidateDetail } from './gmailDraftCandidatesApi.js';
import { EmailSourceConfirmBlock, emailSourceInfoFromOutreachView } from './EmailSourceDisplay.js';
import { CollectionProfileDisplay } from './CollectionProfileDisplay.js';

interface ApproveDraftDialogProps {
  candidate: GmailDraftCandidateDetail;
  approving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ApproveDraftDialog({
  candidate,
  approving,
  onConfirm,
  onCancel,
}: ApproveDraftDialogProps) {
  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-dialog" role="dialog" aria-labelledby="approve-draft-title">
        <h3 id="approve-draft-title">内容確認・承認</h3>
        <p>
          <strong>{candidate.companyName}</strong> の営業メール内容を確認し、Gmail下書き作成候補として承認します。
        </p>
        <EmailSourceConfirmBlock
          info={emailSourceInfoFromOutreachView({ ...candidate, to: candidate.to || candidate.email })}
        />
        <CollectionProfileDisplay
          info={candidate.collectionProfile}
          variant="compact"
          emailSourceInfo={emailSourceInfoFromOutreachView({ ...candidate, to: candidate.to || candidate.email })}
          showEmailSource={Boolean(candidate.to || candidate.email) && candidate.discoverySource === 'job_site_reference'}
        />
        <ul className="policy-list compact">
          <li>承認は下書き作成の許可であり、<strong>送信ではありません</strong></li>
          <li>承認後は「Gmail下書きを作成する」ボタンで確認のうえ下書きを作成します</li>
          <li>承認内容は communicationMemo に記録されます</li>
        </ul>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={approving}
            onClick={onConfirm}
          >
            {approving ? '承認中…' : '承認する'}
          </button>
          <button type="button" className="btn btn-secondary" disabled={approving} onClick={onCancel}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
