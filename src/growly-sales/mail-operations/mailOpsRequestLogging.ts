export const MAIL_OPS_SERVICE_NAME = 'growly-sales-mail-ops';

const TOKEN_ROUTE_RE = /^\/u\/([^/]+)$/;

export function normalizeMailOpsRouteTemplate(method: string, pathname: string): string | null {
  if (pathname === '/health') return 'GET /health';
  if (TOKEN_ROUTE_RE.test(pathname)) {
    const verb = method.toUpperCase();
    if (verb === 'GET' || verb === 'POST') {
      return `${verb} /u/:token`;
    }
  }
  return null;
}

export function tokenHashPrefixFromRawToken(token: string): string | undefined {
  const trimmed = token.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 4);
}

export function logMailOpsRequest(input: {
  method: string;
  pathname: string;
  status: number;
  durationMs: number;
  correlationId: string;
  screenState?: string;
  tokenHashPrefix?: string;
}): void {
  const routeTemplate = normalizeMailOpsRouteTemplate(input.method, input.pathname);
  const parts = [
    '[mail-ops]',
    `correlationId=${input.correlationId}`,
    routeTemplate ? `route=${routeTemplate}` : `route=unknown`,
    `status=${input.status}`,
    `durationMs=${input.durationMs}`,
    input.screenState ? `screenState=${input.screenState}` : null,
    input.tokenHashPrefix ? `tokenPrefix=${input.tokenHashPrefix}` : null,
  ].filter(Boolean);
  console.info(parts.join(' '));
}
