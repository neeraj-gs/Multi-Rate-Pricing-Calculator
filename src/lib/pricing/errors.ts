/**
 * Errors raised by the pricing engine.
 *
 * The engine is deliberately dependency-free, so it cannot know about HTTP.
 * It throws `PricingError` with a stable machine-readable `code`; the API layer
 * maps those codes onto status codes and user-facing messages
 * (see `src/lib/api/errors.ts`).
 */

export type PricingErrorCode =
  | 'INVALID_NUMBER'
  | 'PRECISION_EXCEEDED'
  | 'OUT_OF_RANGE'
  | 'NEGATIVE_NOT_ALLOWED'
  | 'QUANTITY_TOO_SMALL'
  | 'DISCOUNT_EXCEEDS_SUBTOTAL'
  | 'PERCENT_OUT_OF_RANGE'
  | 'DISCOUNT_CONFLICT'
  | 'UNSUPPORTED_CURRENCY'
  | 'AMOUNT_OVERFLOW';

export class PricingError extends Error {
  readonly code: PricingErrorCode;
  /** Dot-path of the offending field, e.g. `lines.0.discount.value`. */
  readonly path: string;
  readonly meta?: Record<string, unknown>;

  constructor(
    code: PricingErrorCode,
    message: string,
    path = '',
    meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PricingError';
    this.code = code;
    this.path = path;
    this.meta = meta;
  }
}

/** Prefixes the path of a `PricingError` thrown deeper in the tree. */
export function withPathPrefix<T>(prefix: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof PricingError) {
      throw new PricingError(
        error.code,
        error.message,
        error.path ? `${prefix}.${error.path}` : prefix,
        error.meta,
      );
    }
    throw error;
  }
}
