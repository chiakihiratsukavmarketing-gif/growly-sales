import { useEffect, useRef } from 'react';
import type { Lead } from '../../types/lead.js';
import { LeadStatusBadge } from './LeadStatusBadge.js';
import { LeadReviewActions } from './LeadReviewActions.js';
import { LeadCommunicationActions } from './LeadCommunicationActions.js';
import { leadListNextAction } from './leadDisplayUtils.js';
import { DevDetails } from './common/DevDetails.js';

function shortenUrl(url: string, maxLen = 36): string {
  const trimmed = url.trim();
  if (!trimmed) return '—';
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname === '/' ? '' : u.pathname;
    const short = `${host}${path}`;
    if (short.length <= maxLen) return short;
    return `${short.slice(0, maxLen - 1)}…`;
  } catch {
    if (trimmed.length <= maxLen) return trimmed;
    return `${trimmed.slice(0, maxLen - 1)}…`;
  }
}

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
      <a href={url} target="_blank" rel="noopener noreferrer" className="url-link" title={url}>
        {shortenUrl(url)}
      </a>
    </div>
  );
}

export function LeadDetailPanel({ lead, onUpdated, onError }: LeadDetailPanelProps) {
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [lead?.id]);

  if (!lead) {
    return (
      <aside className="detail-panel detail-panel-pane empty lead-detail-compact">
        <p>左の一覧から会社を選択してください。</p>
      </aside>
    );
  }

  return (
    <aside className="detail-panel detail-panel-pane lead-detail-compact" ref={scrollRef}>
      <div className="detail-panel-sticky">
        <header className="detail-header">
          <h2>{lead.companyName}</h2>
          <div className="badge-row">
            <LeadStatusBadge kind="score" value={lead.leadScore} />
            <LeadStatusBadge kind="human" value={lead.humanReviewStatus} />
            <LeadStatusBadge kind="send" value={lead.sendStatus ?? 'not_sent'} />
          </div>
          <p className="detail-next-action">
            次アクション: <strong>{leadListNextAction(lead)}</strong>
          </p>
        </header>
        <LeadReviewActions lead={lead} onUpdated={onUpdated} onError={onError} />
      </div>

      <section className="detail-section">
        <h3>基本情報</h3>
        <dl className="info-grid">
          <dt>地域</dt>
          <dd>{lead.area}</dd>
          <dt>業種</dt>
          <dd>{lead.industry}</dd>
          <dt>営業切り口</dt>
          <dd>{lead.salesAngle || '—'}</dd>
          <dt>連絡禁止</dt>
          <dd>{lead.doNotContact ? 'はい' : 'いいえ'}</dd>
        </dl>
      </section>

      <section className="detail-section">
        <h3>取得URL</h3>
        <UrlLink label="公式サイト" url={lead.websiteUrl} />
        <UrlLink label="Instagram" url={lead.instagramUrl} />
        <UrlLink label="問い合わせフォーム" url={lead.contactFormUrl} />
        <UrlLink label="採用ページ" url={lead.recruitUrl} />
        <UrlLink label="施工事例" url={lead.caseStudyUrl} />
        <UrlLink label="会社概要" url={lead.companyProfileUrl} />
      </section>

      <details className="detail-collapsible">
        <summary>企業分析</summary>
        <p className="text-block">{lead.companyAnalysis || '—'}</p>
      </details>

      <details className="detail-collapsible">
        <summary>個別フック</summary>
        <p className="text-block">{lead.customHook || '—'}</p>
      </details>

      <details className="detail-collapsible" open>
        <summary>営業メール</summary>
        <p className="field-label">件名</p>
        <p className="text-block">{lead.emailSubject || '—'}</p>
        <p className="field-label">本文</p>
        <pre className="email-preview">{lead.emailBody || '—'}</pre>
      </details>

      <section className="detail-section">
        <h3>校閲結果</h3>
        <dl className="info-grid">
          <dt>校閲</dt>
          <dd>
            <LeadStatusBadge kind="review" value={lead.reviewStatus} />
          </dd>
          <dt>コメント</dt>
          <dd>{lead.reviewComment || '—'}</dd>
        </dl>
      </section>

      {lead.doNotContact && (
        <section className="detail-section caution">
          <p>連絡禁止フラグが ON です。送信しないでください。</p>
        </section>
      )}

      <DevDetails title="詳細ステータス操作（上級者向け）">
        <LeadCommunicationActions lead={lead} onUpdated={onUpdated} onError={onError} />
      </DevDetails>
    </aside>
  );
}
