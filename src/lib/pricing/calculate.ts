/**
 * The single source of truth for every number this product shows.
 *
 * The API, the seed script, the report aggregation and the client-side preview
 * all call into this one module. There is no second implementation anywhere —
 * that is the property that keeps a quote's stored totals, its printed PDF and
 * its row in the summary report from ever disagreeing.
 *
 * ## Order of operations (per line)
 *
 *   1. `subtotal          = round(quantity × unitPrice)`
 *   2. `discountAmount    = round(subtotal × discountPercent)` — or the fixed amount
 *   3. `discountedAmount  = subtotal − discountAmount`
 *   4. `taxAmount         = round(discountedAmount × taxPercent)`
 *   5. `lineTotal         = discountedAmount + taxAmount`
 *
 * Discount is always applied **before** tax, and tax is charged on the
 * discounted amount — never on the gross subtotal.
 *
 * ## Rounding policy
 *
 * Half-up (ties away from zero), applied **once per line at each step above**,
 * to the currency's minor unit (2 dp for USD/AED, 3 dp for KWD, 0 dp for JPY).
 *
 * Document totals are plain sums of values that are *already* rounded. Nothing
 * is rounded a second time. That choice is what guarantees the identity
 *
 *     subtotal − totalDiscount + totalTax === grandTotal
 *
 * holds exactly for every document, which is asserted at the end of every
 * calculation and covered by the test suite. The alternative — rounding the
 * document total independently — can produce a grand total that differs from
 * the sum of the lines printed above it by a cent, which is the single most
 * common complaint about billing software.
 */

import {
  applyPercent,
  assertWithinRange,
  currencyExponent,
  formatMinor,
  formatPercent,
  formatQuantity,
  multiplyByQuantity,
  parseMoney,
  parsePercent,
  parseQuantity,
  PERCENT_DENOMINATOR,
} from './money';
import { PricingError, withPathPrefix } from './errors';
import type {
  CalculatedDocument,
  DocumentInput,
  DocumentTotals,
  LineInput,
  LineTotals,
} from './types';

export interface CalculateOptions {
  /**
   * How to handle a fixed discount larger than the line subtotal.
   *
   * `'reject'` (default, and what the API uses) refuses the request with a
   * specific error. A fixed discount above the subtotal is almost always a
   * typo or a currency mix-up, and silently absorbing it would produce a line
   * that looks correct while being wrong. Financial software should stop and
   * ask rather than guess.
   *
   * `'clamp'` caps the discount at the subtotal (never negative). Exposed for
   * callers that import bulk data and prefer a lossy import to a failed one.
   */
  overDiscount?: 'reject' | 'clamp';
}

