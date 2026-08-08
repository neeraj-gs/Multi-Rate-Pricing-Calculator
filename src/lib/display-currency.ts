import { SUPPORTED_CURRENCIES } from '@/lib/pricing';

/**
 * The currency the app *shows* figures in.
 *
 * Distinct from the currency a document is priced in, which never changes on
 * its own. This is a lens over the roll-ups — the dashboard, the report, the
 * totals column of the document list — so a book split across AED, USD and SAR
 * can produce one comparable number.
 *
 * `NATIVE` keeps the original behaviour: every figure in the currency it was
 * priced in, and totals never combined across currencies. It stays available
 * because it is the only view with no rate assumption in it at all, and some
 * questions ("what did I actually invoice in dirhams") only have an answer
 * there.
 */
export const NATIVE = 'native';

export const DISPLAY_CURRENCY_COOKIE = 'display_currency';

export type DisplayCurrency = string;

export function isNative(value: string | null | undefined): boolean {
  return !value || value === NATIVE;
}

/** Narrows an untrusted value — a cookie, a query string — to something usable. */
export function normalizeDisplayCurrency(
  value: string | null | undefined,
  fallback: string = NATIVE,
): string {
  if (!value) return fallback;
  if (value === NATIVE) return NATIVE;
  const upper = value.toUpperCase();
  return SUPPORTED_CURRENCIES.includes(upper) ? upper : fallback;
}

export const DISPLAY_CURRENCY_OPTIONS = [NATIVE, ...SUPPORTED_CURRENCIES];
