import { useEffect } from 'react';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { resolveEmailSourceFromCandidate } from '../candidates/resolveEmailSourceDisplay.js';
import { buildCollectionProfileDisplayFromCandidate } from '../candidates/resolveCollectionProfileDisplay.js';
import { DevDetails } from './common/DevDetails.js';
import { EmailSourceDisplay } from './EmailSourceDisplay.js';
import {
  resolveFocusLeadability,
  type ApprovalBlockHints,
} from './daily30CandidateFocusMode.js';

function ExternalLink({ href, label }: { href: string; label?: string }) {
  const text = label ?? href;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="daily30-focus-link" title={href}>
      {text}
    </a>
  );
}

export type Daily30FocusPanelVariant = 'results' | 'lead';

export interface Daily30CandidateFocusViewProps {
  variant: Daily30FocusPanelVariant;
  title: string;
  candidate: ExternalLeadCandidate | null;
  approvalBlockHints: ApprovalBlockHints;
  remainingCount: number;
  processedCount: number;
  focusIndex: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  allDeferred: boolean;
  busy: boolean;
  approving: boolean;
  excluding: boolean;
  showApprove: boolean;
  showExclude: boolean;
  showDefer: boolean;
  primaryAction?: 'approve' | 'generate_copy' | 'view_copy' | 'none';
  onApprove?: () => void;
  onExclude?: () => void;
  onDefer?: () => void;
  onClearDeferred?: () => void;
  onPrev: () => void;
  onNext: () => void;
  onGenerateCopy?: () => void;
  onShowAll?: () => void;
  onShowNotApprovable?: () => void;
  emptyMessage?: string;
}

