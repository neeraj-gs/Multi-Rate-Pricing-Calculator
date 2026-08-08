import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import type { output, ZodTypeAny } from 'zod';

import { connectToDatabase, IdempotencyKey } from '@/lib/db';
import { getSession, type SessionPayload } from '@/lib/auth/session';
import { ApiError, toApiError } from './errors';
import { buildRequestContext, logRequest, type RequestContext } from './context';
import { checkRateLimit, RATE_LIMITS } from './rate-limit';

/**
 * One wrapper that every route handler goes through.
 *
 * Concentrating the cross-cutting concerns here — connection, auth, rate
 * limiting, validation, idempotency, error shaping, logging — means an
 * individual route contains only its own business logic, and means none of
 * those concerns can be *forgotten* on a new endpoint. Auth in particular:
 * `auth` defaults to required, so a route is protected unless someone opts out
 * explicitly and visibly. Security that has to be remembered eventually is not.
 */

/**
 * Types flow *out of* the Zod schemas rather than being declared alongside
 * them. A handler's `body`, `query` and `params` are inferred from the schemas
 * on the same config object, so the validated shape and the type the handler
 * sees cannot drift apart — and adding a field to a schema immediately types it
 * in the handler with no second declaration to update.
 */
type Parsed<S> = S extends ZodTypeAny ? output<S> : Record<string, string>;

export interface RouteHandlerArgs<BS, QS, PS> {
  request: NextRequest;
  body: BS extends ZodTypeAny ? output<BS> : undefined;
  query: Parsed<QS>;
  params: Parsed<PS>;
  session: SessionPayload;
  /** `session.sub`, hoisted because every query is scoped by it. */
  userId: string;
  ctx: RequestContext;
}

export interface RouteConfig<
  BS extends ZodTypeAny | undefined,
  QS extends ZodTypeAny | undefined,
  PS extends ZodTypeAny | undefined,
> {
  /** Defaults to `true`. Set `false` only for genuinely public endpoints. */
  auth?: boolean;
  body?: BS;
  query?: QS;
  params?: PS;
  rateLimit?: { limit: number; windowMs: number } | false;
  /**
   * Honour an `Idempotency-Key` header. Enable on any endpoint where a retried
   * request must not create a second thing.
   */
  idempotent?: boolean;
  successStatus?: number;
  handler: (args: RouteHandlerArgs<BS, QS, PS>) => Promise<unknown>;
}

/** Request bodies are capped well below anything a real document needs. */
const MAX_BODY_BYTES = 512 * 1024;

export function defineRoute<
  BS extends ZodTypeAny | undefined = undefined,
  QS extends ZodTypeAny | undefined = undefined,
  PS extends ZodTypeAny | undefined = undefined,
