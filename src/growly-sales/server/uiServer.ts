import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadTargetProfile } from '../config/targetProfile.js';
import { loadOfferProfile } from '../config/offerProfile.js';
import { isExternalFetchConfigured } from '../config/env.js';
import { buildDaily30Dashboard, describeDaily30AreaExpansion } from '../candidates/buildDaily30Dashboard.js';
import { fetchDaily30Candidates, buildDaily30FetchPlan } from '../candidates/fetchDaily30Candidates.js';
import { FETCH_DAILY_30_CONFIRM_TOKEN, GENERATE_DAILY_30_COPY_CONFIRM_TOKEN, IMPORT_DAILY_30_DRAFT_CANDIDATES_CONFIRM_TOKEN } from '../scripts/externalCandidateCliTokens.js';
import { REPLY_MANAGEMENT_API_STATUSES } from '../workflow/replyManagementValidation.js';
import {
  getDraftsDir,
  getGrowlySalesPathInfo,
  getLeadsJsonPath,
  getUiDistDir,
} from '../config/paths.js';
import { computeDraftStats } from '../drafts/selectDraftCandidates.js';
import { buildDraftCandidatesPayload } from '../drafts/buildUiDraftCandidates.js';
import { exportDraftCandidates } from '../drafts/exportDraftCandidates.js';
import { LeadsFileNotFoundError, loadLeadsForApi } from '../storage/loadLeadsForApi.js';
import { loadLeadsOptionalForDaily30 } from '../storage/loadLeadsOptionalForDaily30.js';
import {
  buildDaily30CloudDashboardPayload,
  buildGrowlyStorageStatusPayload,
  Daily30GcsReadError,
} from '../candidates/buildDaily30CloudDashboard.js';
import { getCloudRunEntryForBatch } from '../storage/daily30CloudRunState.js';
import { buildSalesAnalytics } from '../analytics/buildSalesAnalytics.js';
import { buildOperationSummary } from '../analytics/buildOperationSummary.js';
import { checkLocalMvpReadiness } from '../mvp/checkLocalMvpReadiness.js';
import { buildPilotSummary } from '../analytics/buildPilotSummary.js';
import { buildContactPathAnalytics } from '../analytics/buildContactPathAnalytics.js';
import { buildSalesDashboard } from '../analytics/buildSalesDashboard.js';
import {
  buildEmailOutreachCandidateView,
  selectGmailDraftCreationTargets,
  selectGmailDraftTabLeads,
} from '../outreach/outreachPolicy.js';
import {
  CreateDraftsGateError,
  GmailDraftCreateNotAllowedError,
  buildGmailDraftPreviewForLead,
  createGmailDraftForLead,
} from '../workflow/createGmailDraftForLead.js';
import { LeadNotFoundError as GmailLeadNotFoundError } from '../workflow/updateLeadGmailDraft.js';
import { loadExternalCandidatesFromJson, persistExternalCandidates } from '../storage/externalCandidatesRepository.js';
import { approveExternalCandidateForImport } from '../workflow/importApprovedExternalCandidates.js';
import { approveExternalCandidateForLead } from '../workflow/approveExternalCandidateForLead.js';
import { runDaily30CopyPipeline } from '../candidates/runDaily30CopyPipeline.js';
import { buildDaily30ReadyForDraftApiPayload } from '../candidates/buildDaily30ReadyForDraftApiPayload.js';
import { buildDaily30DraftPipelineProgress } from '../candidates/buildDaily30DraftPipelineProgress.js';
import { buildDaily30OperationsSummary } from '../candidates/buildDaily30OperationsSummary.js';
import {
  importDaily30DraftCandidateAsLead,
  importDaily30DraftCandidatesBulk,
} from '../workflow/importDaily30DraftCandidates.js';
import {
  selectDaily30LeadApprovalPending,
  selectDaily30LeadReviewCandidates,
} from '../candidates/selectDaily30LeadCandidates.js';
import { buildDaily30LeadApprovalBlockHints } from '../candidates/getDaily30LeadApprovalBlockReason.js';
import {
  markDealStatus,
  markFollowUpNeeded,
  markManualSent,
  markReplyStatus,
  updateCommunicationMemo,
  updateLeadReplyManagement,
} from '../workflow/updateLeadCommunication.js';
import {
  ManualGmailSendRecordError,
  buildManualGmailSendPreview,
  isPendingGmailSendRecordLead,
  recordManualGmailSent,
} from '../workflow/recordManualGmailSent.js';
import {
  ReplyManagementNotAllowedError,
  ReplyManagementValidationError,
} from '../workflow/replyManagementValidation.js';
import {
  approveLeadForDraft,
  markDoNotContact,
  markLeadNeedsRevision,
  rejectLead,
  updateLeadEmailDraft,
  LeadNotFoundError,
} from '../workflow/updateLeadReview.js';
import {
  previewUnsentSignatureRefresh,
  refreshUnsentLeadSignatures,
} from '../workflow/refreshUnsentLeadSignatures.js';
import { handleDaily30CloudRoutes } from './daily30CloudRoutes.js';

