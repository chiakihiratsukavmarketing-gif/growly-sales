import type { CreateGmailDraftForLeadResult } from '../workflow/createGmailDraftForLead.js';
import { InfoBanner } from './InfoBanner.js';
import { SectionCard } from './SectionCard.js';

interface GmailDraftCreateResultPanelProps {
  result: CreateGmailDraftForLeadResult;
  onGoToSendRecords: () => void;
  onDismiss: () => void;
}

export function GmailDraftCreateResultPanel({
  result,
  onGoToSendRecords,
  onDismiss,
}: GmailDraftCreateResultPanelProps) {
  return (
    <SectionCard
      title={result.ok ? 'Gmail下書き作成成功' : 'Gmail下書き作成失敗'}
      className="gmail-draft-result-panel"
    >
      <InfoBanner variant={result.ok ? 'success' : 'danger'}>{result.message}</InfoBanner>

      {result.draftId && (
        <p className="hint">
          draftId: <span className="mono-cell">{result.draftId}</span> / 会社名:{' '}
          {result.lead.companyName}
        </p>
      )}

      {result.draftDeleted && (
        <p className="hint warning-text">検証失敗のため Gmail 上の下書きは削除しました。</p>
      )}

      <h4 className="subheading">MIME検証結果</h4>
      <ul className="mime-check-list">
        {result.mimeVerification.checks.map((check) => (
          <li key={check.id} className={check.ok ? 'mime-ok' : 'mime-ng'}>
            {check.ok ? '✓' : '✗'} {check.label}
          </li>
        ))}
      </ul>
      {result.mimeVerification.errors.length > 0 && (
        <ul className="error-list">
          {result.mimeVerification.errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}

      {result.ok ? (
        <>
          <InfoBanner variant="success">
            <strong>次のステップ:</strong> Gmail アプリで下書きを開き、内容を確認してから<strong>手動で送信</strong>してください。Growly Sales からの自動送信はありません。
          </InfoBanner>
          <p className="hint success-text">
            送信が完了したら「送信記録」タブで「手動送信済みに記録」を押してください。
          </p>
          <div className="result-actions">
            <button type="button" className="btn btn-primary" onClick={onGoToSendRecords}>
              送信記録タブへ移動（記録待ちを表示）
            </button>
            <button type="button" className="btn btn-secondary" onClick={onDismiss}>
              閉じる
            </button>
          </div>
        </>
      ) : (
        <div className="result-actions">
          <button type="button" className="btn btn-secondary" onClick={onDismiss}>
            閉じる
          </button>
        </div>
      )}
    </SectionCard>
  );
}
