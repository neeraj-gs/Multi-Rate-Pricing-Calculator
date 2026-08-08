import { describe, expect, it } from 'vitest';
import { calculateDocument, calculateLine, emptyTotals, sumLines } from './calculate';
import { PricingError } from './errors';
import type { LineInput } from './types';

function expectPricingError(fn: () => unknown, code: string): PricingError {
  try {
    fn();
  } catch (error) {
    expect(error, `expected PricingError, got ${String(error)}`).toBeInstanceOf(PricingError);
    expect((error as PricingError).code).toBe(code);
    return error as PricingError;
  }
  throw new Error(`Expected a PricingError with code ${code}, but nothing was thrown.`);
}

/**
 * The worked example from the assignment brief.
 *
 * These figures are the contract. If a refactor changes any of them, the
 * refactor is wrong.
 */
const SAMPLE_LINES: LineInput[] = [
  {
    id: 'widget-a',
    description: 'Widget A',
    quantity: 2,
    unitPrice: '100.00',
    discount: { type: 'percent', value: 10 },
    taxPercent: 5,
  },
  {
    id: 'widget-b',
    description: 'Widget B',
    quantity: 1,
    unitPrice: '50.00',
    discount: null,
    taxPercent: 5,
  },
  {
    id: 'service-fee',
    description: 'Service fee',
    quantity: 1,
    unitPrice: '200.00',
    discount: { type: 'fixed', value: '20.00' },
    taxPercent: null,
  },
];

describe('the assignment sample document', () => {
  const result = calculateDocument({ currency: 'USD', lines: SAMPLE_LINES });

  it('matches the published per-line figures', () => {
    expect(
      result.lines.map((line) => ({
        description: line.description,
        subtotal: line.subtotal,
        discountAmount: line.discountAmount,
        discountedAmount: line.discountedAmount,
        taxAmount: line.taxAmount,
        total: line.total,
      })),
    ).toEqual([
      {
        description: 'Widget A',
        subtotal: '200.00',
        discountAmount: '20.00',
        discountedAmount: '180.00',
        taxAmount: '9.00',
        total: '189.00',
      },
      {
        description: 'Widget B',
        subtotal: '50.00',
        discountAmount: '0.00',
        discountedAmount: '50.00',
        taxAmount: '2.50',
        total: '52.50',
      },
      {
        description: 'Service fee',
        subtotal: '200.00',
        discountAmount: '20.00',
        discountedAmount: '180.00',
        taxAmount: '0.00',
        total: '180.00',
      },
    ]);
  });

  it('matches the published document totals', () => {
    expect(result.totals).toMatchObject({
      currency: 'USD',
      subtotal: '450.00',
      totalDiscount: '40.00',
      totalTax: '11.50',
      grandTotal: '421.50',
      lineCount: 3,
    });
  });

  it('stores those totals as exact integer minor units', () => {
    expect(result.totals).toMatchObject({
      subtotalMinor: 45_000,
      totalDiscountMinor: 4000,
      totalTaxMinor: 1150,
      grandTotalMinor: 42_150,
    });
  });

  it('preserves line ids so the client can map results back', () => {
    expect(result.lines.map((line) => line.id)).toEqual([
      'widget-a',
      'widget-b',
      'service-fee',
    ]);
  });

  it('produces identical results whether values arrive as strings or numbers', () => {
    const asStrings = calculateDocument({
      currency: 'USD',
      lines: SAMPLE_LINES.map((line) => ({
        ...line,
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice),
        taxPercent: line.taxPercent == null ? null : String(line.taxPercent),
        discount: line.discount
          ? { ...line.discount, value: String(line.discount.value) }
          : null,
      })),
    });
    expect(asStrings.totals).toEqual(result.totals);
  });
});

describe('rule 1 — discount is applied before tax', () => {
  it('taxes the discounted amount, not the gross subtotal', () => {
    const line = calculateLine(
      {
        quantity: 2,
        unitPrice: '100.00',
        discount: { type: 'percent', value: 10 },
        taxPercent: 5,
      },
      'USD',
    );
    // 5% of 180.00 = 9.00. Taxing the gross 200.00 would have given 10.00.
    expect(line.taxAmount).toBe('9.00');
    expect(line.taxAmount).not.toBe('10.00');
  });

  it('gives a different answer than tax-before-discount would', () => {
    const discountFirst = calculateLine(
      {
        quantity: 1,
        unitPrice: '100.00',
        discount: { type: 'percent', value: 20 },
        taxPercent: 10,
      },
      'USD',
    );
    expect(discountFirst.total).toBe('88.00'); // (100 - 20) * 1.10
  });
});