export function Daily30CandidateFocusView({
  variant,
  title,
  candidate,
  approvalBlockHints,
  remainingCount,
  processedCount,
  focusIndex,
  canGoPrev,
  canGoNext,
  allDeferred,
  busy,
  approving,
  excluding,
  showApprove,
  showExclude,
  showDefer,
  primaryAction = 'approve',
  onApprove,
  onExclude,
  onDefer,
  onClearDeferred,
  onPrev,
  onNext,
  onGenerateCopy,
  onShowAll,
  onShowNotApprovable,
  emptyMessage = '作業可能な候補はありません。',
}: Daily30CandidateFocusViewProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (busy || !candidate) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'ArrowRight' && canGoNext) {
        e.preventDefault();
        onNext();
      } else if (e.key === 'ArrowLeft' && canGoPrev) {
        e.preventDefault();
        onPrev();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, candidate, canGoNext, canGoPrev, onNext, onPrev]);

  if (remainingCount === 0) {
    return (
      <div className="daily30-focus-empty">
        <p className="hint">{emptyMessage}</p>
        <div className="daily30-focus-empty-actions">
          {onShowAll ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onShowAll}>
              すべて表示
            </button>
          ) : null}
          {onShowNotApprovable ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onShowNotApprovable}>
              承認不可候補を見る
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (allDeferred) {
    return (
      <div className="daily30-focus-empty">
        <p className="hint">すべての候補を「あとで確認」に移しました。</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClearDeferred}>
          あとで確認をリセット
        </button>
      </div>
    );
  }

  if (!candidate) {
    return <p className="hint daily30-focus-empty">{emptyMessage}</p>;
  }

  const siteUrl = candidate.officialSiteUrl ?? candidate.websiteUrl ?? '';
  const email = candidate.emailCandidates?.[0] ?? candidate.targetEmail ?? '';
  const emailSource = resolveEmailSourceFromCandidate(candidate);
  const discoveryLabel =
    candidate.discoverySourceLabel ?? candidate.discoverySource ?? '—';
  buildCollectionProfileDisplayFromCandidate(candidate);
  const leadability = resolveFocusLeadability(candidate, approvalBlockHints);
  const industryLabel = candidate.industryCategory ?? candidate.industry ?? '—';
  const prefecture = candidate.prefecture ?? candidate.area ?? '—';

  const canApprove =
    showApprove &&
    primaryAction === 'approve' &&
    leadability.kind === 'approvable' &&
    candidate.importStatus !== 'approved_for_lead';

  return (
    <div className="daily30-focus-panel">
      <div className="daily30-focus-meta">
        <h3 className="daily30-focus-queue-title">{title}</h3>
        <p className="hint daily30-focus-counts">
          残り <strong>{remainingCount}</strong>件
          {processedCount > 0 ? (
            <>
              {' '}
              ｜ 今日処理済み <strong>{processedCount}</strong>件
            </>
          ) : null}
        </p>
      </div>

      <article className="daily30-focus-card">
        <h4 className="daily30-focus-company">{candidate.companyName}</h4>
        <p className="daily30-focus-subline">
          {prefecture}｜{industryLabel}｜{discoveryLabel}
        </p>

        <div className="daily30-focus-fields">
          <div className="daily30-focus-field">
            <span className="daily30-focus-label">公式サイト</span>
            <span className="daily30-focus-value">
              {siteUrl ? <ExternalLink href={siteUrl} /> : '—'}
            </span>
          </div>
          <div className="daily30-focus-field">
            <span className="daily30-focus-label">代表メール</span>
            <span className="daily30-focus-value daily30-field-ellipsis" title={email}>
              {email || '—'}
            </span>
          </div>
          <div className="daily30-focus-field daily30-focus-field-wide">
            <span className="daily30-focus-label">メール取得元</span>
            <span className="daily30-focus-value">
              {email ? (
                <EmailSourceDisplay info={emailSource} variant="compact" showWarnings />
              ) : (
                '—'
              )}
            </span>
          </div>
          <div className="daily30-focus-field">
            <span className="daily30-focus-label">発見元</span>
            <span className="daily30-focus-value">{discoveryLabel}</span>
          </div>
        </div>

        <div className="daily30-focus-judgment">
          <span className="daily30-focus-label">判定</span>
          <ul className="daily30-focus-judgment-list">
            <li>{leadability.representativeEmailLabel}</li>
            <li>{leadability.blockReasonJa ? leadability.blockReasonJa : 'ブロック理由なし'}</li>
            <li>
              <strong className={`daily30-focus-status daily30-focus-status-${leadability.kind}`}>
                {leadability.label}
              </strong>
            </li>
          </ul>
        </div>

        <div className="daily30-focus-actions">
          {showExclude && onExclude ? (
            <button
              type="button"
              className="btn btn-exclude"
              disabled={busy}
              onClick={onExclude}
            >
              {excluding ? '除外中…' : '候補から除外'}
            </button>
          ) : null}
          {showDefer && onDefer ? (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onDefer}>
              あとで確認
            </button>
          ) : null}
          {primaryAction === 'generate_copy' && onGenerateCopy ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={onGenerateCopy}
            >
              営業文を生成
            </button>
          ) : null}
          {primaryAction === 'view_copy' ? (
            <span className="hint daily30-focus-view-copy-hint">
              営業文生成済み — 下書き取り込みタブで内容を確認してください。
            </span>
          ) : null}
          {canApprove && onApprove ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={onApprove}
            >
              {approving ? '承認中…' : 'Lead化承認'}
            </button>
          ) : null}
        </div>

        <DevDetails title="開発者向け詳細">
          <dl className="daily30-focus-dev-dl">
            <div>
              <dt>候補ID</dt>
              <dd>{candidate.externalCandidateId}</dd>
            </div>
            <div>
              <dt>collectionProfileId</dt>
              <dd>{candidate.collectionProfileId ?? '—'}</dd>
            </div>
            <div>
              <dt>collectionRunId</dt>
              <dd>{candidate.collectionRunId ?? candidate.collectionBatchId ?? '—'}</dd>
            </div>
            <div>
              <dt>discoverySourceUrl</dt>
              <dd>{candidate.discoverySourceUrl ?? '—'}</dd>
            </div>
            <div>
              <dt>emailSourceUrl</dt>
              <dd>{emailSource.emailSourceUrl ?? '—'}</dd>
            </div>
            <div>
              <dt>pipelineStatus</dt>
              <dd>{candidate.pipelineStatus}</dd>
            </div>
            <div>
              <dt>importStatus</dt>
              <dd>{candidate.importStatus}</dd>
            </div>
          </dl>
        </DevDetails>
      </article>

      <div className="daily30-focus-nav">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!canGoPrev || busy}
          onClick={onPrev}
        >
          前へ
        </button>
        <span className="hint daily30-focus-position">
          {focusIndex + 1} / {remainingCount}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!canGoNext || busy}
          onClick={onNext}
        >
          次へ
        </button>
      </div>
      {!canGoPrev && remainingCount > 1 ? (
        <p className="hint daily30-focus-nav-hint">先頭の候補です</p>
      ) : null}
      {!canGoNext && remainingCount > 1 ? (
        <p className="hint daily30-focus-nav-hint">末尾の候補です</p>
      ) : null}
    </div>
  );
}
