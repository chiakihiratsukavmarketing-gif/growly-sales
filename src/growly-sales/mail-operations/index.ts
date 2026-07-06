export type {
  MailSuppression,
  MailSuppressionSource,
  MailSuppressionStatus,
  MailSuppressionStore,
  SuppressionCheckResult,
  SuppressionOperation,
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
