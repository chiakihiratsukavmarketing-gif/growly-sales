import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  assertDaily30CloudToken,
  Daily30CloudNotConfiguredError,
  Daily30CloudUnauthorizedError,
  extractDaily30CloudTokenFromHeaders,
  isDaily30CloudRunTokenConfigured,
} from '../config/daily30CloudAuth.js';
import {
  buildCloudAuthErrorResponse,
  buildDaily30CloudStatus,
  runDaily30CloudAutoFetch,
} from '../candidates/runDaily30CloudAutoFetch.js';

function sendCloudJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, x-growly-daily30-token',
  });
  res.end(JSON.stringify(data));
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

export async function handleDaily30CloudRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (pathname === '/api/cloud/daily30/status' && req.method === 'GET') {
    const status = await buildDaily30CloudStatus();
    sendCloudJson(res, 200, {
      ...status,
      generatedAt: new Date().toISOString(),
      note: 'Cloud Scheduler 用 API 状態。トークン値は返しません。',
    });
    return true;
  }

  if (pathname === '/api/cloud/daily30/auto-fetch' && req.method === 'POST') {
    if (!isDaily30CloudRunTokenConfigured()) {
      sendCloudJson(res, 503, buildCloudAuthErrorResponse('TOKEN_MISSING'));
      return true;
    }

    try {
      const token = extractDaily30CloudTokenFromHeaders(req.headers);
      assertDaily30CloudToken(token);
    } catch (err) {
      if (err instanceof Daily30CloudNotConfiguredError) {
        sendCloudJson(res, 503, buildCloudAuthErrorResponse('TOKEN_MISSING'));
        return true;
      }
      if (err instanceof Daily30CloudUnauthorizedError) {
        sendCloudJson(res, 401, buildCloudAuthErrorResponse('TOKEN_INVALID'));
        return true;
      }
      throw err;
    }

    const body = await readJsonBody<{ dryRun?: boolean; force?: boolean }>(req);
    const result = await runDaily30CloudAutoFetch({
      dryRun: body.dryRun === true,
      force: body.force === true,
    });

    const httpStatus =
      result.status === 'blocked' || result.status === 'failed'
        ? result.errorCode === 'DUPLICATE_GUARD_ALREADY_RAN'
          ? 200
          : result.status === 'failed'
            ? 500
            : 503
        : 200;
    sendCloudJson(res, httpStatus, result);
    return true;
  }

  return false;
}
