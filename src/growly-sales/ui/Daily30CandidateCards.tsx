import type { ReactNode } from 'react';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import { resolveDaily30WorkflowStatus } from '../candidates/resolveDaily30WorkflowStatus.js';
import { resolveEmailSourceFromCandidate } from '../candidates/resolveEmailSourceDisplay.js';
import { isDaily30HumanExcludedCandidate } from '../candidates/daily30CandidateVisibility.js';
import { EmailSourceDisplay } from './EmailSourceDisplay.js';
import { CollectionProfileDisplay } from './CollectionProfileDisplay.js';
import { buildCollectionProfileDisplayFromCandidate } from '../candidates/resolveCollectionProfileDisplay.js';
import {
  pipelineStatusLabel,
  pipelineStatusVariant,
} from './daily30StatusLabels.js';

function shortenUrl(url: string, maxLen = 28): string {
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

function ExternalLink({ href, label }: { href: string; label?: string }) {
  const text = label ?? shortenUrl(href);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="daily30-link-chip"
      title={href}
    >
      {text}
    </a>
  );
}

function StatusBadge({ label, variant }: { label: string; variant: string }) {
  return <span className={`status-badge status-badge-${variant}`}>{label}</span>;
}

function CandidateStatusBadges({ candidate: c }: { candidate: ExternalLeadCandidate }) {
  const workflow = resolveDaily30WorkflowStatus(c);
  const pipelineLabel = pipelineStatusLabel(c.pipelineStatus);
  const showPipeline =
    c.pipelineStatus === 'email_found' ||
    c.pipelineStatus === 'email_not_found' ||
    c.pipelineStatus === 'excluded' ||
    c.pipelineStatus === 'duplicate';
  const showWorkflow = workflow.label !== '未承認' || c.importStatus === 'approved_for_lead';

  return (
    <div className="daily30-candidate-badges">
      {showPipeline ? (
        <StatusBadge label={pipelineLabel} variant={pipelineStatusVariant(c.pipelineStatus)} />
      ) : null}
      {showWorkflow ? (
        <StatusBadge label={workflow.label} variant={`workflow-${workflow.variant}`} />
      ) : showPipeline ? (
        <StatusBadge label="未承認" variant="status-neutral" />
      ) : null}
    </div>
  );
}

export function workQueueTitleForLeadView(
  view: 'actionable' | 'pending' | 'approved' | 'generated'
): string {
  switch (view) {
    case 'actionable':
      return '作業可能な候補';
    case 'pending':
      return 'Lead化承認待ち';
    case 'approved':
      return 'Lead化承認済み';
    case 'generated':
      return '営業文生成済み';
    default:
      return '候補';
  }
}

export function workQueueTitleForFilter(
  filter: 'all' | 'actionable' | 'approvable' | 'not_approvable' | 'email_ok' | 'email_missing'
): string {
  switch (filter) {
    case 'actionable':
      return '作業可能な候補';
    case 'approvable':
      return '承認可能な候補';
    case 'not_approvable':
      return '承認不可の候補';
    case 'email_ok':
      return 'メール確認済み候補';
    case 'email_missing':
      return 'メール未確認候補';
    default:
      return 'すべての候補';
  }
}

export function Daily30CandidateQueueHeader({ showActions = false }: { showActions?: boolean }) {
  return (
    <div className="daily30-queue-header" aria-hidden="true">
      <span className="daily30-queue-col-name">会社名</span>
      <span className="daily30-queue-col-area">エリア</span>
      <span className="daily30-queue-col-email">メール</span>
      <span className="daily30-queue-col-status">状態</span>
      <span className="daily30-queue-col-source">収集元</span>
      {showActions ? <span className="daily30-queue-col-actions">操作</span> : null}
    </div>
  );
}

interface Daily30CandidateCardProps {
  candidate: ExternalLeadCandidate;
  showApprove?: boolean;
  approving?: boolean;
  onApprove?: () => void;
  excluding?: boolean;
  onExclude?: () => void;
  compact?: boolean;
  layout?: 'card' | 'queue';
  approvalBlockReason?: string | null;
  duplicateLeadName?: string | null;
}

