import type { Lead } from '../types/lead.js';
import { DEFAULT_TENANT_ID } from './tenantResolver.js';
import { issueUnsubscribeTokenForOutreach } from './issueUnsubscribeTokenForOutreach.js';
import {
  assertUnsubscribeUrlIssueReadiness,
  resolveSalesUnsubscribeTokenIssueSource,
} from './salesUnsubscribeTokenIssueSource.js';
import type { IssuedUnsubscribeTokenForOutreach } from './unsubscribeTokenIssueTypes.js';
import { UnsubscribeTokenIssueError } from './unsubscribeTokenIssueTypes.js';

function resolveDraftTargetEmail(lead: Lead): string {
  const email = lead.emailCandidates.find((e) => e.trim())?.trim() ?? '';
  if (!email) {
    throw new UnsubscribeTokenIssueError();
  }
  return email;
}

/**
 * Preview path: readiness only — no token issue, no GCS write.
 * live-gcs: validates URL/pepper/store readiness. mock: no-op success.
 */
export function assertUnsubscribeTokenReadinessForGmailDraft(input: {
  lead: Lead;
  tenantId?: string;
  env?: NodeJS.ProcessEnv;
}): void {
  const env = input.env ?? process.env;
  const tenantId = (input.tenantId ?? DEFAULT_TENANT_ID).trim();
  resolveDraftTargetEmail(input.lead);
  const source = resolveSalesUnsubscribeTokenIssueSource(env);
  if (source === 'live-gcs') {
    assertUnsubscribeUrlIssueReadiness({ tenantId, env });
  }
}

/**
 * CREATE_DRAFTS path: issue token before Gmail API.
 * rawToken/URL remain in memory for caller; Step 16C does not insert footer.
 */
export async function assertUnsubscribeTokenReadyForGmailDraft(input: {
  lead: Lead;
  tenantId?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<IssuedUnsubscribeTokenForOutreach> {
  const env = input.env ?? process.env;
  const tenantId = (input.tenantId ?? DEFAULT_TENANT_ID).trim();
  const emailAddress = resolveDraftTargetEmail(input.lead);
  return issueUnsubscribeTokenForOutreach(
    {
      tenantId,
      emailAddress,
      leadId: input.lead.id,
    },
    env
  );
}
