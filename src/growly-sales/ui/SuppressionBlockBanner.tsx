import type { MailSuppression, MailSuppressionStatus, MailSuppressionSource } from '../../mail-operations/suppressionTypes.js';

const STATUS_LABELS: Record<MailSuppressionStatus, string> = {
  unsubscribed: '本人による配信停止',
  manually_blocked: '手動による配信禁止',
  invalid_address: '無効なメールアドレス',
  complaint: '苦情による配信禁止',
  legal_block: '法的理由による配信禁止',
};

const SOURCE_LABELS: Record<MailSuppressionSource, string> = {
  unsubscribe_link: '配信停止リンク',
  manual: '手動登録',
  reply_opt_out: '返信による停止希望',
  bounce: '不達',
  complaint: '苦情',
  import: 'インポート',
  legacy_do_not_contact: '既存の連絡禁止フラグ',
};

function formatSuppressionStatusLabel(status: MailSuppressionStatus): string {
  return STATUS_LABELS[status] ?? status;
}

function formatSuppressionSourceLabel(source: MailSuppressionSource): string {
  return SOURCE_LABELS[source] ?? source;
}

function formatSuppressionBlockedAt(record: MailSuppression): string | null {
  const at = record.unsubscribedAt ?? record.createdAt;
  if (!at) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('ja-JP', { hour12: false });
}

interface SuppressionBlockBannerProps {
  blockReason?: string | null;
  title?: string;
  className?: string;
}

function parseBlockReason(blockReason: string): { title: string; stoppedAt: string | null } {
  const lines = blockReason.split('\n').map((l) => l.trim()).filter(Boolean);
  const title = lines[0]?.replace(/^配信禁止：/, '') ?? '配信禁止';
  const stoppedAt = lines[1]?.replace(/^停止日時：/, '') ?? null;
  return { title, stoppedAt };
}

export function SuppressionBlockBanner({
  blockReason,
  title,
  className = '',
}: SuppressionBlockBannerProps) {
  if (!blockReason && !title) return null;
  const parsed = blockReason ? parseBlockReason(blockReason) : { title: title ?? '配信禁止', stoppedAt: null };
  const displayTitle = title ?? parsed.title;

  return (
    <div className={`suppression-block-banner ${className}`.trim()} role="status">
      <p className="suppression-block-title">配信禁止</p>
      <p className="suppression-block-reason">{displayTitle}</p>
      {parsed.stoppedAt ? (
        <p className="suppression-block-meta">停止日時：{parsed.stoppedAt}</p>
      ) : null}
    </div>
  );
}

export function isSuppressionBlockReason(reason: string | null | undefined): boolean {
  return Boolean(reason?.includes('配信禁止'));
}

interface SuppressionListRowProps {
  record: MailSuppression;
  companyName?: string | null;
}

export function formatSuppressionListRowMeta(record: MailSuppression, companyName?: string | null) {
  return {
    companyName: companyName?.trim() || record.leadId || '—',
    email: record.emailAddress,
    statusLabel: formatSuppressionStatusLabel(record.status),
    sourceLabel: formatSuppressionSourceLabel(record.source),
    reason: record.reason?.trim() || formatSuppressionStatusLabel(record.status),
    stoppedAt: formatSuppressionBlockedAt(record) ?? '—',
    lastBlockedAt: record.lastAttemptBlockedAt
      ? new Date(record.lastAttemptBlockedAt).toLocaleString('ja-JP', { hour12: false })
      : '—',
    isActive: !record.reactivatedAt,
  };
}

export function SuppressionListRowSummary({ record, companyName }: SuppressionListRowProps) {
  const meta = formatSuppressionListRowMeta(record, companyName);
  return (
    <tr className={meta.isActive ? 'suppression-row-active' : 'suppression-row-reactivated'}>
      <td>{meta.companyName}</td>
      <td>{meta.email}</td>
      <td>{meta.statusLabel}</td>
      <td>{meta.reason}</td>
      <td>{meta.sourceLabel}</td>
      <td>{meta.stoppedAt}</td>
      <td>{meta.lastBlockedAt}</td>
    </tr>
  );
}
