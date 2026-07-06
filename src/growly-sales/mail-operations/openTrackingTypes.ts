export type EmailSendTrackingStatus = 'mock' | 'tracking_ready' | 'tracking_disabled';

export type UserAgentCategory =
  | 'gmail_proxy'
  | 'apple_mpp'
  | 'desktop'
  | 'mobile'
  | 'unknown';

export interface EmailSendTracking {
  trackingId: string;
  sendRecordId: string;
  companyId?: string;
  leadId?: string;
  normalizedEmail?: string;
  tokenHash: string;
  status: EmailSendTrackingStatus;
  sentAt?: string;
  firstOpenedAt?: string;
  lastOpenedAt?: string;
  openCount: number;
  uniqueOpenCount: number;
  rawEventCount: number;
  privacyProxySuspected: boolean;
  userAgentCategory?: UserAgentCategory;
  createdAt: string;
  updatedAt: string;
}

export interface EmailOpenEvent {
  eventId: string;
  trackingId: string;
  trackingTokenHash: string;
  receivedAt: string;
  userAgent: string;
  userAgentCategory: UserAgentCategory;
  privacyProxySuspected: boolean;
}

export interface EmailOpenEventStore {
  version: 1;
  events: EmailOpenEvent[];
  updatedAt: string;
}

export interface EmailSendTrackingStore {
  version: 1;
  records: EmailSendTracking[];
  updatedAt: string;
}

export interface LeadOpenStats {
  leadId: string;
  sendRecordId: string;
  trackingId: string | null;
  status: EmailSendTrackingStatus | 'not_tracked';
  sentAt: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  uniqueOpenCount: number;
  privacyProxySuspected: boolean;
  isOpened: boolean;
}

export interface ReferenceOpenRateMetrics {
  sentWithTrackingCount: number;
  trackableSendCount: number;
  openedSendCount: number;
  referenceOpenRate: number | null;
  note: string;
}