/** Computes one line's totals. Pure — no I/O, no clock, no randomness. */
export function calculateLine(
  line: LineInput,
  currency: string,
  options: CalculateOptions = {},
): LineTotals {
  const { overDiscount = 'reject' } = options;
  const exponent = currencyExponent(currency);

  const quantityScaled = parseQuantity(line.quantity, 'quantity');
  if (quantityScaled <= 0) {
    throw new PricingError(
      'QUANTITY_TOO_SMALL',
      'Quantity must be greater than zero.',
      'quantity',
      { received: line.quantity },
    );
  }

  const unitPriceMinor = parseMoney(line.unitPrice, currency, 'unitPrice');

  // Step 1 — line subtotal.
  const subtotalMinor = multiplyByQuantity(unitPriceMinor, quantityScaled);
  assertWithinRange(subtotalMinor, 'subtotal');

  // Step 2 — discount. The tagged union makes "percent and fixed at the same
  // time" unrepresentable, so rule 3 of the brief is enforced by the type
  // rather than by a runtime check that could be forgotten.
  let discountAmountMinor = 0;
  let discountType: LineTotals['discountType'] = null;
  let discountValue: string | null = null;
  let discountPercentScaled = 0;

  if (line.discount != null) {
    discountType = line.discount.type;
    if (discountType === 'percent') {
      discountPercentScaled = parsePercent(line.discount.value, 'discount.value');
      if (discountPercentScaled > 100 * 10 ** 2) {
        throw new PricingError(
          'PERCENT_OUT_OF_RANGE',
          'A percentage discount cannot exceed 100%.',
          'discount.value',
          { received: line.discount.value },
        );
      }
      discountValue = formatPercent(discountPercentScaled);
      discountAmountMinor = applyPercent(subtotalMinor, discountPercentScaled);
    } else if (discountType === 'fixed') {
      discountAmountMinor = parseMoney(line.discount.value, currency, 'discount.value');
      discountValue = formatMinor(discountAmountMinor, currency);

      if (discountAmountMinor > subtotalMinor) {
        if (overDiscount === 'clamp') {
          discountAmountMinor = subtotalMinor;
        } else {
          throw new PricingError(
            'DISCOUNT_EXCEEDS_SUBTOTAL',
            `Fixed discount of ${formatMinor(discountAmountMinor, currency)} exceeds the line subtotal of ${formatMinor(subtotalMinor, currency)}.`,
            'discount.value',
            {
              discount: formatMinor(discountAmountMinor, currency),
              subtotal: formatMinor(subtotalMinor, currency),
              currency,
            },
          );
        }
      }
    } else {
      throw new PricingError(
        'DISCOUNT_CONFLICT',
        `Unknown discount type "${String(discountType)}". Use "percent" or "fixed".`,
        'discount.type',
      );
    }
  }

  // Step 3 — discounted amount.
  const discountedAmountMinor = subtotalMinor - discountAmountMinor;

  // Step 4 — tax on the discounted amount.
  let taxPercentScaled = 0;
  if (line.taxPercent != null && line.taxPercent !== '') {
    taxPercentScaled = parsePercent(line.taxPercent, 'taxPercent');
  }
  const taxAmountMinor = applyPercent(discountedAmountMinor, taxPercentScaled);

  // Step 5 — line total.
  const totalMinor = discountedAmountMinor + taxAmountMinor;
  assertWithinRange(totalMinor, 'total');

  const effectiveDiscountPercentScaled =
    subtotalMinor === 0
      ? 0
      : Math.round((discountAmountMinor * PERCENT_DENOMINATOR) / subtotalMinor);

  return {
    id: line.id,
    description: line.description,

    quantity: formatQuantity(quantityScaled),
    quantityScaled,
    unitPrice: formatMinor(unitPriceMinor, currency),
    unitPriceMinor,

    discountType,
    discountValue,
    discountValueScaled:
      discountType === 'percent'
        ? discountPercentScaled
        : discountType === 'fixed'
          ? discountAmountMinor
          : null,

    subtotal: formatMinor(subtotalMinor, currency),
    subtotalMinor,

    discountAmount: formatMinor(discountAmountMinor, currency),
    discountAmountMinor,

    discountedAmount: formatMinor(discountedAmountMinor, currency),
    discountedAmountMinor,

    taxPercent: line.taxPercent == null ? null : formatPercent(taxPercentScaled),
    taxPercentScaled: line.taxPercent == null ? null : taxPercentScaled,
    taxAmount: formatMinor(taxAmountMinor, currency),
    taxAmountMinor,

    total: formatMinor(totalMinor, currency),
    totalMinor,

    effectiveDiscountPercentScaled,
  };
}

/** Computes every line plus the document rollup. */
export function calculateDocument(
  input: DocumentInput,
  options: CalculateOptions = {},
): CalculatedDocument {
  const currency = input.currency?.toUpperCase?.() ?? '';
  currencyExponent(currency); // validates the code before any line is touched

  const lines = (input.lines ?? []).map((line, index) =>
    withPathPrefix(`lines.${index}`, () => calculateLine(line, currency, options)),
  );

  const totals = sumLines(lines, currency);
  return { lines, totals };
}

/**
 * Rolls already-rounded line values up to document level.
 *
 * Exported separately because the report aggregation sums *stored* line totals
 * across many documents and must use the exact same summation rule.
 */
export function sumLines(lines: LineTotals[], currency: string): DocumentTotals {
  let subtotalMinor = 0;
  let totalDiscountMinor = 0;
  let totalTaxMinor = 0;
  let grandTotalMinor = 0;

  for (const line of lines) {
    subtotalMinor += line.subtotalMinor;
    totalDiscountMinor += line.discountAmountMinor;
    totalTaxMinor += line.taxAmountMinor;
    grandTotalMinor += line.totalMinor;
  }

  assertWithinRange(grandTotalMinor, 'totals.grandTotal');

  // The invariant this whole design exists to protect. If it ever fails, the
  // engine is broken and the caller must not be handed a plausible-looking
  // wrong number.
  const derived = subtotalMinor - totalDiscountMinor + totalTaxMinor;
  if (derived !== grandTotalMinor) {
    throw new PricingError(
      'AMOUNT_OVERFLOW',
      `Totals failed to reconcile: subtotal − discount + tax = ${derived} but the sum of line totals is ${grandTotalMinor}.`,
      'totals',
      { derived, grandTotalMinor },
    );
  }

  return {
    currency,
    subtotal: formatMinor(subtotalMinor, currency),
    subtotalMinor,
    totalDiscount: formatMinor(totalDiscountMinor, currency),
    totalDiscountMinor,
    totalTax: formatMinor(totalTaxMinor, currency),
    totalTaxMinor,
    grandTotal: formatMinor(grandTotalMinor, currency),
    grandTotalMinor,
    lineCount: lines.length,
  };
}

/** Empty-document totals, so callers never special-case a zero-line quote. */
export function emptyTotals(currency: string): DocumentTotals {
  return sumLines([], currency.toUpperCase());
}

export { PricingError } from './errors';
export type { PricingErrorCode } from './errors';
export * from './money';
export type * from './types';