const UI_DIST = getUiDistDir();
const PORT = Number(process.env.PORT ?? process.env.GROWLY_UI_PORT ?? 3847);

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-growly-daily30-token',
  });
  res.end(JSON.stringify(data));
}

function sendApiError(
  res: ServerResponse,
  status: number,
  api: string,
  message: string,
  path?: string,
  detail?: string
): void {
  sendJson(res, status, { error: message, api, path, detail });
}

async function serveStatic(res: ServerResponse, filePath: string, contentType: string): Promise<void> {
  const content = await readFile(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
}

function matchLeadAction(pathname: string): { leadId: string; action: string } | null {
  const match = pathname.match(/^\/api\/leads\/([^/]+)\/(approve|needs-revision|reject|do-not-contact|email-draft)$/);
  if (!match) return null;
  return { leadId: decodeURIComponent(match[1]), action: match[2] };
}

function matchCommunicationAction(pathname: string): { leadId: string; action: string } | null {
  const match = pathname.match(
    /^\/api\/leads\/([^/]+)\/(manual-sent|reply-status|reply-management|follow-up|deal-status|communication-memo|record-manual-gmail-sent|create-gmail-draft)$/
  );
  if (!match) return null;
  return { leadId: decodeURIComponent(match[1]), action: match[2] };
}

export async function handleUiRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const { pathname } = url;
  const leadsPath = getLeadsJsonPath();

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    if (await handleDaily30CloudRoutes(req, res, pathname)) {
      return;
    }

    if (req.method === 'GET' && pathname === '/api/leads') {
      const leads = await loadLeadsForApi('GET /api/leads');
      sendJson(res, 200, { leads, leadsPath });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/draft-stats') {
      const leads = await loadLeadsForApi('GET /api/draft-stats');
      const offer = await loadOfferProfile();
      const stats = computeDraftStats(leads, offer);
      const payload = buildDraftCandidatesPayload(leads, offer);
      sendJson(res, 200, {
        ...stats,
        excludedCount: payload.excludedCount,
        generatedAt: payload.generatedAt,
        leadsPath,
        note: 'Gmail下書きではなく、手動エクスポート対象です。自動送信は行いません。',
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/draft-candidates') {
      const leads = await loadLeadsForApi('GET /api/draft-candidates');
      const offer = await loadOfferProfile();
      const payload = buildDraftCandidatesPayload(leads, offer);
      sendJson(res, 200, { ...payload, leadsPath });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/sales-analytics') {
      const leads = await loadLeadsForApi('GET /api/sales-analytics');
      const analytics = buildSalesAnalytics(leads);
      sendJson(res, 200, {
        analytics,
        generatedAt: new Date().toISOString(),
        leadsPath,
        note: 'ローカルJSONの手動記録のみを集計。Gmail/外部API/自動送信は使用していません。',
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/operation-summary') {
      const leads = await loadLeadsForApi('GET /api/operation-summary');
      const analytics = buildSalesAnalytics(leads);
      const summary = buildOperationSummary(analytics);
      sendJson(res, 200, {
        summary,
        generatedAt: new Date().toISOString(),
        leadsPath,
        note: 'ローカルJSONの手動記録のみをもとにしたルールベース提案。AI APIは使用していません。',
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/mvp-readiness') {
      const result = await checkLocalMvpReadiness();
      sendJson(res, 200, { ...result, generatedAt: new Date().toISOString(), leadsPath });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/pilot-summary') {
      const leads = await loadLeadsForApi('GET /api/pilot-summary');
      const summary = buildPilotSummary(leads);
      sendJson(res, 200, {
        summary,
        generatedAt: new Date().toISOString(),
        leadsPath,
        note: 'パイロット運用サマリー。ローカルJSONのみ。外部API/Gmail/自動送信は使用していません。',
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/contact-path-analytics') {
      const leads = await loadLeadsForApi('GET /api/contact-path-analytics');
      const analytics = buildContactPathAnalytics(leads);
      sendJson(res, 200, {
        analytics,
        generatedAt: new Date().toISOString(),
        leadsPath,
        note: analytics.note,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/sales-dashboard') {
      const leads = await loadLeadsForApi('GET /api/sales-dashboard');
      const offer = await loadOfferProfile();
      const dashboard = buildSalesDashboard(leads, offer);
      sendJson(res, 200, {
        ...dashboard,
        generatedAt: new Date().toISOString(),
        leadsPath,
        note: '見える化のみ。Gmail API・自動送信は使用していません。秘密情報は含みません。',
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/gmail-draft-candidates') {
      const leads = await loadLeadsForApi('GET /api/gmail-draft-candidates');
      const offer = await loadOfferProfile();
      const targets = selectGmailDraftTabLeads(leads, offer);
      sendJson(res, 200, {
        candidates: targets.map((lead) => ({
          ...buildEmailOutreachCandidateView(lead, offer),
          ...buildGmailDraftPreviewForLead(lead, offer),
        })),
        totalCount: targets.length,
        pendingReviewCount: targets.filter((l) => l.humanReviewStatus === 'pending').length,
        readyCount: targets.filter((l) => l.humanReviewStatus === 'approved').length,
        generatedAt: new Date().toISOString(),
        leadsPath,
        note: '承認後に CREATE_DRAFTS で1社ずつ Gmail 下書きを作成します。送信は行いません。',
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/signature-refresh-preview') {
      const preview = await previewUnsentSignatureRefresh();
      sendJson(res, 200, {
        targets: preview,
        totalCount: preview.length,
        generatedAt: new Date().toISOString(),
        leadsPath,
        note: '未送信 Lead の emailBody 署名のみ更新。送信済み Lead は変更しません。',
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/refresh-unsent-signatures') {
      const result = await refreshUnsentLeadSignatures();
      sendJson(res, 200, {
        ...result,
        refreshedCount: result.refreshed.length,
        generatedAt: new Date().toISOString(),
        leadsPath,
        message:
          '未送信 Lead の署名を更新しました。Gmail API は呼び出していません。送信済み Lead は変更していません。',
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/send-record-pending') {
      const leads = await loadLeadsForApi('GET /api/send-record-pending');
      const pending = leads
        .filter(isPendingGmailSendRecordLead)
        .map((lead) => buildManualGmailSendPreview(lead));
      sendJson(res, 200, {
        pending,
        generatedAt: new Date().toISOString(),
        leadsPath,
        note: 'Gmail手動送信の事後記録対象。メール送信は行いません。',
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/storage-status') {
      sendJson(res, 200, {
        ...buildGrowlyStorageStatusPayload(),
        generatedAt: new Date().toISOString(),
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/daily30-ready-for-draft') {
      const candidates = await loadExternalCandidatesFromJson();
      const leads = await loadLeadsOptionalForDaily30();
      sendJson(res, 200, buildDaily30ReadyForDraftApiPayload(candidates, leads));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/daily30-import-draft-candidates') {
      const body = await readJsonBody<{ confirmToken?: string }>(req);
      if (body.confirmToken?.trim() !== IMPORT_DAILY_30_DRAFT_CANDIDATES_CONFIRM_TOKEN) {
        sendApiError(
          res,
          403,
          pathname,
          `確認トークンが必要です: ${IMPORT_DAILY_30_DRAFT_CANDIDATES_CONFIRM_TOKEN}`
        );
        return;
      }
      try {
        const result = await importDaily30DraftCandidatesBulk({
          confirmToken: body.confirmToken?.trim(),
        });
        const candidates = await loadExternalCandidatesFromJson();
        const leads = await loadLeadsForApi('POST /api/daily30-import-draft-candidates');
        const draftPipeline = buildDaily30DraftPipelineProgress(candidates, leads);
        sendJson(res, 200, {
          ...result,
          draftPipeline,
          generatedAt: new Date().toISOString(),
          message: `一括取り込み完了: ${result.imported.length} 件（Gmail下書きは作成していません）`,
        });
      } catch (err) {
        sendApiError(
          res,
          400,
          pathname,
          err instanceof Error ? err.message : 'Daily 30 bulk import failed'
        );
      }
      return;
    }

    const externalImportDraftMatch = pathname.match(
      /^\/api\/external-candidates\/([^/]+)\/import-as-draft-candidate$/
    );
    if (req.method === 'POST' && externalImportDraftMatch) {
      const externalCandidateId = decodeURIComponent(externalImportDraftMatch[1]);
      try {
        const { lead, candidate } = await importDaily30DraftCandidateAsLead(externalCandidateId);
        sendJson(res, 200, { lead, candidate });
      } catch (err) {
        sendApiError(
          res,
          400,
          pathname,
          err instanceof Error ? err.message : 'Import as draft candidate failed'
        );
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/daily30-lead-candidates') {
      const candidates = await loadExternalCandidatesFromJson();
      const leads = await loadLeadsOptionalForDaily30();
      const reviewCandidates = selectDaily30LeadReviewCandidates(candidates);
      const approvalPending = selectDaily30LeadApprovalPending(candidates);
      const approvedForLead = candidates.filter((c) => c.importStatus === 'approved_for_lead');
      const approvalBlockHints = buildDaily30LeadApprovalBlockHints(
        [...approvalPending, ...reviewCandidates],
        leads,
        candidates
      );
      sendJson(res, 200, {
        reviewCandidates,
        approvalPending,
        approvedForLead,
        approvalBlockHints,
        generatedAt: new Date().toISOString(),
        note: 'Lead化候補一覧。leads.json への自動取り込みは行いません。',
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/daily30-generate-copy') {
      const body = await readJsonBody<{ confirmToken?: string }>(req);
      if (body.confirmToken?.trim() !== GENERATE_DAILY_30_COPY_CONFIRM_TOKEN) {
        sendApiError(
          res,
          403,
          pathname,
          `確認トークンが必要です: ${GENERATE_DAILY_30_COPY_CONFIRM_TOKEN}`
        );
        return;
      }
      try {
        const leads = await loadLeadsOptionalForDaily30();
        const { stats } = await runDaily30CopyPipeline();
        const candidates = await loadExternalCandidatesFromJson();
        const dashboard = buildDaily30Dashboard(candidates, leads);
        sendJson(res, 200, {
          stats,
          dashboard,
          generatedAt: new Date().toISOString(),
          message:
            '営業文生成・品質チェック完了。Gmail送信・下書き作成は行っていません。',
        });
      } catch (err) {
        sendApiError(
          res,
          500,
          pathname,
          err instanceof Error ? err.message : 'Daily 30 copy generation failed'
        );
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/daily30-dashboard') {
      const leads = await loadLeadsOptionalForDaily30();
      const cloudDashboard = await buildDaily30CloudDashboardPayload(leads);
      const candidates = cloudDashboard.candidates;
      const cloudRunEntry = await getCloudRunEntryForBatch(cloudDashboard.batchId);
      const dashboard = buildDaily30Dashboard(
        candidates,
        leads,
        cloudDashboard.batchId,
        cloudRunEntry
      );
      const draftPipeline = buildDaily30DraftPipelineProgress(candidates, leads, dashboard.batchId);
      const operations = buildDaily30OperationsSummary(candidates, leads, dashboard.batchId);
      const plan = buildDaily30FetchPlan();
      sendJson(res, 200, {
        ...cloudDashboard,
        dashboard,
        draftPipeline,
        operations,
        areaExpansion: describeDaily30AreaExpansion(),
        plan,
        generatedAt: new Date().toISOString(),
        note: 'Daily 30 集計。Gmail送信・下書き自動作成は行いません。',
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/daily30-fetch') {
      const body = await readJsonBody<{ confirmToken?: string }>(req);
      if (body.confirmToken?.trim() !== FETCH_DAILY_30_CONFIRM_TOKEN) {
        sendApiError(res, 403, pathname, `確認トークンが必要です: ${FETCH_DAILY_30_CONFIRM_TOKEN}`);
        return;
      }
      if (!isExternalFetchConfigured()) {
        sendApiError(
          res,
          400,
          pathname,
          '外部API未設定。API_PRODUCTION_ENABLED と Places/Web Search キーが必要です。'
        );
        return;
      }
      try {
        const leads = await loadLeadsForApi('POST /api/daily30-fetch');
        const profile = await loadTargetProfile();
        const existing = await loadExternalCandidatesFromJson();
        const { candidates, stats } = await fetchDaily30Candidates(profile, leads, existing, {
          verifyEmails: true,
        });
        await persistExternalCandidates(candidates);
        const dashboard = buildDaily30Dashboard(candidates, leads, stats.batchId);
        sendJson(res, 200, {
          stats,
          dashboard,
          generatedAt: new Date().toISOString(),
          message: 'Daily 30 収集完了。Gmail送信・下書き作成は行っていません。',
        });
      } catch (err) {
        sendApiError(
          res,
          500,
          pathname,
          err instanceof Error ? err.message : 'Daily 30 fetch failed'
        );
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/external-candidates') {
      const candidates = await loadExternalCandidatesFromJson();
      sendJson(res, 200, {
        candidates,
        generatedAt: new Date().toISOString(),
        note: '外部候補一覧。自動Lead化・自動送信は行いません。',
      });
      return;
    }

    const externalApproveForLeadMatch = pathname.match(
      /^\/api\/external-candidates\/([^/]+)\/approve-for-lead$/
    );
    if (req.method === 'POST' && externalApproveForLeadMatch) {
      const externalCandidateId = decodeURIComponent(externalApproveForLeadMatch[1]);
      try {
        const candidate = await approveExternalCandidateForLead(externalCandidateId);
        sendJson(res, 200, { candidate });
      } catch (err) {
        sendApiError(
          res,
          400,
          pathname,
          err instanceof Error ? err.message : 'Lead approval failed'
        );
      }
      return;
    }

    const externalApproveMatch = pathname.match(
      /^\/api\/external-candidates\/([^/]+)\/approve-for-import$/
    );
    if (req.method === 'POST' && externalApproveMatch) {
      const externalCandidateId = decodeURIComponent(externalApproveMatch[1]);
      try {
        const candidate = await approveExternalCandidateForImport(externalCandidateId);
        sendJson(res, 200, { candidate });
      } catch (err) {
        sendApiError(
          res,
          400,
          pathname,
          err instanceof Error ? err.message : 'Approve failed'
        );
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/export-drafts') {
      const leads = await loadLeadsForApi('POST /api/export-drafts');
      const offer = await loadOfferProfile();
      const exportResult = await exportDraftCandidates(leads, offer);
      const payload = buildDraftCandidatesPayload(leads, offer, exportResult.exportedAt);
      sendJson(res, 200, {
        ...payload,
        leadsPath,
        outputFiles: exportResult.outputFiles,
        message:
          '下書きファイルを再生成しました。Gmail APIは使用していません。sendStatusは変更していません。',
      });
      return;
    }

    const actionMatch = matchLeadAction(pathname);
    if (req.method === 'POST' && actionMatch) {
      const { leadId, action } = actionMatch;
      let lead;

      switch (action) {
        case 'approve':
          lead = await approveLeadForDraft(leadId, getLeadsJsonPath(), '下書き候補タブ');
          break;
        case 'needs-revision': {
          const body = await readJsonBody<{ comment?: string }>(req);
          lead = await markLeadNeedsRevision(leadId, body.comment ?? '');
          break;
        }
        case 'reject': {
          const body = await readJsonBody<{ reason?: string }>(req);
          lead = await rejectLead(leadId, body.reason ?? '');
          break;
        }
        case 'do-not-contact': {
          const body = await readJsonBody<{ reason?: string }>(req);
          lead = await markDoNotContact(leadId, body.reason ?? '');
          break;
        }
        case 'email-draft': {
          const body = await readJsonBody<{
            emailSubject: string;
            emailBody: string;
            reviewComment?: string;
            nextAction?: string;
          }>(req);
          lead = await updateLeadEmailDraft(leadId, body);
          break;
        }
        default:
          sendApiError(res, 404, pathname, 'Not found');
          return;
      }

      sendJson(res, 200, { lead });
      return;
    }

    const commMatch = matchCommunicationAction(pathname);
    if (req.method === 'POST' && commMatch) {
      const { leadId, action } = commMatch;
      const body = await readJsonBody<Record<string, unknown>>(req);

      try {
        switch (action) {
          case 'manual-sent': {
            const method = String(body.method ?? 'other');
            const sentAt = body.sentAt ? String(body.sentAt) : undefined;
            const memo = body.memo ? String(body.memo) : undefined;
            const lead = await markManualSent(leadId, method as any, sentAt ?? undefined, memo);
            sendJson(res, 200, { lead });
            return;
          }
          case 'reply-status': {
            const replyStatus = String(body.replyStatus ?? 'none');
            const memo = body.memo ? String(body.memo) : undefined;
            const lead = await markReplyStatus(leadId, replyStatus as any, memo);
            sendJson(res, 200, { lead });
            return;
          }
          case 'reply-management': {
            const repliedAtRaw = body.repliedAt;
            const followUpRaw = body.followUpDueAt;
            const lead = await updateLeadReplyManagement(leadId, {
              replyStatus: body.replyStatus ? (String(body.replyStatus) as any) : undefined,
              replySummary: body.replySummary !== undefined ? String(body.replySummary) : undefined,
              nextAction: body.nextAction !== undefined ? String(body.nextAction) : undefined,
              repliedAt:
                repliedAtRaw === undefined
                  ? undefined
                  : repliedAtRaw === null || repliedAtRaw === ''
                    ? null
                    : String(repliedAtRaw),
              followUpDueAt:
                followUpRaw === undefined
                  ? undefined
                  : followUpRaw === null || followUpRaw === ''
                    ? null
                    : String(followUpRaw),
            });
            sendJson(res, 200, { lead });
            return;
          }
          case 'follow-up': {
            const followUpDate = String(body.followUpDate ?? '');
            const memo = body.memo ? String(body.memo) : undefined;
            const lead = await markFollowUpNeeded(leadId, followUpDate, memo);
            sendJson(res, 200, { lead });
            return;
          }
          case 'deal-status': {
            const dealStatus = String(body.dealStatus ?? 'none');
            const memo = body.memo ? String(body.memo) : undefined;
            const lead = await markDealStatus(leadId, dealStatus as any, memo);
            sendJson(res, 200, { lead });
            return;
          }
          case 'communication-memo': {
            const memo = String(body.memo ?? '');
            const lead = await updateCommunicationMemo(leadId, memo);
            sendJson(res, 200, { lead });
            return;
          }
          case 'record-manual-gmail-sent': {
            const draftId = String(body.draftId ?? '').trim();
            if (!draftId) {
              sendApiError(res, 400, pathname, 'draftId が必要です');
              return;
            }
            const result = await recordManualGmailSent(leadId, { draftId });
            sendJson(res, 200, {
              lead: result.lead,
              preview: result.preview,
              message:
                'Gmail手動送信を記録しました。メール送信は行っていません。',
            });
            return;
          }
          case 'create-gmail-draft': {
            const createDraftsGate = String(body.createDraftsGate ?? '');
            const result = await createGmailDraftForLead(leadId, createDraftsGate);
            sendJson(res, 200, result);
            return;
          }
          default:
            sendApiError(res, 404, pathname, 'Not found');
            return;
        }
      } catch (err) {
        if (err instanceof GmailLeadNotFoundError) {
          sendApiError(res, 404, pathname, err.message, leadsPath);
          return;
        }
        if (err instanceof ManualGmailSendRecordError) {
          sendApiError(res, 400, pathname, err.message, leadsPath);
          return;
        }
        if (err instanceof CreateDraftsGateError) {
          sendApiError(res, 400, pathname, err.message, leadsPath);
          return;
        }
        if (err instanceof GmailDraftCreateNotAllowedError) {
          sendApiError(res, 400, pathname, err.message, leadsPath);
          return;
        }
        if (err instanceof ReplyManagementNotAllowedError || err instanceof ReplyManagementValidationError) {
          sendApiError(res, 400, pathname, err.message, leadsPath);
          return;
        }
        // ManualSendNotAllowedError など
        sendApiError(res, 400, pathname, err instanceof Error ? err.message : 'Invalid request', leadsPath);
        return;
      }
    }

    if (req.method === 'GET') {
      const isCloudRun = Boolean(process.env.K_SERVICE?.trim());
      const apiOnly =
        process.env.GROWLY_CLOUD_RUN_API_ONLY === 'true' ||
        (isCloudRun &&
          process.env.NODE_ENV === 'production' &&
          process.env.GROWLY_STORAGE_BACKEND?.trim().toLowerCase() === 'gcs');

      if (pathname === '/' && apiOnly) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(
          'Growly Sales Daily 30 Cloud API is running.\nUse /api/cloud/daily30/status or /api/cloud/daily30/auto-fetch.\n'
        );
        return;
      }
      if (pathname === '/' || pathname === '/index.html') {
        await serveStatic(res, join(UI_DIST, 'index.html'), 'text/html; charset=utf-8');
        return;
      }
      if (pathname.startsWith('/assets/')) {
        const assetPath = join(UI_DIST, pathname.slice(1));
        const ext = pathname.split('.').pop() ?? '';
        const types: Record<string, string> = {
          js: 'application/javascript',
          css: 'text/css',
          svg: 'image/svg+xml',
        };
        await serveStatic(res, assetPath, types[ext] ?? 'application/octet-stream');
        return;
      }
    }

    sendApiError(res, 404, pathname, 'Not found');
  } catch (err) {
    if (err instanceof LeadNotFoundError) {
      sendApiError(res, 404, pathname, err.message);
      return;
    }
    if (err instanceof LeadsFileNotFoundError) {
      sendApiError(res, 404, err.api, err.message, err.path, 'npm run growly-sales:day1 を実行するか、パスを確認してください');
      return;
    }
    if (err instanceof Daily30GcsReadError) {
      sendApiError(
        res,
        503,
        pathname,
        err.message,
        undefined,
        'gcloud auth application-default login と GROWLY_GCS_* 設定を確認してください'
      );
      return;
    }
    console.error(`[${pathname}]`, err);
    sendApiError(
      res,
      500,
      pathname,
      err instanceof Error ? err.message : 'Internal error',
      leadsPath
    );
  }
}

export function startUiServer(): void {
  const info = getGrowlySalesPathInfo();

  const server = createServer((req, res) => {
    void handleUiRequest(req, res);
  });

  server.listen(PORT, () => {
    console.log('Growly Sales UI Server');
    console.log(`  URL:          http://localhost:${PORT}`);
    console.log(`  Project root: ${info.projectRoot}`);
    console.log(`  Leads path:   ${info.leadsPath}`);
    console.log(`  Drafts path:  ${info.draftsDir}`);
    console.log(`  CWD:          ${info.cwd}`);
    console.log(`  Reply API:    ${REPLY_MANAGEMENT_API_STATUSES.join(', ')}`);
    console.log('  自動送信なし / ローカルJSON保存のみ');
  });
}
