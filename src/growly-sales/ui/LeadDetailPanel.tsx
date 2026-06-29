import type { Lead } from '../../types/lead.js';
import { LeadStatusBadge } from './LeadStatusBadge.js';
import { LeadReviewActions } from './LeadReviewActions.js';
import { LeadCommunicationActions } from './LeadCommunicationActions.js';

interface LeadDetailPanelProps {
  lead: Lead | null;
  onUpdated: (lead: Lead) => void;
  onError: (message: string) => void;
}

function UrlLink({ label, url }: { label: string; url: string | null }) {
  if (!url) {
    return (
      <div className="url-row">
        <span className="url-label">{label}</span>
        <span className="url-missing">なし</span>
      </div>
    );
  }
  return (
    <div className="url-row">
      <span className="url-label">{label}</span>
      <a href={url} target="_blank" rel="noopener noreferrer" className="url-link">
        {url}
      </a>
    </div>
  );
}

export function LeadDetailPanel({ lead, onUpdated, onError }: LeadDetailPanelProps) {
  if (!lead) {
    return (
      <aside className="detail-panel empty">
        <p>左の一覧からリードを選択してください。</p>
      </aside>
    );
  }

  return (
    <aside className="detail-panel">
      <header className="detail-header">
        <h2>{lead.companyName}</h2>
        <div className="badge-row">
          <LeadStatusBadge kind="score" value={lead.leadScore} />
          <LeadStatusBadge kind="review" value={lead.reviewStatus} />
          <LeadStatusBadge kind="human" value={lead.humanReviewStatus} />
          <LeadStatusBadge kind="send" value={lead.sendStatus} />
          <LeadStatusBadge kind="risk" value={lead.riskLevel} />
        </div>
      </header>

      <section className="detail-section">
        <h3>企業基本情報</h3>
        <dl className="info-grid">
          <dt>地域</dt>
          <dd>{lead.area}</dd>
          <dt>業種</dt>
          <dd>{lead.industry}</dd>
          <dt>営業切り口</dt>
          <dd>{lead.salesAngle || '—'}</dd>
          <dt>leadScore</dt>
          <dd>{lead.leadScore}</dd>
          <dt>doNotContact</dt>
          <dd>{lead.doNotContact ? 'はい（連絡禁止）' : 'いいえ'}</dd>
        </dl>
      </section>

      <section className="detail-section">
        <h3>取得URL一覧</h3>
        <UrlLink label="公式サイト" url={lead.websiteUrl} />
        <UrlLink label="Instagram" url={lead.instagramUrl} />
        <UrlLink label="問い合わせフォーム" url={lead.contactFormUrl} />
        <UrlLink label="採用ページ" url={lead.recruitUrl} />
        <UrlLink label="施工事例" url={lead.caseStudyUrl} />
        <UrlLink label="会社概要" url={lead.companyProfileUrl} />
      </section>

      <section className="detail-section">
        <h3>企業分析文</h3>
        <p className="text-block">{lead.companyAnalysis || '—'}</p>
      </section>

      <section className="detail-section">
        <h3>個別フック</h3>
        <p className="text-block">{lead.customHook || '—'}</p>
      </section>

      <section className="detail-section">
        <h3>営業メール（確認用）</h3>
        <p className="field-label">件名</p>
        <p className="text-block">{lead.emailSubject || '—'}</p>
        <p className="field-label">本文</p>
        <pre className="email-preview">{lead.emailBody || '—'}</pre>
      </section>

      <section className="detail-section">
        <h3>校閲結果</h3>
        <dl className="info-grid">
          <dt>reviewStatus</dt>
          <dd>
            <LeadStatusBadge kind="review" value={lead.reviewStatus} />
          </dd>
          <dt>reviewComment</dt>
          <dd>{lead.reviewComment || '—'}</dd>
        </dl>
      </section>

      <section className="detail-section">
        <h3>次アクション</h3>
        <p className="text-block">{lead.nextAction || '—'}</p>
      </section>

      <section className="detail-section caution">
        <h3>注意点</h3>
        <ul>
          {lead.doNotContact && <li>連絡禁止フラグがONです。送信しないでください。</li>}
          {lead.sendStatus === 'blocked' && <li>sendStatus=blocked — 送信対象外です。</li>}
          {lead.riskLevel === 'high' && <li>リスクレベルが高いです。慎重に確認してください。</li>}
          {lead.humanReviewStatus === 'approved' && lead.sendStatus === 'not_sent' && (
            <li>承認済みですが未送信です。Gmail下書きは CLI（gmail-preview / gmail-create-drafts）で作成できます（送信なし）。</li>
          )}
          {!lead.doNotContact && lead.sendStatus !== 'blocked' && lead.riskLevel !== 'high' && (
            <li>自動送信は行いません。人間の確認・承認後のみ次工程へ進めます。</li>
          )}
        </ul>
      </section>

      <LeadReviewActions lead={lead} onUpdated={onUpdated} onError={onError} />

      <LeadCommunicationActions lead={lead} onUpdated={onUpdated} onError={onError} />
    </aside>
  );
}
