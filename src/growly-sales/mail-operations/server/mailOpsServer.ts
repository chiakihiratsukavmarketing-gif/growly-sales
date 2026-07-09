import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { logMailOpsRequest } from '../mailOpsRequestLogging.js';
import {
  createMailOpsServerContext,
  getMailOpsServerContext,
  type MailOpsServerContext,
} from './mailOpsServerContext.js';

const PORT = Number(process.env.PORT ?? process.env.GROWLY_UI_PORT ?? 8080);

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text, 'utf-8'),
  });
  res.end(text);
}

function parsePathname(req: IncomingMessage): string {
  const url = req.url ?? '/';
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

function buildTemporaryErrorResponse(liveConnected: boolean) {
  return {
    ok: false,
    screenState: 'temporary_error' as const,
    isMock: false,
    liveConnected,
  };
}

async function handleHealth(res: ServerResponse, ctx: MailOpsServerContext): Promise<void> {
  const health = ctx.buildHealth();
  sendJson(res, ctx.healthHttpStatus(health), health);
}

async function handleUnsubscribe(
  res: ServerResponse,
  token: string,
  method: 'GET' | 'POST',
  ctx: MailOpsServerContext
): Promise<{ status: number; screenState?: string }> {
  const config = ctx.loadConfig();
  const readiness = ctx.validateReadiness(config);

  if (config.mode === 'mock') {
    const payload =
      method === 'GET'
        ? await ctx.getMockUnsubscribeScreen(token)
        : await ctx.postMockUnsubscribeScreen(token);
    const status =
      payload.ok ? 200 : method === 'GET' && payload.screenState === 'invalid_or_expired' ? 404 : 200;
    sendJson(res, status, payload);
    return { status, screenState: payload.screenState };
  }

  if (!ctx.canProcessUnsubscribe(config, readiness)) {
    const liveConnected = ctx.isLiveConnected(config, readiness);
    sendJson(res, 503, buildTemporaryErrorResponse(liveConnected));
    return { status: 503, screenState: 'temporary_error' };
  }

  const payload =
    method === 'GET'
      ? await ctx.getLiveUnsubscribeScreen(token)
      : await ctx.postLiveUnsubscribeScreen(token);
  const status =
    payload.screenState === 'temporary_error'
      ? 503
      : payload.screenState === 'invalid_or_expired'
        ? 404
        : 200;
  sendJson(res, status, payload);
  return { status, screenState: payload.screenState };
}

export async function handleMailOpsRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: MailOpsServerContext = getMailOpsServerContext()
): Promise<void> {
  const started = Date.now();
  const correlationId = randomUUID();
  const method = req.method ?? 'GET';
  const pathname = parsePathname(req);

  try {
    if (method === 'GET' && pathname === '/health') {
      await handleHealth(res, ctx);
      logMailOpsRequest({
        method,
        pathname,
        status: res.statusCode || 200,
        durationMs: Date.now() - started,
        correlationId,
      });
      return;
    }

    const tokenMatch = pathname.match(/^\/u\/([^/]+)$/);
    if (tokenMatch) {
      if (method === 'GET' || method === 'POST') {
        const token = decodeURIComponent(tokenMatch[1]);
        const result = await handleUnsubscribe(res, token, method, ctx);
        logMailOpsRequest({
          method,
          pathname,
          status: result.status,
          durationMs: Date.now() - started,
          correlationId,
          screenState: result.screenState,
        });
        return;
      }
    }

    sendJson(res, 404, { ok: false, error: 'not_found' });
    logMailOpsRequest({
      method,
      pathname,
      status: 404,
      durationMs: Date.now() - started,
      correlationId,
    });
  } catch {
    sendJson(res, 500, { ok: false, error: 'internal_error' });
    logMailOpsRequest({
      method,
      pathname,
      status: 500,
      durationMs: Date.now() - started,
      correlationId,
    });
  }
}

export function startMailOpsServer(ctx?: MailOpsServerContext): void {
  const context = ctx ?? createMailOpsServerContext();
  const server = createServer((req, res) => {
    void handleMailOpsRequest(req, res, context);
  });
  server.listen(PORT, () => {
    const health = context.buildHealth();
    console.info(
      `[mail-ops] listening on port ${PORT} mode=${health.mode} liveConnected=${health.liveConnected}`
    );
  });
}
