export type {
  MailSuppression,
  MailSuppressionSource,
  MailSuppressionStatus,
  MailSuppressionStoreDocument,
  MailSuppressionStore,
  SuppressionCheckResult,
  SuppressionOperation,
  SuppressionScope,
} from './suppressionTypes.js';
export {
  ACTIVE_SUPPRESSION_STATUSES,
  isActiveSuppressionStatus,
} from './suppressionTypes.js';
export {
  normalizeEmailAddress,
  hashUnsubscribeToken,
  generateUnsubscribeToken,
} from './suppressionToken.js';
export {
  loadMailSuppressionStore,
  loadMailSuppressionStoreSync,
  listMailSuppressions,
  addManualSuppression,
  reactivateSuppression,
  recordSuppressionFromUnsubscribe,
  registerMockUnsubscribeToken,
  confirmMockUnsubscribe,
  setSuppressionStoreOverrideForTests,
  clearMockUnsubscribeTokenRegistryForTests,
} from './suppressionStore.js';
export type { MailOperationsTenant } from './tenantTypes.js';
export {
  DEFAULT_TENANT_ID,
  getDefaultMailOperationsTenantId,
  resolveMailOperationsTenant,
  requireMailOperationsTenant,
} from './tenantResolver.js';
export { resolveMailOperationsPublicBaseUrl, buildUnsubscribeUrl } from './publicUrlResolver.js';
export { buildUnsubscribeScreenCopy, buildUnsubscribeEmailFooterCopy } from './unsubscribeBranding.js';
export type { UnsubscribeScreenCopy, UnsubscribeEmailFooterCopy } from './unsubscribeBranding.js';
export {
  LocalJsonMailSuppressionStore,
  GcsJsonMailSuppressionStore,
} from './suppressionStoreInterface.js';
export {
  SuppressionBlockedError,
  checkNotSuppressed,
  assertNotSuppressed,
  getSuppressionExclusionReasonForLead,
  isFollowUpSuppressed,
  isResendSuppressed,
  buildSuppressionBlockReason,
  formatSuppressionStatusLabel,
  formatSuppressionSourceLabel,
  formatSuppressionBlockedAt,
  getMailOpsMode,
  buildMockUnsubscribeNoticePreview,
  shouldShowMockUnsubscribePreview,
} from './suppressionPolicy.js';
export { logSuppressionBlock } from './suppressionAudit.js';
export { buildSuppressionBlocksForLeads } from './buildLeadSuppressionBlocks.js';
export type {
  OutreachTemplate,
  OutreachTemplateStore,
  OutreachTemplateStatus,
  OutreachTemplateTone,
  TemplatePreviewInput,
} from './templateTypes.js';
export {
  OUTREACH_TEMPLATE_AI_SLOTS,
  OUTREACH_TEMPLATE_HUMAN_BLOCKS,
} from './templateTypes.js';
export {
  loadOutreachTemplateStore,
  loadOutreachTemplateStoreSync,
  loadActiveOutreachTemplateSync,
  listOutreachTemplates,
  saveOutreachTemplateDraft,
  activateOutreachTemplate,
  resetOutreachTemplatesToDefault,
  buildBuiltinDefaultTemplate,
  setOutreachTemplateStoreOverrideForTests,
} from './templateStore.js';
export {
  renderOutreachTemplate,
  renderOutreachTemplatePreview,
  buildTemplateAiSlots,
} from './templateRenderer.js';
export { validateOutreachTemplate, validateOutreachTemplateForActivation, shouldApplyActiveTemplate, findUnresolvedTemplatePlaceholders } from './templatePolicy.js';
export type {
  EmailSendTracking,
  EmailSendTrackingStatus,
  EmailOpenEvent,
  EmailOpenEventStore,
  EmailSendTrackingStore,
  LeadOpenStats,
  ReferenceOpenRateMetrics,
  UserAgentCategory,
} from './openTrackingTypes.js';
export {
  hashOpenTrackingToken,
  generateOpenTrackingToken,
} from './openTrackingToken.js';
export {
  categorizeUserAgent,
  isPrivacyProxyCategory,
  OPEN_TRACKING_PRIVACY_NOTE,
} from './openTrackingPrivacy.js';
export {
  applyOpenEventToTracking,
  buildOpenEventFromInput,
} from './openTrackingAggregator.js';
export {
  REFERENCE_OPEN_RATE_NOTE,
  buildManualGmailSendRecordId,
  formatOpenTrackingStatusLabel,
  buildLeadOpenStats,
  buildReferenceOpenRateMetrics,
  assertMockOpenEventAllowed,
  isLiveOpenTrackingPixelEnabled,
} from './openTrackingPolicy.js';
export {
  loadEmailOpenEventStore,
  loadEmailOpenEventStoreSync,
  loadEmailSendTrackingStore,
  loadEmailSendTrackingStoreSync,
  setOpenTrackingStoreOverrideForTests,
  clearMockOpenTrackingTokenRegistryForTests,
  createMockSendTrackingForManualGmailSend,
  recordMockOpenEvent,
  getLeadOpenStats,
  getOpenStatsForLeadIds,
  getReferenceOpenRateMetrics,
  getReferenceOpenRateMetricsSync,
  findTrackingByLeadId,
  registerMockOpenTrackingTokenForTests,
} from './openTrackingStore.js';
