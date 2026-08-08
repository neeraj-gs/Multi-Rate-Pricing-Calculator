import { PricingError } from './errors';
import {
  currencyExponent,
  formatMinor,
  isSupportedCurrency,
  mulDivRoundHalfUp,
  type CurrencyCode,
} from './money';

/**
 * Currency conversion, for display.
 *
 * ## What this does and does not touch
 *
 * Nothing here ever changes what is stored. A document's amounts stay in the
 * currency they were priced in, as the same integer minor units, and the
 * document itself — on screen, in its PDF, on its share link — is always shown
 * in that currency. A quotation is a statement of what you will be charged; it
 * cannot silently re-denominate itself because someone flipped a switch.
 *
 * What conversion serves is the *other* half of the product: the roll-ups.
 * "What did I quote this year" has no answer when the book is split across AED,
 * USD and SAR, and the honest previous answer — three separate totals, never
 * added — is correct but not always useful. A display currency lets those
 * figures combine, on the condition that the result is labelled as converted
 * and the rate behind it is visible.
 *
 * ## Why the rates are a static table
 *
 * A live feed would make every figure depend on a third party being up, and
 * two people opening the same report a minute apart would see different totals
 * with no way to tell why. These rates are fixed, versioned with the code, and
 * stamped with the date they were taken — so a converted figure is
 * reproducible, and a reader can see exactly what it was computed with.
 *
 * Most of the table is not an estimate at all: AED, SAR, QAR, BHD and OMR are
 * pegged to the dollar, and those pegs have held for decades.
 *
 * ## Exactness
 *
 * Converting is one `mulDivRoundHalfUp` — a single rounding step, on exact
 * BigInt intermediates, in the same half-up direction as the pricing engine.
 * Going via a float, or rounding once into the pivot currency and again out of
 * it, is how a converted column stops adding up to its own total.
 */

/** Rates are held to six decimal places — ample for every pair here. */
const RATE_SCALE = 6;
const RATE_DENOMINATOR = 10 ** RATE_SCALE;

/** The date the non-pegged rates were taken. Shown wherever a figure converts. */
export const RATES_AS_OF = '2026-08-01';

/**
 * Units of each currency per 1 USD, scaled by 10^6.
 *
 * USD is the pivot only because most of these are quoted against it; it is not
 * privileged anywhere else, and converting AED→SAR does not round through a
 * dollar figure — the pivot cancels inside a single division.
 */
const PER_USD_SCALED: Record<string, number> = {
  USD: 1_000_000,
  AED: 3_672_500, // pegged
  SAR: 3_750_000, // pegged
  QAR: 3_640_000, // pegged
  BHD: 376_000, // pegged
  OMR: 384_500, // pegged
  KWD: 306_500,
  EGP: 48_500_000,
  EUR: 920_000,
  GBP: 790_000,
  INR: 83_500_000,
  JPY: 148_000_000,
};

/** Currencies that can be converted. Every supported currency has a rate. */
export function isConvertible(currency: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    PER_USD_SCALED,
    currency?.toUpperCase?.() ?? '',
  );
}

function rateFor(currency: CurrencyCode): number {
  const rate = PER_USD_SCALED[currency?.toUpperCase?.() ?? ''];
  if (rate === undefined) {
    throw new PricingError(
      'UNSUPPORTED_CURRENCY',
      `No exchange rate for "${currency}".`,
      'currency',
      { currency },
    );
  }
  return rate;
}

/**
 * Converts an amount in `from`'s minor units into `to`'s minor units.
 *
 * The whole conversion is a single exact division:
 *
 *   toMinor = fromMinor × perUsd(to) × 10^exp(to)
 *             ────────────────────────────────────
 *             perUsd(from) × 10^exp(from)
 *
 * Both the rate change and the change of minor-unit precision happen in that
 * one step, so an amount moving from KWD (3 decimals) to JPY (0) rounds once,
 * not twice. Same currency in and out is returned untouched rather than
 * round-tripped through a rate of 1 — identity should cost nothing and risk
 * nothing.
 */
export function convertMinor(
  amountMinor: number,
  from: CurrencyCode,
  to: CurrencyCode,
): number {
  if (!isSupportedCurrency(from) || !isSupportedCurrency(to)) {
    throw new PricingError(
      'UNSUPPORTED_CURRENCY',
      `Cannot convert ${from} to ${to}.`,
      'currency',
      { from, to },
    );
  }
  if (from.toUpperCase() === to.toUpperCase()) return amountMinor;

  const numerator = rateFor(to) * 10 ** currencyExponent(to);
  const denominator = rateFor(from) * 10 ** currencyExponent(from);

  return mulDivRoundHalfUp(amountMinor, numerator, denominator);
}

/** Converts and formats in one step, for the many call sites that do both. */
export function convertAndFormat(
  amountMinor: number,
  from: CurrencyCode,
  to: CurrencyCode,
): string {
  return formatMinor(convertMinor(amountMinor, from, to), to);
}

/**
 * The rate between two currencies, for display: how much of `to` one unit of
 * `from` buys.
 *
 * Trimmed to four decimals, which is how a rate is quoted — and it is only ever
 * shown, never used to compute anything. The arithmetic uses the full-precision
 * integers above.
 */
export function rateLabel(from: CurrencyCode, to: CurrencyCode): string {
  const scaled = mulDivRoundHalfUp(rateFor(to), RATE_DENOMINATOR, rateFor(from));
  const value = scaled / RATE_DENOMINATOR;
  const text = value >= 100 ? value.toFixed(2) : value.toFixed(4);
  return `1 ${from.toUpperCase()} = ${text.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')} ${to.toUpperCase()}`;
}