export function Daily30CandidateCard({
  candidate: c,
  showApprove = false,
  approving = false,
  onApprove,
  excluding = false,
  onExclude,
  compact = true,
  layout = 'card',
  approvalBlockReason = null,
  duplicateLeadName = null,
}: Daily30CandidateCardProps) {
  const siteUrl = c.officialSiteUrl ?? c.websiteUrl ?? '';
  const email = c.emailCandidates?.[0] ?? c.targetEmail ?? '';
  const emailSource = resolveEmailSourceFromCandidate(c);
  const blocked = Boolean(approvalBlockReason);
  const badEmail = emailSource.isPlaceholderEmail || emailSource.isPersonalEmail;
  const canApprove =
    showApprove && c.importStatus !== 'approved_for_lead' && !blocked && !badEmail;
  const canExclude =
    Boolean(onExclude) &&
    c.importStatus !== 'imported' &&
    !isDaily30HumanExcludedCandidate(c);
  const workflow = resolveDaily30WorkflowStatus(c);
  const discoveryLabel = c.discoverySourceLabel ?? c.discoverySource ?? '—';
  const isQueue = layout === 'queue';

  if (isQueue) {
    return (
      <article className="daily30-candidate-card daily30-candidate-card-queue">
        <div className="daily30-queue-row">
          <div className="daily30-queue-col-name">
            <span className="daily30-candidate-name" title={c.companyName}>
              {c.companyName}
            </span>
            {blocked ? (
              <span className="hint daily30-queue-block-hint" title={approvalBlockReason ?? undefined}>
                重複{duplicateLeadName ? `: ${duplicateLeadName}` : ''}
              </span>
            ) : null}
          </div>
          <span className="daily30-queue-col-area daily30-field-ellipsis" title={c.area}>
            {c.area || c.prefecture || '—'}
          </span>
          <span className="daily30-queue-col-email daily30-field-ellipsis" title={email}>
            {email || '—'}
          </span>
          <div className="daily30-queue-col-status">
            <CandidateStatusBadges candidate={c} />
          </div>
          <span className="daily30-queue-col-source daily30-field-ellipsis" title={discoveryLabel}>
            {discoveryLabel}
          </span>
          <div className="daily30-queue-col-actions daily30-card-actions">
            {canApprove ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={approving || excluding}
                onClick={onApprove}
              >
                {approving ? '承認中…' : 'Lead化承認'}
              </button>
            ) : blocked ? (
              <span className="status-badge status-badge-status-warn">承認不可</span>
            ) : badEmail && showApprove ? (
              <span className="status-badge status-badge-status-warn">要確認</span>
            ) : showApprove ? (
              <span className={`status-badge status-badge-workflow-${workflow.variant}`}>
                {workflow.label}
              </span>
            ) : siteUrl ? (
              <ExternalLink href={siteUrl} />
            ) : (
              <span className="hint">—</span>
            )}
            {canExclude ? (
              <button
                type="button"
                className="btn btn-exclude btn-sm"
                disabled={approving || excluding}
                onClick={onExclude}
              >
                {excluding ? '除外中…' : '除外'}
              </button>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={`daily30-candidate-card ${compact ? 'daily30-candidate-card-compact' : ''}`}>
      <div className="daily30-candidate-card-head">
        <div className="daily30-candidate-card-title">
          <h4 className="daily30-candidate-name" title={c.companyName}>
            {c.companyName}
          </h4>
          <CandidateStatusBadges candidate={c} />
        </div>
        {showApprove || canExclude ? (
          <div className="daily30-card-actions">
            {canApprove ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={approving || excluding}
                onClick={onApprove}
              >
                {approving ? '承認中…' : 'Lead化承認'}
              </button>
            ) : blocked ? (
              <span className="status-badge status-badge-status-warn">承認不可</span>
            ) : badEmail ? (
              <span className="status-badge status-badge-status-warn">メール要確認</span>
            ) : showApprove ? (
              <span className={`status-badge status-badge-workflow-${workflow.variant}`}>
                {workflow.label}
              </span>
            ) : null}
            {canExclude ? (
              <button
                type="button"
                className="btn btn-exclude btn-sm"
                disabled={approving || excluding}
                onClick={onExclude}
              >
                {excluding ? '除外中…' : '候補から除外'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {blocked ? (
        <p className="hint daily30-approval-block-hint">
          既存Leadと重複
          {duplicateLeadName ? `：${duplicateLeadName}` : ''}
          {approvalBlockReason && !duplicateLeadName ? ` — ${approvalBlockReason}` : null}
        </p>
      ) : null}

      <CollectionProfileDisplay
        info={buildCollectionProfileDisplayFromCandidate(c)}
        variant="compact"
        emailSourceInfo={email ? emailSource : null}
        showEmailSource={Boolean(email) && c.discoverySource === 'job_site_reference'}
      />

      <div className="daily30-candidate-grid daily30-candidate-grid-compact">
        <div className="daily30-candidate-field">
          <span className="daily30-field-label">エリア</span>
          <span className="daily30-field-value daily30-field-ellipsis" title={c.area}>
            {c.area || '—'}
          </span>
        </div>
        <div className="daily30-candidate-field daily30-candidate-field-email">
          <span className="daily30-field-label">メール</span>
          <span className="daily30-field-value daily30-field-ellipsis" title={email}>
            {email || '—'}
          </span>
          {email ? (
            <EmailSourceDisplay
              info={emailSource}
              variant="under-email"
              showWarnings
              className="daily30-email-source"
            />
          ) : null}
        </div>
        <div className="daily30-candidate-field">
          <span className="daily30-field-label">サイト</span>
          <span className="daily30-field-value daily30-field-ellipsis">
            {siteUrl ? <ExternalLink href={siteUrl} /> : '—'}
          </span>
        </div>
        <div className="daily30-candidate-field">
          <span className="daily30-field-label">収集元</span>
          <span className="daily30-field-value daily30-field-ellipsis" title={discoveryLabel}>
            {discoveryLabel}
          </span>
        </div>
        {!compact && c.contactFormUrl ? (
          <div className="daily30-candidate-field">
            <span className="daily30-field-label">フォーム</span>
            <span className="daily30-field-value">
              <ExternalLink href={c.contactFormUrl} label="フォーム" />
            </span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function Daily30CandidateList({
  candidates,
  showApprove = false,
  approvingId = null,
  excludingId = null,
  onApprove,
  onExclude,
  emptyMessage = '候補がありません。',
  approvalBlockHints = {},
  layout = 'card',
}: {
  candidates: ExternalLeadCandidate[];
  showApprove?: boolean;
  approvingId?: string | null;
  excludingId?: string | null;
  onApprove?: (candidate: ExternalLeadCandidate) => void;
  onExclude?: (candidate: ExternalLeadCandidate) => void;
  emptyMessage?: string;
  approvalBlockHints?: Record<string, { blockReason: string; duplicateLeadName?: string }>;
  layout?: 'card' | 'queue';
}) {
  if (candidates.length === 0) {
    return <p className="hint daily30-candidate-empty">{emptyMessage}</p>;
  }
  return (
    <div className={`daily30-candidate-list ${layout === 'queue' ? 'daily30-candidate-list-queue' : 'daily30-candidate-list-compact'}`}>
      {candidates.map((c) => {
        const hint = approvalBlockHints[c.externalCandidateId];
        return (
          <Daily30CandidateCard
            key={c.externalCandidateId}
            candidate={c}
            showApprove={showApprove}
            layout={layout}
            approving={approvingId === c.externalCandidateId}
            excluding={excludingId === c.externalCandidateId}
            onApprove={onApprove ? () => onApprove(c) : undefined}
            onExclude={onExclude ? () => onExclude(c) : undefined}
            approvalBlockReason={hint?.blockReason ?? null}
            duplicateLeadName={hint?.duplicateLeadName ?? null}
          />
        );
      })}
    </div>
  );
}

export function pipelineCountChips(counts: Record<string, number>): ReactNode {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return (
    <div className="daily30-pipeline-chips">
      {entries.map(([k, v]) => (
        <span key={k} className="daily30-pipeline-chip">
          {pipelineStatusLabel(k)}: <strong>{v}</strong>
        </span>
      ))}
    </div>
  );
}
