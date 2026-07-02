import { InfoBanner } from './InfoBanner.js';
import { DevDetails } from './common/DevDetails.js';
import {
  EXTERNAL_REFERENCE_SUPPLEMENT_WARNING_LABELS,
  type ExternalReferenceSupplementMode,
} from '../candidates/externalReferenceSupplementConstants.js';

export interface ExternalReferenceSupplementUiSummary {
  externalReferenceSupplementAttempted?: boolean;
  externalReferenceSupplementMode?: ExternalReferenceSupplementMode | string;
  externalReferenceDiscoverySource?: string;
  externalReferenceDiscoverySourceSite?: string | null;
  externalReferencePlanReason?: string;
  externalReferenceWarnings?: string[];
  externalReferenceNetworkAccessPerformed?: boolean;
  externalReferenceCandidatesFound?: number;
  externalReferenceCandidatesAccepted?: number;
  externalReferenceHumanApprovalRequired?: boolean;
  externalReferenceManualCandidatesAvailable?: number;
  externalReferenceManualCandidatesEligible?: number;
  plannedExternalReferenceNote?: string | null;
  externalReferenceDisplayMessage?: string | null;
}

function bannerVariant(mode: string | undefined): 'success' | 'warning' | 'danger' | 'info' {
  if (mode === 'low_frequency_allowed') return 'info';
  if (mode === 'manual_only' && (mode as string)) return 'info';
  if (mode === 'blocked' || mode === 'skipped_not_approved') return 'warning';
  if (mode === 'dry_run_only') return 'info';
  return 'info';
}

function modeLabel(mode: string | undefined): string {
  switch (mode) {
    case 'not_applicable':
      return '未実行';
    case 'manual_only':
      return '手動URLのみ';
    case 'dry_run_only':
      return 'dry-runのみ';
    case 'skipped_not_approved':
      return 'スキップ';
    case 'blocked':
      return 'ブロック';
    case 'low_frequency_allowed':
      return '低頻度承認済み';
    default:
      return mode ?? '—';
  }
}

function warningLabel(code: string): string {
  return EXTERNAL_REFERENCE_SUPPLEMENT_WARNING_LABELS[code] ?? code;
}

export function Daily30ExternalReferenceSupplementBanner({
  summary,
  compact = false,
}: {
  summary: ExternalReferenceSupplementUiSummary | null | undefined;
  compact?: boolean;
}) {
  if (!summary) return null;

  const display =
    summary.externalReferenceDisplayMessage?.trim() ||
    (summary.externalReferenceSupplementMode === 'not_applicable'
      ? '未実行 — 現在の収集元は Google Places / 公式サイト検索です'
      : null);

  if (!display && !summary.externalReferenceSupplementAttempted) {
    return null;
  }

  const mode = summary.externalReferenceSupplementMode;

  return (
    <div className="daily30-external-ref-supplement">
      <InfoBanner variant={bannerVariant(mode)}>
        <span className="daily30-external-ref-supplement-banner">
          <strong>外部参照補完：</strong>
          {modeLabel(mode)}
          {' — '}
          {display ?? '状態を確認してください'}
          {summary.externalReferenceManualCandidatesEligible != null &&
          summary.externalReferenceManualCandidatesEligible > 0 ? (
            <>
              {' '}
              （手動URL候補 {summary.externalReferenceManualCandidatesEligible}件）
            </>
          ) : null}
        </span>
      </InfoBanner>

      {!compact && (
        <DevDetails title="外部参照補完（開発者向け）">
          <dl className="daily30-run-meta">
            <div>
              <dt>attempted</dt>
              <dd>{String(summary.externalReferenceSupplementAttempted ?? false)}</dd>
            </div>
            <div>
              <dt>mode</dt>
              <dd>{mode ?? '—'}</dd>
            </div>
            <div>
              <dt>discoverySource</dt>
              <dd>{summary.externalReferenceDiscoverySource ?? '—'}</dd>
            </div>
            <div>
              <dt>discoverySourceSite</dt>
              <dd>{summary.externalReferenceDiscoverySourceSite ?? '—'}</dd>
            </div>
            <div>
              <dt>planReason</dt>
              <dd>{summary.externalReferencePlanReason ?? '—'}</dd>
            </div>
            <div>
              <dt>networkAccessPerformed</dt>
              <dd>{String(summary.externalReferenceNetworkAccessPerformed ?? false)}</dd>
            </div>
            <div>
              <dt>candidatesFound</dt>
              <dd>{summary.externalReferenceCandidatesFound ?? 0}</dd>
            </div>
            <div>
              <dt>candidatesAccepted</dt>
              <dd>{summary.externalReferenceCandidatesAccepted ?? 0}</dd>
            </div>
            <div>
              <dt>humanApprovalRequired</dt>
              <dd>{String(summary.externalReferenceHumanApprovalRequired ?? false)}</dd>
            </div>
            <div>
              <dt>manualCandidatesAvailable</dt>
              <dd>{summary.externalReferenceManualCandidatesAvailable ?? 0}</dd>
            </div>
            {summary.plannedExternalReferenceNote ? (
              <div className="daily30-run-meta-wide">
                <dt>plannedNote</dt>
                <dd>{summary.plannedExternalReferenceNote}</dd>
              </div>
            ) : null}
          </dl>
          {(summary.externalReferenceWarnings?.length ?? 0) > 0 ? (
            <ul className="hint-list">
              {summary.externalReferenceWarnings!.map((w) => (
                <li key={w}>
                  <code>{w}</code> — {warningLabel(w)}
                </li>
              ))}
            </ul>
          ) : null}
        </DevDetails>
      )}
    </div>
  );
}
