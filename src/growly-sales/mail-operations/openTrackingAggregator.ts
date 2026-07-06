import type { EmailOpenEvent, EmailSendTracking } from './openTrackingTypes.js';
import { isPrivacyProxyCategory } from './openTrackingPrivacy.js';

export function applyOpenEventToTracking(
  tracking: EmailSendTracking,
  event: EmailOpenEvent
): EmailSendTracking {
  const now = event.receivedAt;
  const firstOpenedAt = tracking.firstOpenedAt ?? now;
  const privacyProxySuspected =
    tracking.privacyProxySuspected || event.privacyProxySuspected;
  const isFirstUniqueOpen = tracking.uniqueOpenCount === 0;
  const countedOpen = isFirstUniqueOpen || !event.privacyProxySuspected;

  return {
    ...tracking,
    firstOpenedAt,
    lastOpenedAt: now,
    openCount: countedOpen ? tracking.openCount + 1 : tracking.openCount,
    uniqueOpenCount: isFirstUniqueOpen ? 1 : tracking.uniqueOpenCount,
    rawEventCount: tracking.rawEventCount + 1,
    privacyProxySuspected,
    userAgentCategory: event.userAgentCategory,
    updatedAt: now,
  };
}

export function buildOpenEventFromInput(input: {
  eventId: string;
  tracking: EmailSendTracking;
  receivedAt: string;
  userAgent: string;
  userAgentCategory: EmailOpenEvent['userAgentCategory'];
}): EmailOpenEvent {
  return {
    eventId: input.eventId,
    trackingId: input.tracking.trackingId,
    trackingTokenHash: input.tracking.tokenHash,
    receivedAt: input.receivedAt,
    userAgent: input.userAgent,
    userAgentCategory: input.userAgentCategory,
    privacyProxySuspected: isPrivacyProxyCategory(input.userAgentCategory),
  };
}
