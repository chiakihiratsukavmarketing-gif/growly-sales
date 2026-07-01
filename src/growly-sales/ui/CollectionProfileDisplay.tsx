import type { CollectionProfileDisplayInfo } from '../candidates/resolveCollectionProfileDisplay.js';
import { shortenDisplayUrl } from '../candidates/resolveCollectionProfileDisplay.js';
import type { EmailSourceDisplayInfo } from '../candidates/resolveEmailSourceDisplay.js';
import { EmailSourceDisplay } from './EmailSourceDisplay.js';
import { DevDetails } from './common/DevDetails.js';

interface CollectionProfileDisplayProps {
  info: CollectionProfileDisplayInfo;
  variant?: 'compact' | 'detail';
  emailSourceInfo?: EmailSourceDisplayInfo | null;
  showEmailSource?: boolean;
}

function UrlRow({ label, url }: { label: string; url: string | null }) {
  if (!url) {
    return (
      <div className="collection-profile-url-row">
        <span className="collection-profile-label">{label}</span>
        <span className="hint">なし</span>
      </div>
    );
  }
  return (
    <div className="collection-profile-url-row">
      <span className="collection-profile-label">{label}</span>
      <a href={url} target="_blank" rel="noopener noreferrer" className="url-link" title={url}>
        {shortenDisplayUrl(url)}
      </a>
    </div>
  );
}

export function CollectionProfileDisplay({
  info,
  variant = 'compact',
  emailSourceInfo = null,
  showEmailSource = false,
}: CollectionProfileDisplayProps) {
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
