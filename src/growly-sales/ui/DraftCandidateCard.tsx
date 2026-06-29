import type { UiDraftCandidate } from './draftCandidatesApi.js';
import { CopyButton, formatSubjectBodyCopy } from './CopyButton.js';
import { LeadStatusBadge } from './LeadStatusBadge.js';

interface DraftCandidateCardProps {
  candidate: UiDraftCandidate;
  onCopyError: (message: string) => void;
}

function contactDisplay(candidate: UiDraftCandidate): string {
  if (candidate.contactFormUrl?.trim()) return candidate.contactFormUrl;
  if (candidate.emailCandidates.length > 0) return candidate.emailCandidates.join('; ');
  return '—';
}

export function DraftCandidateCard({ candidate, onCopyError }: DraftCandidateCardProps) {
  const contactUrl = contactDisplay(candidate);
  const combinedCopy = formatSubjectBodyCopy(
    candidate.emailSubject,
    candidate.emailBody,
    candidate.contactFormUrl,
    candidate.emailCandidates
  );

  const displayDate = candidate.exportedAt || candidate.updatedAt;

  return (
    <article className="draft-card">
      <header className="draft-card-header">
        <div>
          <h3 className="draft-card-title">{candidate.companyName}</h3>
          <p className="draft-card-meta">
            {candidate.area} / {candidate.industry}
          </p>
        </div>
        <div className="badge-row">
          <LeadStatusBadge kind="score" value={candidate.leadScore} />
          <LeadStatusBadge kind="human" value={candidate.humanReviewStatus} />
          <LeadStatusBadge kind="send" value={candidate.sendStatus} />
        </div>
      </header>

      <p className="draft-card-safety">
        sendStatus: {candidate.sendStatus} · humanReviewStatus: approved · 自動送信なし · Gmail下書き作成は送信ではありません
      </p>

      <dl className="draft-card-grid draft-gmail-status">
        <dt>Gmail下書き</dt>
        <dd>
          <span className="badge badge-muted">{candidate.gmailDraftStatus}</span>
          {candidate.gmailDraftCreatedAt && (
            <span className="draft-meta-inline">
              {' '}
              作成: {new Date(candidate.gmailDraftCreatedAt).toLocaleString('ja-JP')}
            </span>
          )}
        </dd>
        {candidate.gmailDraftId && (
          <>
            <dt>gmailDraftId</dt>
            <dd className="mono-text">{candidate.gmailDraftId}</dd>
          </>
        )}
        {candidate.gmailDraftError && (
          <>
            <dt>エラー</dt>
            <dd className="text-error">{candidate.gmailDraftError}</dd>
          </>
        )}
        {candidate.emailCandidates.length === 0 && (
          <>
            <dt>Gmail対象</dt>
            <dd>対象外（emailCandidatesなし・フォームコピー運用）</dd>
          </>
        )}
      </dl>

      <dl className="draft-card-grid">
        <dt>営業切り口</dt>
        <dd>{candidate.salesAngle || '—'}</dd>
        <dt>問い合わせ</dt>
        <dd>
          {candidate.contactFormUrl ? (
            <a href={candidate.contactFormUrl} target="_blank" rel="noopener noreferrer">
              {candidate.contactFormUrl}
            </a>
          ) : (
            candidate.emailCandidates.join('; ') || '—'
          )}
        </dd>
        <dt>更新日時</dt>
        <dd>{displayDate ? new Date(displayDate).toLocaleString('ja-JP') : '—'}</dd>
        <dt>校閲コメント</dt>
        <dd>{candidate.reviewComment || '—'}</dd>
      </dl>

      <div className="draft-card-email">
        <p className="field-label">件名</p>
        <p className="text-block">{candidate.emailSubject}</p>
        <p className="field-label">本文</p>
        <pre className="email-preview">{candidate.emailBody}</pre>
      </div>

      <div className="draft-card-sources">
        <p className="field-label">取得元URL</p>
        <ul className="source-url-list">
          {candidate.sourceUrls.map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noopener noreferrer">
                {url}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="draft-card-actions">
        <CopyButton label="件名をコピー" text={candidate.emailSubject} onError={onCopyError} />
        <CopyButton label="本文をコピー" text={candidate.emailBody} onError={onCopyError} />
        <CopyButton
          label="件名＋本文をコピー"
          text={combinedCopy}
          onError={onCopyError}
          variant="primary"
        />
        <CopyButton label="問い合わせURLをコピー" text={contactUrl} onError={onCopyError} />
      </div>
    </article>
  );
}