describe('rule 2 — percent versus fixed discounts', () => {
  it('applies a percentage discount to the line subtotal', () => {
    const line = calculateLine(
      { quantity: 3, unitPrice: '33.33', discount: { type: 'percent', value: '12.5' } },
      'USD',
    );
    expect(line.subtotal).toBe('99.99');
    expect(line.discountAmount).toBe('12.50'); // 12.4988 -> 12.50
    expect(line.discountedAmount).toBe('87.49');
  });

  it('applies a fixed discount as an absolute amount', () => {
    const line = calculateLine(
      { quantity: 1, unitPrice: '200.00', discount: { type: 'fixed', value: '20.00' } },
      'USD',
    );
    expect(line.discountAmount).toBe('20.00');
    expect(line.effectiveDiscountPercentScaled).toBe(1000); // 10%
  });

  it('treats a null discount as zero', () => {
    const line = calculateLine({ quantity: 1, unitPrice: '50.00' }, 'USD');
    expect(line.discountAmount).toBe('0.00');
    expect(line.discountType).toBeNull();
  });

  it('cannot express percent and fixed at once — the type makes it impossible', () => {
    // A discount is a tagged union, so rule 3 of the brief is enforced
    // structurally. Anything else is rejected at runtime too.
    expectPricingError(
      () =>
        calculateLine(
          {
            quantity: 1,
            unitPrice: '10.00',
            // @ts-expect-error deliberately invalid shape
            discount: { type: 'both', value: 5 },
          },
          'USD',
        ),
      'DISCOUNT_CONFLICT',
    );
  });

  it('rejects a percentage discount above 100%', () => {
    expectPricingError(
      () =>
        calculateLine(
          { quantity: 1, unitPrice: '10.00', discount: { type: 'percent', value: 150 } },
          'USD',
        ),
      'PERCENT_OUT_OF_RANGE',
    );
  });
});

describe('rule 4 — a fixed discount may not exceed the line subtotal', () => {
  const overDiscounted: LineInput = {
    quantity: 1,
    unitPrice: '50.00',
    discount: { type: 'fixed', value: '80.00' },
  };

  it('rejects by default, with the offending figures attached', () => {
    const error = expectPricingError(
      () => calculateLine(overDiscounted, 'USD'),
      'DISCOUNT_EXCEEDS_SUBTOTAL',
    );
    expect(error.message).toContain('80.00');
    expect(error.message).toContain('50.00');
    expect(error.meta).toMatchObject({ discount: '80.00', subtotal: '50.00' });
  });

  it('allows a discount exactly equal to the subtotal', () => {
    const line = calculateLine(
      { quantity: 1, unitPrice: '50.00', discount: { type: 'fixed', value: '50.00' } },
      'USD',
    );
    expect(line.discountedAmount).toBe('0.00');
    expect(line.total).toBe('0.00');
  });

  it('clamps instead of throwing when the caller opts in', () => {
    const line = calculateLine(overDiscounted, 'USD', { overDiscount: 'clamp' });
    expect(line.discountAmount).toBe('50.00');
    expect(line.discountedAmount).toBe('0.00');
    expect(line.totalMinor).toBe(0);
  });

  it('never produces a negative line total', () => {
    const line = calculateLine(
      { quantity: 1, unitPrice: '9.99', discount: { type: 'fixed', value: '999.00' }, taxPercent: 5 },
      'USD',
      { overDiscount: 'clamp' },
    );
    expect(line.totalMinor).toBe(0);
  });
});

describe('rounding policy — half-up, per line, at each step', () => {
  it('rounds a tie upward', () => {
    // 5% of 0.10 = 0.005 -> 0.01
    const line = calculateLine({ quantity: 1, unitPrice: '0.10', taxPercent: 5 }, 'USD');
    expect(line.taxAmount).toBe('0.01');
    expect(line.total).toBe('0.11');
  });

  it('rounds below a tie downward', () => {
    // 4% of 0.10 = 0.004 -> 0.00
    const line = calculateLine({ quantity: 1, unitPrice: '0.10', taxPercent: 4 }, 'USD');
    expect(line.taxAmount).toBe('0.00');
    expect(line.total).toBe('0.10');
  });

  it('rounds each line independently rather than the document once', () => {
    // Three identical lines each round 0.005 up to 0.01, so the document tax
    // is 0.03. Summing raw values first and rounding once would give 0.02.
    const line: LineInput = { quantity: 1, unitPrice: '0.10', taxPercent: 5 };
    const result = calculateDocument({ currency: 'USD', lines: [line, line, line] });
    expect(result.totals.totalTax).toBe('0.03');
  });

  it('handles a quantity that produces a sub-cent product', () => {
    // 1.5 x 0.33 = 0.495 -> 0.50
    const line = calculateLine({ quantity: '1.5', unitPrice: '0.33' }, 'USD');
    expect(line.subtotal).toBe('0.50');
  });

  it('supports fractional quantities to three decimal places', () => {
    const line = calculateLine({ quantity: '7.25', unitPrice: '120.00' }, 'USD');
    expect(line.subtotal).toBe('870.00');
    expect(line.quantity).toBe('7.25');
  });
});

