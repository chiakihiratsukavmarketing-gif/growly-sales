import type { CollectionProfileDisplayInfo } from '../candidates/resolveCollectionProfileDisplay.js';
import { shortenDisplayUrl } from '../candidates/resolveCollectionProfileDisplay.js';
import type { EmailSourceDisplayInfo } from '../candidates/resolveEmailSourceDisplay.js';
import { EmailSourceDisplay, EmailSourceWarnings } from './EmailSourceDisplay.js';
import { DevDetails } from './common/DevDetails.js';

interface CollectionProfileDisplayProps {
  info: CollectionProfileDisplayInfo;
  variant?: 'compact' | 'detail' | 'send-record';
  emailSourceInfo?: EmailSourceDisplayInfo | null;
  /** @deprecated send-record variant always shows URL rows when emailSourceInfo is provided */
  showEmailSource?: boolean;
  showEmailWarnings?: boolean;
}

function UrlRow({
  label,
  url,
  emptyLabel = 'なし',
  className = 'collection-profile-url-row',
}: {
  label: string;
  url: string | null;
  emptyLabel?: string;
  className?: string;
}) {
  if (!url) {
    return (
      <div className={className}>
        <span className="collection-profile-label">{label}</span>
        <span className="hint send-record-url-missing">{emptyLabel}</span>
      </div>
    );
  }
  return (
    <div className={className}>
      <span className="collection-profile-label">{label}</span>
      <a href={url} target="_blank" rel="noopener noreferrer" className="url-link" title={url}>
        {shortenDisplayUrl(url)}
      </a>
    </div>
  );
}

function EmailSourceWarningsBlock({ info }: { info: EmailSourceDisplayInfo }) {
  return <EmailSourceWarnings info={info} />;
}

export function CollectionProfileDisplay({
  info,
  variant = 'compact',
  emailSourceInfo = null,
  showEmailSource = false,
  showEmailWarnings = false,
}: CollectionProfileDisplayProps) {
  if (variant === 'send-record') {
    const methodLabel = info.discoverySourceLabel?.trim() || '—';
    const discoveryUrl = info.discoverySourceUrl?.trim() || null;
    const officialSiteUrl = emailSourceInfo?.officialSiteUrl?.trim() || null;
    const emailSourceUrl = emailSourceInfo?.emailSourceUrl?.trim() || null;
    const metaParts = [info.prefecture || null, info.collectionProfileName || null].filter(Boolean);

    return (
      <div className="send-record-source-block" aria-label="収集元情報">
        <div className="send-record-source-url-list">
          <div className="send-record-source-method-row">
            <span className="send-record-source-label">収集方法</span>
            <strong className="send-record-source-value" title={methodLabel}>
              {methodLabel}
            </strong>
          </div>
          {metaParts.length > 0 ? (
            <div className="send-record-source-meta">{metaParts.join(' · ')}</div>
          ) : null}
          <UrlRow
            label="企業の発見元URL"
            url={discoveryUrl}
            emptyLabel="URL未記録"
            className="send-record-source-url-row"
          />
          <UrlRow
            label="公式サイト"
            url={officialSiteUrl}
            emptyLabel="URL未記録"
            className="send-record-source-url-row"
          />
          <UrlRow
            label="メール取得元"
            url={emailSourceUrl}
            emptyLabel="URL未記録"
            className="send-record-source-url-row"
          />
        </div>
        {showEmailWarnings && emailSourceInfo ? (
          <div className="send-record-email-warnings">
            <EmailSourceWarningsBlock info={emailSourceInfo} />
          </div>
        ) : null}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="collection-profile-compact">
        <div className="collection-profile-compact-line">
          <span className="collection-profile-label">収集元</span>
          <span>{info.discoverySourceLabel}</span>
        </div>
        <div className="collection-profile-compact-line">
          <span className="collection-profile-label">エリア</span>
          <span>{info.prefecture}</span>
        </div>
        <div className="collection-profile-compact-line">
          <span className="collection-profile-label">方針</span>
          <span>{info.collectionProfileName}</span>
        </div>
        {info.discoverySource === 'job_site_reference' && info.discoverySourceUrl ? (
          <UrlRow label="発見元" url={info.discoverySourceUrl} />
        ) : null}
        {showEmailSource && emailSourceInfo ? (
          <EmailSourceDisplay
            info={emailSourceInfo}
            variant="under-email"
            showWarnings
            className="collection-profile-email-source"
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="collection-profile-detail">
      <dl className="info-grid collection-profile-grid">
        <dt>収集プロファイル</dt>
        <dd>{info.collectionProfileName}</dd>
        <dt>収集モード</dt>
        <dd>{info.collectionModeLabel}</dd>
        <dt>エリア戦略</dt>
        <dd>{info.areaStrategyLabel}</dd>
        <dt>都道府県</dt>
        <dd>{info.prefecture}</dd>
        <dt>収集元</dt>
        <dd>{info.discoverySourceLabel}</dd>
        <dt>求人サイト</dt>
        <dd>{info.discoverySourceSiteLabel}</dd>
        <dt>安全確認</dt>
        <dd>{info.complianceLabel}</dd>
      </dl>
      <UrlRow label="発見元" url={info.discoverySourceUrl} />
      {showEmailSource && emailSourceInfo ? (
        <div className="collection-profile-email-block">
          <p className="field-label">メール取得元</p>
          <EmailSourceDisplay info={emailSourceInfo} variant="full" showEmail showOfficialSite showWarnings />
        </div>
      ) : null}
      <DevDetails title="収集プロファイル raw（開発者向け）">
        <pre className="dev-json-block">{JSON.stringify(info, null, 2)}</pre>
      </DevDetails>
    </div>
  );
}
