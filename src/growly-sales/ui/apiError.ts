/** API エラー応答の共通型（UI表示用） */
export interface ApiErrorResponse {
  error: string;
  api: string;
  path?: string;
  detail?: string;
}

export function parseApiError(
  api: string,
  status: number,
  body: unknown,
  fallbackMessage: string
): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = body as ApiErrorResponse;
    const parts = [
      err.error || fallbackMessage,
      err.api ? `API: ${err.api}` : `API: ${api}`,
    ];
    if (err.path) parts.push(`パス: ${err.path}`);
    if (err.detail) parts.push(err.detail);
    return parts.join(' — ');
  }
  return `${fallbackMessage} (HTTP ${status}, API: ${api})`;
}

export async function readApiError(res: Response, api: string, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return parseApiError(api, res.status, body, fallback);
  } catch {
    return `${fallback} (HTTP ${res.status}, API: ${api})`;
  }
}