describe('document totals', () => {
  it('holds the identity subtotal − discount + tax === grandTotal', () => {
    const result = calculateDocument({ currency: 'USD', lines: SAMPLE_LINES });
    const { subtotalMinor, totalDiscountMinor, totalTaxMinor, grandTotalMinor } =
      result.totals;
    expect(subtotalMinor - totalDiscountMinor + totalTaxMinor).toBe(grandTotalMinor);
  });

  it('holds that identity across a large randomised document', () => {
    // A cheap stand-in for property-based testing: 400 lines of awkward
    // values, checked against the invariant the whole design protects.
    const lines: LineInput[] = Array.from({ length: 400 }, (_, index) => ({
      quantity: String(1 + (index % 9) + (index % 4) / 4),
      unitPrice: `${(index % 997) + 1}.${String((index * 37) % 100).padStart(2, '0')}`,
      discount:
        index % 3 === 0
          ? { type: 'percent' as const, value: String((index % 40) + 0.5) }
          : index % 3 === 1
            ? { type: 'fixed' as const, value: '0.99' }
            : null,
      taxPercent: index % 5 === 0 ? null : String((index % 20) + 0.25),
    }));

    const { totals, lines: computed } = calculateDocument({ currency: 'USD', lines });

    expect(totals.subtotalMinor - totals.totalDiscountMinor + totals.totalTaxMinor).toBe(
      totals.grandTotalMinor,
    );
    expect(computed.reduce((sum, line) => sum + line.totalMinor, 0)).toBe(
      totals.grandTotalMinor,
    );
    expect(Number.isSafeInteger(totals.grandTotalMinor)).toBe(true);
  });

  it('sums an empty document to zero rather than failing', () => {
    const result = calculateDocument({ currency: 'AED', lines: [] });
    expect(result.totals).toMatchObject({
      subtotal: '0.00',
      totalDiscount: '0.00',
      totalTax: '0.00',
      grandTotal: '0.00',
      lineCount: 0,
    });
    expect(emptyTotals('AED')).toEqual(result.totals);
  });

  it('re-sums stored line totals to the same figures (report path)', () => {
    const result = calculateDocument({ currency: 'USD', lines: SAMPLE_LINES });
    expect(sumLines(result.lines, 'USD')).toEqual(result.totals);
  });
});

describe('input validation', () => {
  it('rejects a zero or negative quantity', () => {
    expectPricingError(
      () => calculateLine({ quantity: 0, unitPrice: '10.00' }, 'USD'),
      'QUANTITY_TOO_SMALL',
    );
    expectPricingError(
      () => calculateLine({ quantity: -2, unitPrice: '10.00' }, 'USD'),
      'NEGATIVE_NOT_ALLOWED',
    );
  });

  it('rejects a negative unit price', () => {
    expectPricingError(
      () => calculateLine({ quantity: 1, unitPrice: '-10.00' }, 'USD'),
      'NEGATIVE_NOT_ALLOWED',
    );
  });

  it('accepts a zero unit price', () => {
    const line = calculateLine({ quantity: 3, unitPrice: '0.00', taxPercent: 5 }, 'USD');
    expect(line.total).toBe('0.00');
  });

  it('rejects more precision than the currency supports', () => {
    expectPricingError(
      () => calculateLine({ quantity: 1, unitPrice: '10.999' }, 'USD'),
      'PRECISION_EXCEEDED',
    );
  });

  it('rejects an unsupported currency before touching any line', () => {
    expectPricingError(
      () => calculateDocument({ currency: 'XBT', lines: SAMPLE_LINES }),
      'UNSUPPORTED_CURRENCY',
    );
  });

  it('reports which line failed, by index', () => {
    const error = expectPricingError(
      () =>
        calculateDocument({
          currency: 'USD',
          lines: [
            { quantity: 1, unitPrice: '10.00' },
            { quantity: 1, unitPrice: '10.00' },
            { quantity: 1, unitPrice: 'oops' },
          ],
        }),
      'INVALID_NUMBER',
    );
    expect(error.path).toBe('lines.2.unitPrice');
  });
});

describe('multi-currency', () => {
  it('rounds to three decimals for Kuwaiti dinar', () => {
    const line = calculateLine(
      { quantity: 3, unitPrice: '10.005', taxPercent: 5 },
      'KWD',
    );
    expect(line.subtotal).toBe('30.015');
    expect(line.taxAmount).toBe('1.501'); // 1.50075 -> 1.501
    expect(line.total).toBe('31.516');
  });

  it('rounds to whole units for Japanese yen', () => {
    const line = calculateLine({ quantity: 2, unitPrice: '1500', taxPercent: 10 }, 'JPY');
    expect(line.subtotal).toBe('3000');
    expect(line.taxAmount).toBe('300');
    expect(line.total).toBe('3300');
  });

  it('normalises a lowercase currency code', () => {
    expect(calculateDocument({ currency: 'aed', lines: [] }).totals.currency).toBe('AED');
  });
});

describe('determinism', () => {
  it('returns identical output for identical input, every time', () => {
    const first = calculateDocument({ currency: 'USD', lines: SAMPLE_LINES });
    const second = calculateDocument({ currency: 'USD', lines: SAMPLE_LINES });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('does not mutate its input', () => {
    const snapshot = JSON.stringify(SAMPLE_LINES);
    calculateDocument({ currency: 'USD', lines: SAMPLE_LINES });
    expect(JSON.stringify(SAMPLE_LINES)).toBe(snapshot);
  });
});
