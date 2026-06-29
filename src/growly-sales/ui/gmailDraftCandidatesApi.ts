import type { EmailOutreachCandidateView } from '../outreach/outreachPolicy.js';
import type { CreateGmailDraftForLeadResult } from '../workflow/createGmailDraftForLead.js';
import { readApiError } from './apiError.js';

const API_BASE = '';

export interface GmailDraftCandidateDetail extends EmailOutreachCandidateView {
  leadId: string;
  to: string;
  fromEmail: string;
  fromDisplayName: string;
  replyToEmail: string;
  signatureEmail: string;
  subject: string;
  customHook: string;
  emailBodyPreview: string;
  canCreate: boolean;
  blockReason: string | null;
}

export interface GmailDraftCandidatesResponse {
  candidates: GmailDraftCandidateDetail[];
  totalCount: number;
  generatedAt: string;
  leadsPath: string;
  note: string;
}

export const CREATE_DRAFTS_GATE_LABEL = 'CREATE_DRAFTS';

export async function fetchGmailDraftCandidates(): Promise<GmailDraftCandidatesResponse> {
  const res = await fetch(`${API_BASE}/api/gmail-draft-candidates`);
  if (!res.ok) {
    throw new Error(
      await readApiError(res, 'GET /api/gmail-draft-candidates', 'Gmail下書き候補の取得に失敗しました')
    );
  }
  return (await res.json()) as GmailDraftCandidatesResponse;
}

export async function createGmailDraftApi(
  leadId: string,
  createDraftsGate: string
): Promise<CreateGmailDraftForLeadResult> {
  const res = await fetch(
    `${API_BASE}/api/leads/${encodeURIComponent(leadId)}/create-gmail-draft`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ createDraftsGate }),
    }
  );
  if (!res.ok) {
    throw new Error(
      await readApiError(
        res,
        `POST /api/leads/${leadId}/create-gmail-draft`,
        'Gmail下書きの作成に失敗しました'
      )
    );
  }
  return (await res.json()) as CreateGmailDraftForLeadResult;
}
