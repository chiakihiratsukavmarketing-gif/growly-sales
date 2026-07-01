import type { EmailSourceDisplayInfo } from '../candidates/resolveEmailSourceDisplay.js';
import { shortenEmailSourceUrl } from '../candidates/resolveEmailSourceDisplay.js';

interface EmailSourceDisplayProps {
  info: EmailSourceDisplayInfo;
  /** compact: メール行の直下に取得先のみ。full: ラベル付きブロック */
  variant?: 'compact' | 'full' | 'inline';
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

function EmailSourceWarnings({ info }: { info: EmailSourceDisplayInfo }) {
  if (!info.isPlaceholderEmail && !info.isPersonalEmail && info.isOfficialSiteOrigin) {
    return null;
  }
  return (
    <ul className="email-source-warnings">
      {info.isPlaceholderEmail ? (
        <li className="email-source-warning email-source-warning-danger">プレースホルダメールの可能性</li>
      ) : null}
      {info.isPersonalEmail ? (
        <li className="email-source-warning email-source-warning-danger">個人メールの可能性</li>
      ) : null}
      {!info.isOfficialSiteOrigin && info.emailSourceUrl ? (
        <li className="email-source-warning">公式サイト以外のページから取得</li>
      ) : null}
      {!info.emailSourceUrl ? (
        <li className="email-source-warning">メール取得先URLが未記録</li>
      ) : null}
    </ul>
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
  if (!info.email && !info.emailSourceUrl) return null;

  if (variant === 'inline') {
    return (
      <span className={`email-source-inline ${className}`.trim()}>
        {info.emailSourceUrl ? (
          <>
            <span className="email-source-inline-label">取得先:</span>{' '}
            <EmailSourceLink url={info.emailSourceUrl} />
          </>
        ) : (
          <span className="email-source-missing">取得先未記録</span>
        )}
      </span>
    );
  }

  return (
    <div className={`email-source-display email-source-${variant} ${className}`.trim()}>
      {showEmail && info.email ? (
        <div className="email-source-row">
          <span className="email-source-label">メール</span>
          <span className="email-source-value" title={info.email}>
            {info.email}
          </span>
        </div>
      ) : null}
      <div className="email-source-row">
        <span className="email-source-label">取得先</span>
        <span className="email-source-value">
          {info.emailSourceUrl ? (
            <>
              <span className="email-source-page-label">{info.emailSourceLabel}</span>
              <EmailSourceLink url={info.emailSourceUrl} />
            </>
          ) : (
            <span className="email-source-missing">未記録</span>
          )}
        </span>
      </div>
      {showOfficialSite && info.officialSiteUrl ? (
        <div className="email-source-row">
          <span className="email-source-label">公式サイト</span>
          <span className="email-source-value">
            <EmailSourceLink url={info.officialSiteUrl} />
          </span>
        </div>
      ) : null}
      {showOfficialSite && info.emailSourceUrl ? (
        <div className="email-source-row">
          <span className="email-source-label">公式由来</span>
          <span className="email-source-value">
            {info.isOfficialSiteOrigin ? 'はい' : 'いいえ（要確認）'}
          </span>
        </div>
      ) : null}
      {showWarnings ? <EmailSourceWarnings info={info} /> : null}
    </div>
  );
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
