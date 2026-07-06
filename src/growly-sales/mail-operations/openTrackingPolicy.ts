import type {
  EmailSendTracking,
  LeadOpenStats,
  ReferenceOpenRateMetrics,
} from './openTrackingTypes.js';
import { OPEN_TRACKING_PRIVACY_NOTE } from './openTrackingPrivacy.js';

export const REFERENCE_OPEN_RATE_NOTE = OPEN_TRACKING_PRIVACY_NOTE;

export function buildManualGmailSendRecordId(leadId: string): string {
  return `manual-gmail:${leadId}`;
}

export function formatOpenTrackingStatusLabel(stats: LeadOpenStats): string {
  if (stats.status === 'not_tracked') return '計測なし';
  if (stats.status === 'tracking_disabled') return '計測対象外';
  if (!stats.isOpened) return '未開封';
  return stats.privacyProxySuspected ? '開封済み（参考）' : '開封済み';
}

export function buildLeadOpenStats(tracking: EmailSendTracking | null, leadId: string): LeadOpenStats {
  if (!tracking) {
    return {
      leadId,
      sendRecordId: buildManualGmailSendRecordId(leadId),
      trackingId: null,
      status: 'not_tracked',
      sentAt: null,
      firstOpenedAt: null,
      lastOpenedAt: null,
      openCount: 0,
      uniqueOpenCount: 0,
      privacyProxySuspected: false,
      isOpened: false,
    };
  }
  return {
    leadId,
    sendRecordId: tracking.sendRecordId,
    trackingId: tracking.trackingId,
    status: tracking.status,
    sentAt: tracking.sentAt ?? null,
    firstOpenedAt: tracking.firstOpenedAt ?? null,
    lastOpenedAt: tracking.lastOpenedAt ?? null,
    openCount: tracking.openCount,
    uniqueOpenCount: tracking.uniqueOpenCount,
    privacyProxySuspected: tracking.privacyProxySuspected,
    isOpened: tracking.status !== 'tracking_disabled' && tracking.openCount > 0,
  };
}

export function buildReferenceOpenRateMetrics(
  records: EmailSendTracking[]
): ReferenceOpenRateMetrics {
  const trackable = records.filter(
    (r) => r.status === 'mock' || r.status === 'tracking_ready'
  );
  const opened = trackable.filter((r) => r.openCount > 0);
  const referenceOpenRate =
    trackable.length > 0 ? opened.length / trackable.length : null;
  return {
    sentWithTrackingCount: records.length,
    trackableSendCount: trackable.length,
    openedSendCount: opened.length,
    referenceOpenRate,
    note: REFERENCE_OPEN_RATE_NOTE,
  };
}

export function assertMockOpenEventAllowed(): void {
  const mode = process.env.MAIL_OPEN_TRACKING_ENABLED?.trim().toLowerCase();
  if (mode === 'false') {
    throw new Error('MAIL_OPEN_TRACKING_ENABLED=false のため mock 開封イベントは記録できません');
  }
}

export function isLiveOpenTrackingPixelEnabled(): boolean {
  return process.env.MAIL_OPEN_TRACKING_ENABLED?.trim().toLowerCase() === 'true';
}
