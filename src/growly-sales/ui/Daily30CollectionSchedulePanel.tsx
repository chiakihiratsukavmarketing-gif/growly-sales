import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Daily30CollectionScheduleStore } from '../storage/daily30CollectionScheduleTypes.js';
import {
  COLLECTION_MODE_LABELS,
  AREA_STRATEGY_LABELS,
  DISCOVERY_SOURCE_LABELS,
  formatActiveProfileSummary,
  formatDiscoverySourceSiteLabel,
} from '../candidates/daily30CollectionScheduleLabels.js';
import {
  fetchDaily30CollectionSchedule,
  type Daily30CollectionScheduleResponse,
} from './daily30CollectionScheduleApi.js';
import { DevDetails } from './common/DevDetails.js';
import { InfoBanner } from './InfoBanner.js';
import { isDevApiErrorMessage, toUserFacingApiError } from './displayLabels.js';
import { Daily30CollectionScheduleEditDialog } from './Daily30CollectionScheduleEditDialog.js';
import { Daily30RunCollectionProfileSummary } from './Daily30RunCollectionProfileSummary.js';

const SCHEDULE_SAFETY_NOTES = [
  '求人サイト・楽天市場・ポータルは企業候補の発見元です。メール取得元は公式サイトのみです。',
  '外部掲載サイト上のメールは使用しません。',
  'Gmail下書き作成・送信には関係ありません。',
  '外部掲載サイト探索（求人サイト巡回等）は Phase 40.6 で実装予定です。実行は Google Places / 公式サイト検索です。',
] as const;

interface Daily30CollectionSchedulePanelProps {
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
  refreshKey?: number;
}

function formatOverrideSummary(
  label: string,
  override: Daily30CollectionScheduleStore['oneDayOverride']
): string {
  if (!override) return 'なし';
  return `${label}（${override.effectiveFromBatchId}）: ${formatActiveProfileSummary(override.profile)}`;
}

export function Daily30CollectionSchedulePanel({
  onError,
  onSuccess,
  refreshKey = 0,
}: Daily30CollectionSchedulePanelProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Daily30CollectionScheduleResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadDevError, setLoadDevError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setLoadDevError(null);
    try {
      const response = await fetchDaily30CollectionSchedule();
      setData(response);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '収集スケジュールの読み込みに失敗しました';
      setData(null);
      setLoadError(toUserFacingApiError(message));
      if (isDevApiErrorMessage(message)) {
        setLoadDevError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const schedule = data?.schedule;
  const active = schedule?.activeProfile;

  const nextReservationLabel = useMemo(() => {
    if (!schedule) return '—';
    if (schedule.oneDayOverride) {
      return `1日指定（${schedule.oneDayOverride.effectiveFromBatchId}）`;
    }
    if (schedule.nextProfileOverride) {
      return `継続指定（${schedule.nextProfileOverride.effectiveFromBatchId}〜）`;
    }
    return 'なし';
  }, [schedule]);

  const nextEffectiveBatchId =
    schedule?.oneDayOverride?.effectiveFromBatchId ??
    schedule?.nextProfileOverride?.effectiveFromBatchId ??
    data?.nextEffectiveBatchId ??
    '—';

  return (
    <div className="daily30-collection-schedule-panel">
      {loading && <p className="hint">収集設定を読み込み中…</p>}
      {loadError ? <InfoBanner variant="warn">{loadError}</InfoBanner> : null}
      {loadDevError ? (
        <DevDetails title="収集設定の読み込みエラー（開発者向け）">
          <p className="mono-cell">{loadDevError}</p>
        </DevDetails>
      ) : null}
      {!loading && !schedule && loadError ? (
        <p className="hint collection-schedule-disabled-hint">
          収集設定は表示できませんが、下の収集結果・Lead化承認は引き続き利用できます。
        </p>
      ) : null}

      {!loading && schedule && active && (
        <>
          <dl className="collection-schedule-dl">
            <div className="collection-schedule-row">
              <dt>現在の設定</dt>
              <dd>{formatActiveProfileSummary(active)}</dd>
            </div>
            <div className="collection-schedule-row">
              <dt>現在の収集方針</dt>
              <dd>{active.collectionProfileName}</dd>
            </div>
            <div className="collection-schedule-row">
              <dt>収集モード</dt>
              <dd>{COLLECTION_MODE_LABELS[active.collectionMode] ?? active.collectionMode}</dd>
            </div>
            <div className="collection-schedule-row">
              <dt>エリア戦略</dt>
              <dd>{AREA_STRATEGY_LABELS[active.areaStrategy] ?? active.areaStrategy}</dd>
            </div>
            <div className="collection-schedule-row">
              <dt>収集元</dt>
              <dd>{DISCOVERY_SOURCE_LABELS[active.discoverySource] ?? active.discoverySource}</dd>
            </div>
            <div className="collection-schedule-row">
              <dt>求人サイト指定</dt>
              <dd>{formatDiscoverySourceSiteLabel(active.discoverySourceSite)}</dd>
            </div>
            <div className="collection-schedule-row">
              <dt>次回予約</dt>
              <dd>{nextReservationLabel}</dd>
            </div>
            <div className="collection-schedule-row">
              <dt>次回反映日</dt>
              <dd>{nextEffectiveBatchId}</dd>
            </div>
            <div className="collection-schedule-row">
              <dt>一時指定</dt>
              <dd>{formatOverrideSummary('1日だけ', schedule.oneDayOverride)}</dd>
            </div>
            <div className="collection-schedule-row">
              <dt>更新日時</dt>
              <dd>{schedule.updatedAt}</dd>
            </div>
            <div className="collection-schedule-row">
              <dt>更新者</dt>
              <dd>{schedule.updatedBy}</dd>
            </div>
          </dl>

          <Daily30RunCollectionProfileSummary
            title="本日の実行で使用する収集設定（解決済み）"
            runContext={data?.resolvedForToday}
          />
          {data?.resolvedForTomorrow ? (
            <Daily30RunCollectionProfileSummary
              title="明日の実行で使用予定の収集設定"
              runContext={data.resolvedForTomorrow}
            />
          ) : null}

          <ul className="hint-list collection-schedule-safety">
            {SCHEDULE_SAFETY_NOTES.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>

          <div className="collection-schedule-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowEdit(true)}
              disabled={saving}
            >
              設定を変更する
            </button>
          </div>
        </>
      )}

      <DevDetails title="収集スケジュール JSON（開発者向け）">
        <pre className="dev-json-block">
          {schedule
            ? JSON.stringify(
                {
                  activeProfile: schedule.activeProfile,
                  nextProfileOverride: schedule.nextProfileOverride,
                  oneDayOverride: schedule.oneDayOverride,
                  effectiveFromBatchId:
                    schedule.oneDayOverride?.effectiveFromBatchId ??
                    schedule.nextProfileOverride?.effectiveFromBatchId ??
                    null,
                  updatedAt: schedule.updatedAt,
                  updatedBy: schedule.updatedBy,
                },
                null,
                2
              )
            : '（未読み込み）'}
        </pre>
      </DevDetails>

      {showEdit && schedule && (
        <Daily30CollectionScheduleEditDialog
          schedule={schedule}
          nextEffectiveBatchId={data?.nextEffectiveBatchId ?? ''}
          saving={saving}
          onCancel={() => setShowEdit(false)}
          onSaved={async () => {
            setShowEdit(false);
            await load();
            onSuccess?.('明日の収集設定を保存しました');
          }}
          onSaveStart={() => setSaving(true)}
          onSaveEnd={() => setSaving(false)}
          onError={onError}
        />
      )}
    </div>
  );
}
