import type { EmailSourceDisplayInfo } from '../candidates/resolveEmailSourceDisplay.js';
import { shortenEmailSourceUrl } from '../candidates/resolveEmailSourceDisplay.js';
import type { EmailOutreachCandidateView } from '../outreach/outreachPolicy.js';

interface EmailSourceDisplayProps {
  info: EmailSourceDisplayInfo;
  variant?: 'compact' | 'full' | 'inline' | 'under-email';
  showEmail?: boolean;
  showOfficialSite?: boolean;
  showWarnings?: boolean;
  className?: string;
}

function EmailSourceLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="email-source-link"
      title={url}
    >
      {shortenEmailSourceUrl(url)}
    </a>
  );
}

export function EmailSourceWarnings({ info }: { info: EmailSourceDisplayInfo }) {
  const warnings: string[] = [];
  if (info.isPlaceholderEmail) {
    warnings.push('メール不正の可能性あり');
  }
  if (info.isPersonalEmail) {
    warnings.push('個人メールの可能性');
  }
  if (!info.emailSourceConfirmed) {
    warnings.push(
      'メール取得元URLが未確認です。送信前に公式サイト上で宛先を確認してください。'
    );
  } else if (!info.isOfficialSiteOrigin && info.emailSourceUrl) {
    warnings.push('公式サイト以外のページから取得');
  }

  if (warnings.length === 0) return null;

  return (
    <ul className="email-source-warnings">
      {warnings.map((w) => (
        <li
          key={w}
          className={`email-source-warning ${
            w.includes('メール不正') || w.includes('個人メール')
              ? 'email-source-warning-danger'
              : ''
          }`}
        >
          {w}
        </li>
      ))}
    </ul>
  );
}

function EmailSourceHeadRow({
  displayLabel,
  confirmed,
}: {
  displayLabel: string;
  confirmed: boolean;
}) {
  return (
    <div className="email-source-head-row">
      <span className="email-source-label">メール取得元</span>
      <span className={`email-source-type-inline ${confirmed ? '' : 'email-source-missing'}`}>
        {displayLabel}
      </span>
    </div>
  );
}

export function EmailSourceDisplay({
  info,
  variant = 'compact',
  showEmail = false,
  showOfficialSite = false,
  showWarnings = false,
  className = '',
}: EmailSourceDisplayProps) {
  if (!info.email && !info.emailSourceUrl && !info.officialSiteUrl) return null;

  const displayLabel =
    variant === 'compact' || variant === 'under-email'
      ? info.emailSourceCompactLabel
      : info.emailSourceLabel;
  const confirmed = info.emailSourceConfirmed && Boolean(info.emailSourceUrl);

  if (variant === 'inline') {
    return (
      <span className={`email-source-inline ${className}`.trim()}>
        <span className="email-source-inline-label">メール取得元:</span>{' '}
        {confirmed ? (
          <>
            <span className="email-source-type-inline">{displayLabel}</span>{' '}
            <EmailSourceLink url={info.emailSourceUrl!} />
          </>
        ) : (
          <span className="email-source-missing">未確認</span>
        )}
      </span>
    );
  }

  if (variant === 'under-email') {
    return (
      <div className={`email-source-under-email ${className}`.trim()}>
        <EmailSourceHeadRow displayLabel={confirmed ? displayLabel : '未確認'} confirmed={confirmed} />
        {confirmed ? (
          <EmailSourceLink url={info.emailSourceUrl!} />
        ) : info.officialSiteUrl ? (
          <span className="email-source-subhint">公式サイトURLのみ確認済み</span>
        ) : null}
        {showWarnings ? <EmailSourceWarnings info={info} /> : null}
      </div>
    );
  }

  return (
    <div className={`email-source-display email-source-${variant} ${className}`.trim()}>
      {showEmail && info.email ? (
        <div className="email-source-row email-source-row-email">
          <span className="email-source-label">メール</span>
          <span className="email-source-value" title={info.email}>
            {info.email}
          </span>
        </div>
      ) : null}
      <div className="email-source-block">
        <EmailSourceHeadRow displayLabel={confirmed ? displayLabel : '未確認'} confirmed={confirmed} />
        {confirmed ? (
          <EmailSourceLink url={info.emailSourceUrl!} />
        ) : info.officialSiteUrl ? (
          <span className="email-source-subhint">公式サイトURLのみ確認済み</span>
        ) : null}
      </div>
      {showOfficialSite && info.officialSiteUrl ? (
        <div className="email-source-row email-source-row-site">
          <span className="email-source-label">公式サイト</span>
          <span className="email-source-value">
            <EmailSourceLink url={info.officialSiteUrl} />
          </span>
        </div>
      ) : null}
      {showWarnings ? <EmailSourceWarnings info={info} /> : null}
    </div>
  );
}

export function emailSourceInfoFromOutreachView(
  view: EmailOutreachCandidateView & { to?: string }
): EmailSourceDisplayInfo {
  return {
    email: view.to?.trim() || view.email,
    emailSourceUrl: view.emailSourceUrl,
    emailSourceLabel: view.emailSourceLabel,
    emailSourceCompactLabel: view.emailSourceCompactLabel,
    sourcePageType: view.sourcePageType,
    officialSiteUrl: view.officialSiteUrl ?? (view.websiteUrl || null),
    isOfficialSiteOrigin: view.isOfficialSiteOrigin,
    emailSourceConfirmed: view.emailSourceConfirmed,
    isPlaceholderEmail: view.isPlaceholderEmail,
    isPersonalEmail: view.isPersonalEmail,
    checkedUrls: view.emailCandidateSourceUrls,
    batchId: view.batchId,
    source: view.source,
  };
}

export function EmailSourceConfirmBlock({ info }: { info: EmailSourceDisplayInfo }) {
  return (
    <div className="email-source-confirm-block">
      <EmailSourceDisplay
        info={info}
        variant="full"
        showEmail
        showOfficialSite
        showWarnings
      />
    </div>
  );
}
