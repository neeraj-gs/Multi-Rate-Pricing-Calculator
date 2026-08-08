import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from '@/lib/pricing';

/**
 * ## Two layers of validation, deliberately
 *
 * Zod checks **shape**: is this field present, is it a string or a number, is
 * it within an obviously sane range, is the date parseable. It runs before any
 * business logic and produces field-level messages the UI can attach to inputs.
 *
 * The pricing engine checks **numeric truth**: does this value fit the
 * currency's precision, does the fixed discount exceed the line subtotal, does
 * the arithmetic stay exact. Those rules depend on computed values and on the
 * document's currency, so they cannot live in a static schema without being
 * duplicated — and a duplicated rule is a rule that will eventually disagree
 * with itself.
 *
 * Both layers surface through the same error envelope, so a caller never has
 * to care which one rejected the request.
 */

/** A decimal that may arrive as a string (lossless) or a JSON number. */
export const decimalInput = z.union([
  z
    .string()
    .trim()
    .min(1, 'Value is required.')
    .max(24, 'Value is too long.'),
  z.number().finite('Value must be a finite number.'),
]);

export const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Must be a valid 24-character id.');

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => SUPPORTED_CURRENCIES.includes(value), {
    message: `Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}.`,
  });

/**
 * A calendar date, as `YYYY-MM-DD`.
 *
 * Parsed at UTC midnight so an issue date is the same day for everyone. Reading
 * `new Date('2026-01-31')` already yields UTC midnight, but the components are
 * validated first so `2026-02-31` is rejected rather than silently rolling over
 * into March.
 */
export const calendarDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format.')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'Not a real calendar date.')
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

/** Turns a `Date` back into the `YYYY-MM-DD` form the API speaks. */
export function toCalendarDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const parsed = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Email is required.')
  .max(254, 'Email is too long.')
  .email('Enter a valid email address.');

/**
 * Password rules that resist the attacks that actually happen.
 *
 * Length dominates composition rules for real-world resistance, so the floor is
 * 10 characters rather than 8-with-a-symbol. The upper bound exists because
 * bcrypt silently ignores input past 72 bytes — accepting a 200-character
 * password would be quietly lying about how much of it protects the account.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters.')
  .max(72, 'Password must be at most 72 characters.')
  .refine((value) => !/^\s|\s$/.test(value), 'Password cannot start or end with a space.');