>(config: RouteConfig<BS, QS, PS>) {
  type Args = RouteHandlerArgs<BS, QS, PS>;
  return async function route(
    request: NextRequest,
    segment?: { params?: Promise<Record<string, string>> },
  ): Promise<NextResponse> {
    const ctx = buildRequestContext(request);
    const method = request.method;
    const path = new URL(request.url).pathname;
    let userId: string | null = null;

    try {
      await connectToDatabase();

      // ---- Authentication ------------------------------------------------
      const requiresAuth = config.auth !== false;
      let session: SessionPayload | null = await getSession();
      if (requiresAuth && !session) {
        throw ApiError.unauthenticated();
      }
      userId = session?.sub ?? null;

      // ---- Rate limiting -------------------------------------------------
      if (config.rateLimit !== false) {
        const policy =
          config.rateLimit ??
          (method === 'GET' || method === 'HEAD' ? RATE_LIMITS.read : RATE_LIMITS.write);
        // Keyed by account when signed in, by IP otherwise: one noisy user must
        // not be able to lock out everyone behind the same corporate NAT.
        const key = `${path}:${userId ?? ctx.ip}`;
        const result = checkRateLimit(key, policy.limit, policy.windowMs);
        if (!result.allowed) {
          throw new ApiError(
            429,
            'RATE_LIMITED',
            'Too many requests. Please slow down and try again shortly.',
            [],
            {
              'Retry-After': String(result.retryAfterSeconds),
              'X-RateLimit-Limit': String(result.limit),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(result.resetAt),
            },
          );
        }
      }

      // ---- Input validation ----------------------------------------------
      const rawParams = segment?.params ? await segment.params : {};
      const params = (
        config.params ? config.params.parse(rawParams) : rawParams
      ) as Args['params'];

      const searchParams = Object.fromEntries(new URL(request.url).searchParams);
      const query = (
        config.query ? config.query.parse(searchParams) : searchParams
      ) as Args['query'];

      let body = undefined as Args['body'];
      let rawBodyText = '';
      if (config.body) {
        rawBodyText = await readBody(request);
        let parsed: unknown;
        try {
          parsed = rawBodyText === '' ? {} : JSON.parse(rawBodyText);
        } catch {
          throw ApiError.badRequest('Request body is not valid JSON.');
        }
        body = config.body.parse(parsed) as Args['body'];
      }

      // ---- Idempotency -----------------------------------------------------
      const idempotencyKey = config.idempotent
        ? request.headers.get('idempotency-key')?.trim()
        : null;

      if (idempotencyKey && session) {
        const fingerprint = createHash('sha256')
          .update(`${method}:${path}:${rawBodyText}`)
          .digest('hex');

        const replay = await claimIdempotencyKey({
          userId: session.sub,
          key: idempotencyKey,
          endpoint: `${method} ${path}`,
          fingerprint,
        });

        if (replay) {
          logRequest({ context: ctx, method, path, status: replay.status, userId });
          return NextResponse.json(replay.body, {
            status: replay.status,
            headers: { 'Idempotent-Replay': 'true', 'X-Request-Id': ctx.requestId },
          });
        }

        const result = await config.handler({
          request,
          body,
          query,
          params,
          session: session!,
          userId: session.sub,
          ctx,
        });

        if (result instanceof NextResponse) {
          logRequest({ context: ctx, method, path, status: result.status, userId });
          return result;
        }

        const status = config.successStatus ?? 200;
        await IdempotencyKey.updateOne(
          { userId: session.sub, key: idempotencyKey },
          { $set: { status: 'completed', responseStatus: status, responseBody: result } },
        );

        logRequest({ context: ctx, method, path, status, userId });
        return NextResponse.json(result, {
          status,
          headers: { 'X-Request-Id': ctx.requestId },
        });
      }

      // ---- Handler ---------------------------------------------------------
      const result = await config.handler({
        request,
        body,
        query,
        params,
        session: session!,
        userId: session?.sub ?? '',
        ctx,
      });

      if (result instanceof NextResponse) {
        logRequest({ context: ctx, method, path, status: result.status, userId });
        result.headers.set('X-Request-Id', ctx.requestId);
        return result;
      }

      const status = config.successStatus ?? 200;
      logRequest({ context: ctx, method, path, status, userId });
      return NextResponse.json(result, {
        status,
        headers: { 'X-Request-Id': ctx.requestId },
      });
    } catch (error) {
      const apiError = toApiError(error);

      // Unexpected failures get the stack in the server log; the client gets a
      // generic message, so an internal error never leaks a query or a path.
      if (apiError.status >= 500) {
        console.error('[api] unhandled error', {
          requestId: ctx.requestId,
          path,
          error,
        });
      }

      logRequest({
        context: ctx,
        method,
        path,
        status: apiError.status,
        userId,
        errorCode: apiError.code,
        message: apiError.message,
      });

      return NextResponse.json(
        {
          error: {
            code: apiError.code,
            message: apiError.message,
            details: apiError.details,
            requestId: ctx.requestId,
          },
        },
        {
          status: apiError.status,
          headers: { ...(apiError.headers ?? {}), 'X-Request-Id': ctx.requestId },
        },
      );
    }
  };
}

async function readBody(request: NextRequest): Promise<string> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }
  return text;
}

interface ReplayedResponse {
  status: number;
  body: unknown;
}

/**
 * Claims an idempotency key, or returns the stored response for a replay.
 *
 * The claim is a single insert against a unique index, so two concurrent
 * retries cannot both succeed — the loser gets a duplicate-key error and is
 * routed into the replay path. Doing this as read-then-write would leave a
 * window where both requests see "not claimed" and both execute.
 */
async function claimIdempotencyKey(input: {
  userId: string;
  key: string;
  endpoint: string;
  fingerprint: string;
}): Promise<ReplayedResponse | null> {
  try {
    await IdempotencyKey.create({
      userId: input.userId,
      key: input.key,
      endpoint: input.endpoint,
      fingerprint: input.fingerprint,
      status: 'in_progress',
    });
    return null;
  } catch (error) {
    const isDuplicate =
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === 11000;
    if (!isDuplicate) throw error;
  }

  const existing = await IdempotencyKey.findOne({
    userId: input.userId,
    key: input.key,
  }).lean();

  if (!existing) return null;

  if (existing.fingerprint !== input.fingerprint) {
    throw ApiError.conflict(
      'IDEMPOTENCY_KEY_REUSED',
      'This Idempotency-Key was already used for a different request. Use a fresh key.',
    );
  }

  if (existing.status !== 'completed') {
    throw ApiError.conflict(
      'IDEMPOTENCY_IN_PROGRESS',
      'The original request is still being processed. Retry in a moment.',
    );
  }

  return { status: existing.responseStatus ?? 200, body: existing.responseBody };
}
