import type { GmailDraftCandidateDetail } from './gmailDraftCandidatesApi.js';
import { EmailSourceConfirmBlock } from './EmailSourceDisplay.js';

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
          info={{
            email: candidate.to || candidate.email,
            emailSourceUrl: candidate.emailSourceUrl,
            emailSourceLabel: candidate.emailSourceLabel,
            sourcePageType: candidate.sourcePageType,
            officialSiteUrl: candidate.officialSiteUrl ?? (candidate.websiteUrl || null),
            isOfficialSiteOrigin: candidate.isOfficialSiteOrigin,
            isPlaceholderEmail: candidate.isPlaceholderEmail,
            isPersonalEmail: candidate.isPersonalEmail,
            checkedUrls: candidate.emailCandidateSourceUrls,
            batchId: candidate.batchId,
            source: candidate.source,
          }}
        />
        <ul className="policy-list compact">
          <li>承認は下書き作成の許可であり、<strong>送信ではありません</strong></li>
          <li>承認後も CREATE_DRAFTS の明示入力が必要です</li>
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
