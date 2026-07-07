import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { getMailOpsMode } from './suppressionPolicy.js';
import {
  getMockUnsubscribeScreen,
  postMockUnsubscribeScreen,
} from './mockUnsubscribeScreen.js';
import { isMailOpsStorageReady } from './createMailSuppressionStore.js';
import { MAIL_OPS_SERVICE_NAME } from './mailOpsRequestLogging.js';
import { logMailOpsRequest, tokenHashPrefixFromRawToken } from './mailOpsRequestLogging.js';

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

async function handleHealth(res: ServerResponse): Promise<void> {
  const mode = getMailOpsMode();
  const storageReady = isMailOpsStorageReady(mode);
  const ok = mode === 'mock' ? true : storageReady;
  const status = ok ? 200 : 503;
  sendJson(res, status, {
    ok,
    service: MAIL_OPS_SERVICE_NAME,
    mode,
    storageReady,
  });
}

async function handleUnsubscribe(
  req: IncomingMessage,
  res: ServerResponse,
  token: string,
  method: 'GET' | 'POST'
): Promise<void> {
  const mode = getMailOpsMode();
  if (mode === 'live' && !isMailOpsStorageReady('live')) {
    sendJson(res, 503, {
      ok: false,
      screenState: 'temporary_error',
      isMock: false,
      liveConnected: false,
    });
    return;
  }

  if (mode === 'mock') {
    const payload =
      method === 'GET'
        ? await getMockUnsubscribeScreen(token)
        : await postMockUnsubscribeScreen(token);
    sendJson(res, payload.ok ? 200 : method === 'GET' && payload.screenState === 'invalid_or_expired' ? 404 : 200, payload);
    return;
  }

  sendJson(res, 503, {
    ok: false,
    screenState: 'temporary_error',
    isMock: false,
    liveConnected: false,
  });
}

export async function handleMailOpsRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const started = Date.now();
  const correlationId = randomUUID();
  const method = req.method ?? 'GET';
  const pathname = parsePathname(req);

  try {
    if (method === 'GET' && pathname === '/health') {
      await handleHealth(res);
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
      const token = decodeURIComponent(tokenMatch[1]);
      if (method === 'GET' || method === 'POST') {
        await handleUnsubscribe(req, res, token, method);
        logMailOpsRequest({
          method,
          pathname,
          status: res.statusCode || 200,
          durationMs: Date.now() - started,
          correlationId,
          tokenHashPrefix: tokenHashPrefixFromRawToken(token),
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

export function startMailOpsServer(): void {
  const server = createServer((req, res) => {
    void handleMailOpsRequest(req, res);
  });
  server.listen(PORT, () => {
    console.info(`[mail-ops] listening on port ${PORT} mode=${getMailOpsMode()}`);
  });
}
