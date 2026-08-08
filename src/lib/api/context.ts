import type { NextRequest } from 'next/server';

export interface RequestContext {
  requestId: string;
  ip: string;
  userAgent: string;
  startedAt: number;
}

/**
 * A correlation id for one request.
 *
 * Prefers the platform-supplied header when there is one, so a log line here
 * can be joined to the same request in Vercel's own logs. Falls back to a
 * random id — `crypto.randomUUID` is available in both the Node and Edge
 * runtimes, so this works wherever the route happens to run.
 */
export function buildRequestContext(request: NextRequest): RequestContext {
  const forwarded = request.headers.get('x-forwarded-for');
  return {
    requestId:
      request.headers.get('x-vercel-id') ??
      request.headers.get('x-request-id') ??
      `req_${crypto.randomUUID()}`,
    // The left-most entry is the original client; everything after it is proxies.
    ip: forwarded?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown',
    userAgent: request.headers.get('user-agent')?.slice(0, 400) ?? '',
    startedAt: Date.now(),
  };
}

/**
 * Structured, one-line-per-request logging.
 *
 * JSON rather than prose because these lines are read by a log search, not by a
 * person scrolling a terminal. Nothing user-supplied beyond the path is logged,
 * so request bodies — which carry customer names and prices — never reach the
 * log store.
 */
export function logRequest(fields: {
  context: RequestContext;
  method: string;
  path: string;
  status: number;
  userId?: string | null;
  errorCode?: string;
  message?: string;
}): void {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    level: fields.status >= 500 ? 'error' : fields.status >= 400 ? 'warn' : 'info',
    requestId: fields.context.requestId,
    method: fields.method,
    path: fields.path,
    status: fields.status,
    durationMs: Date.now() - fields.context.startedAt,
    userId: fields.userId ?? null,
    errorCode: fields.errorCode,
    message: fields.message,
  });

  if (fields.status >= 500) console.error(line);
  else if (fields.status >= 400) console.warn(line);
  else console.log(line);
}
