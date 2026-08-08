/**
 * The browser's single door to the API.
 *
 * Every request goes through here so error handling is uniform: a failed call
 * throws an `ApiClientError` carrying the server's `code` and its field-level
 * `details`, which forms can attach straight to their inputs. Components never
 * inspect `response.ok` themselves.
 */

export interface ApiErrorDetail {
  path: string;
  message: string;
  code?: string;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetail[];
  readonly requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    details: ApiErrorDetail[] = [],
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** The message for a specific field, for inline form errors. */
  detailFor(path: string): string | undefined {
    return this.details.find((detail) => detail.path === path)?.message;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const { idempotencyKey, ...rest } = init;

  const response = await fetch(`/api${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      ...rest.headers,
    },
    // Same-origin credentials carry the httpOnly session cookie.
    credentials: 'same-origin',
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: { code: 'INTERNAL_ERROR', message: text.slice(0, 200) } };
    }
  }

  if (!response.ok) {
    const error = (payload as { error?: Record<string, unknown> })?.error ?? {};
    throw new ApiClientError(
      response.status,
      (error.code as string) ?? 'INTERNAL_ERROR',
      (error.message as string) ?? 'Something went wrong.',
      (error.details as ApiErrorDetail[]) ?? [],
      error.requestId as string | undefined,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown, idempotencyKey?: string) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
      idempotencyKey,
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** SWR fetcher. */
export const fetcher = <T>(path: string) => api.get<T>(path);

/**
 * A fresh idempotency key per user intent.
 *
 * Generated when the action starts and reused across retries of that same
 * action, so a double-click or a flaky connection cannot produce two documents.
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
