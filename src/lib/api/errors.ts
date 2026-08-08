import { ZodError } from 'zod';
import { PricingError, type PricingErrorCode } from '@/lib/pricing';

/**
 * One error envelope for the whole API.
 *
 * ```json
 * {
 *   "error": {
 *     "code": "VALIDATION_FAILED",
 *     "message": "One or more fields are invalid.",
 *     "details": [{ "path": "lines.0.quantity", "message": "Quantity must be at least 1." }],
 *     "requestId": "req_01HV…"
 *   }
 * }
 * ```
 *
 * `code` is stable and machine-readable — clients branch on it. `message` is
 * for humans and may be reworded. `details` carries field paths so a form can
 * attach each message to the input that caused it, which is the difference
 * between "something was wrong" and a red underline in the right place.
 */

export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DOCUMENT_FINALIZED'
  | 'REVISION_MISMATCH'
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'RATE_LIMITED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'UNPROCESSABLE'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR';

export interface ApiErrorDetail {
  path: string;
  message: string;
  code?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: ApiErrorDetail[];
  readonly headers?: Record<string, string>;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    details: ApiErrorDetail[] = [],
    headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }

  static badRequest(message: string, details: ApiErrorDetail[] = []) {
    return new ApiError(400, 'VALIDATION_FAILED', message, details);
  }
  static unauthenticated(message = 'You must be signed in to do that.') {
    return new ApiError(401, 'UNAUTHENTICATED', message);
  }
  static forbidden(message = 'You do not have access to this resource.') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Not found.') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(code: ApiErrorCode, message: string, details: ApiErrorDetail[] = []) {
    return new ApiError(409, code, message, details);
  }
  static unprocessable(message: string, details: ApiErrorDetail[] = []) {
    return new ApiError(422, 'UNPROCESSABLE', message, details);
  }
}

/**
 * Flattens a Zod error into field-level details.
 *
 * Zod nests issues by path segment; the UI wants a flat `lines.0.quantity`.
 */
export function fromZodError(error: ZodError): ApiError {
  const details: ApiErrorDetail[] = error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));

  const summary =
    details.length === 1 && details[0].path
      ? `${details[0].path}: ${details[0].message}`
      : `${details.length} field${details.length === 1 ? '' : 's'} failed validation.`;

  return new ApiError(400, 'VALIDATION_FAILED', summary, details);
}

/**
 * Maps a pricing-engine failure onto HTTP.
 *
 * Malformed input is a 400 — the client sent something that is not a number.
 * A rule violation such as "this fixed discount exceeds the line subtotal" is a
 * 422: the request was well-formed and understood, and was refused on its
 * merits. The distinction matters to a client deciding whether to retry.
 */
const PRICING_STATUS: Record<PricingErrorCode, number> = {
  INVALID_NUMBER: 400,
  PRECISION_EXCEEDED: 400,
  OUT_OF_RANGE: 400,
  NEGATIVE_NOT_ALLOWED: 400,
  QUANTITY_TOO_SMALL: 400,
  PERCENT_OUT_OF_RANGE: 400,
  DISCOUNT_CONFLICT: 400,
  UNSUPPORTED_CURRENCY: 400,
  DISCOUNT_EXCEEDS_SUBTOTAL: 422,
  AMOUNT_OVERFLOW: 422,
};

export function fromPricingError(error: PricingError): ApiError {
  const status = PRICING_STATUS[error.code] ?? 400;
  return new ApiError(
    status,
    status === 422 ? 'UNPROCESSABLE' : 'VALIDATION_FAILED',
    error.message,
    [{ path: error.path, message: error.message, code: error.code }],
  );
}

/** Normalises anything thrown inside a route into an `ApiError`. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof ZodError) return fromZodError(error);
  if (error instanceof PricingError) return fromPricingError(error);

  // Mongoose duplicate-key. The unique index is the authority on uniqueness —
  // a check-then-insert would race — so this path is the *expected* way a
  // collision surfaces, not an edge case.
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 11000
  ) {
    const keyPattern = (error as { keyPattern?: Record<string, number> }).keyPattern ?? {};
    if ('email' in keyPattern) {
      return new ApiError(409, 'EMAIL_TAKEN', 'An account with that email already exists.');
    }
    return new ApiError(409, 'CONFLICT', 'That value is already in use.');
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'ValidationError'
  ) {
    const errors = (error as { errors?: Record<string, { message: string }> }).errors ?? {};
    return new ApiError(
      400,
      'VALIDATION_FAILED',
      'The document failed schema validation.',
      Object.entries(errors).map(([path, value]) => ({ path, message: value.message })),
    );
  }

  return new ApiError(
    500,
    'INTERNAL_ERROR',
    'Something went wrong on our end. The error has been logged.',
  );
}
