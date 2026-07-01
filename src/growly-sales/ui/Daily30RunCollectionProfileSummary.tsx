import type { ResolvedDaily30CollectionRunContext } from '../candidates/resolveDaily30CollectionSchedule.js';
import {
  formatScheduleSourceLabel,
  formatScheduleWarningLabel,
} from '../candidates/resolveDaily30CollectionSchedule.js';
import {
  AREA_STRATEGY_LABELS,
  DISCOVERY_SOURCE_LABELS,
  formatDiscoverySourceSiteLabel,
} from '../candidates/daily30CollectionScheduleLabels.js';

interface Daily30RunCollectionProfileSummaryProps {
  title?: string;
  runContext: ResolvedDaily30CollectionRunContext | null | undefined;
  areasUsed?: string[] | null;
  scheduleSourceLabel?: string | null;
  className?: string;
}

function formatProfileLine(runContext: ResolvedDaily30CollectionRunContext): string {
  const profile = runContext.profile;
  const area = AREA_STRATEGY_LABELS[profile.areaStrategy] ?? profile.areaStrategy;
  const source =
    profile.discoverySourceLabel ??
    DISCOVERY_SOURCE_LABELS[profile.discoverySource] ??
    profile.discoverySource;
  const site =
    profile.discoverySourceSite != null
      ? formatDiscoverySourceSiteLabel(profile.discoverySourceSite)
      : null;
  const sourceText = site ? `${source} / ${site}` : source;
  return `${profile.collectionProfileName} / ${area} / ${sourceText}`;
}

export function Daily30RunCollectionProfileSummary({
  title = '今回使用した収集設定',
  runContext,
  areasUsed,
  scheduleSourceLabel,
  className = '',
}: Daily30RunCollectionProfileSummaryProps) {
  if (!runContext) return null;

  const usedAreas = areasUsed?.length ? areasUsed : runContext.plannedAreaPrefectures.slice(0, 6);
  const sourceLabel =
    scheduleSourceLabel ?? formatScheduleSourceLabel(runContext.scheduleSource);

  return (
    <div className={`daily30-run-profile-summary ${className}`.trim()}>
      <p className="daily30-run-profile-title">{title}</p>
      <p className="daily30-run-profile-line">{formatProfileLine(runContext)}</p>
      <dl className="daily30-run-profile-meta">
        <div>
          <dt>schedule source</dt>
          <dd>{sourceLabel}</dd>
        </div>
        {usedAreas.length > 0 ? (
          <div>
            <dt>areas used</dt>
            <dd>{usedAreas.join(', ')}</dd>
          </div>
        ) : null}
        {runContext.effectiveFromBatchId ? (
          <div>
            <dt>effectiveFromBatchId</dt>
            <dd>{runContext.effectiveFromBatchId}</dd>
          </div>
        ) : null}
      </dl>
      {runContext.warnings.length > 0 ? (
        <ul className="hint-list daily30-run-profile-warnings">
          {runContext.warnings.map((w) => (
            <li key={w}>{formatScheduleWarningLabel(w)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
