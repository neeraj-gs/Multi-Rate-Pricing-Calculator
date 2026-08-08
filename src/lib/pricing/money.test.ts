import { describe, expect, it } from 'vitest';
import {
  applyPercent,
  currencyExponent,
  formatMinor,
  formatPercent,
  formatQuantity,
  mulDivRoundHalfUp,
  multiplyByQuantity,
  parseMoney,
  parsePercent,
  parseQuantity,
  parseScaledInt,
} from './money';
import { PricingError } from './errors';

/** Asserts that `fn` throws a PricingError carrying the given code. */
function expectPricingError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(PricingError);
    expect((error as PricingError).code).toBe(code);
    return error as PricingError;
  }
  throw new Error(`Expected a PricingError with code ${code}, but nothing was thrown.`);
}

describe('parseScaledInt', () => {
  it('parses plain decimals without touching floating point', () => {
    expect(parseScaledInt('100.00', 2, 'x')).toBe(10_000);
    expect(parseScaledInt('0.07', 2, 'x')).toBe(7);
    expect(parseScaledInt('1.005', 3, 'x')).toBe(1005);
    expect(parseScaledInt('19.99', 2, 'x')).toBe(1999);
  });

  it('parses numbers as well as strings', () => {
    expect(parseScaledInt(100, 2, 'x')).toBe(10_000);
    expect(parseScaledInt(0.07, 2, 'x')).toBe(7);
    expect(parseScaledInt(12.5, 2, 'x')).toBe(1250);
  });

  it('pads and normalises fractional digits', () => {
    expect(parseScaledInt('5.1', 2, 'x')).toBe(510);
    expect(parseScaledInt('5', 2, 'x')).toBe(500);
    expect(parseScaledInt('0005.10', 2, 'x')).toBe(510);
  });

  it('accepts insignificant trailing zeros beyond the scale', () => {
    expect(parseScaledInt('10.500', 2, 'x')).toBe(1050);
    expect(parseScaledInt('10.5000000', 2, 'x')).toBe(1050);
  });

  it('rejects — never truncates — significant extra precision', () => {
    expectPricingError(() => parseScaledInt('10.555', 2, 'x'), 'PRECISION_EXCEEDED');
    expectPricingError(() => parseScaledInt('0.001', 2, 'x'), 'PRECISION_EXCEEDED');
  });

  it('strips thousands separators and whitespace from strings', () => {
    expect(parseScaledInt(' 1,234.50 ', 2, 'x')).toBe(123_450);
    expect(parseScaledInt('1 000.00', 2, 'x')).toBe(100_000);
  });

  it('rejects malformed input', () => {
    expectPricingError(() => parseScaledInt('abc', 2, 'x'), 'INVALID_NUMBER');
    expectPricingError(() => parseScaledInt('', 2, 'x'), 'INVALID_NUMBER');
    expectPricingError(() => parseScaledInt('1.2.3', 2, 'x'), 'INVALID_NUMBER');
    expectPricingError(() => parseScaledInt(Number.NaN, 2, 'x'), 'INVALID_NUMBER');
    expectPricingError(() => parseScaledInt(Number.POSITIVE_INFINITY, 2, 'x'), 'INVALID_NUMBER');
  });

  it('rejects negatives unless explicitly allowed', () => {
    expectPricingError(() => parseScaledInt('-1.00', 2, 'x'), 'NEGATIVE_NOT_ALLOWED');
    expect(parseScaledInt('-1.00', 2, 'x', { allowNegative: true })).toBe(-100);
  });

  it('expands exponential notation rather than mis-reading it', () => {
    expect(parseScaledInt(1.2e3, 2, 'x')).toBe(120_000);
    expect(parseScaledInt('1e2', 2, 'x')).toBe(10_000);
  });

  it('reports the offending field path on the error', () => {
    const error = expectPricingError(
      () => parseScaledInt('nope', 2, 'lines.3.unitPrice'),
      'INVALID_NUMBER',
    );
    expect(error.path).toBe('lines.3.unitPrice');
  });
});

describe('float-drift regressions', () => {
  // Each of these produces a visibly wrong answer under naive float maths.
  it('handles the classic 0.1 + 0.2 case exactly', () => {
    expect(parseMoney('0.1', 'USD', 'x') + parseMoney('0.2', 'USD', 'x')).toBe(30);
    expect(formatMinor(30, 'USD')).toBe('0.30');
  });

  it('rounds 1.005 up, where `Math.round(1.005 * 100)` rounds down', () => {
    // 1.005 * 100 === 100.49999999999999 in IEEE-754.
    expect(Math.round(1.005 * 100)).toBe(100); // the bug, demonstrated
    expect(applyPercent(20_100, 50)).toBe(101); // 0.5% of 201.00 = 1.005 -> 1.01, exactly
  });

  it('keeps a thousand repeated additions exact', () => {
    let cents = 0;
    for (let i = 0; i < 1000; i += 1) cents += parseMoney('0.07', 'USD', 'x');
    expect(cents).toBe(70_00);
    expect(formatMinor(cents, 'USD')).toBe('70.00');
  });
});

describe('mulDivRoundHalfUp', () => {
  it('rounds halves away from zero', () => {
    expect(mulDivRoundHalfUp(5, 1, 2)).toBe(3); // 2.5 -> 3
    expect(mulDivRoundHalfUp(7, 1, 2)).toBe(4); // 3.5 -> 4
    expect(mulDivRoundHalfUp(-5, 1, 2)).toBe(-3); // -2.5 -> -3
  });

  it('rounds below and above the half correctly', () => {
    expect(mulDivRoundHalfUp(4, 1, 3)).toBe(1); // 1.33 -> 1
    expect(mulDivRoundHalfUp(5, 1, 3)).toBe(2); // 1.66 -> 2
  });

  it('stays exact past Number.MAX_SAFE_INTEGER in the intermediate product', () => {
    // 10^12 * 10^4 = 10^16, comfortably beyond 2^53.
    expect(mulDivRoundHalfUp(1_000_000_000_000, 10_000, 10_000)).toBe(1_000_000_000_000);
  });

  it('refuses non-integer operands', () => {
    expectPricingError(() => mulDivRoundHalfUp(1.5, 2, 3), 'INVALID_NUMBER');
    expectPricingError(() => mulDivRoundHalfUp(1, 2, 0), 'INVALID_NUMBER');
  });
});

describe('applyPercent', () => {
  it('applies whole percentages', () => {
    expect(applyPercent(20_000, 1000)).toBe(2000); // 10% of 200.00 = 20.00
    expect(applyPercent(18_000, 500)).toBe(900); // 5% of 180.00 = 9.00
    expect(applyPercent(5000, 500)).toBe(250); // 5% of 50.00 = 2.50
  });

  it('applies fractional percentages with half-up rounding', () => {
    expect(applyPercent(10_000, 1250)).toBe(1250); // 12.5% of 100.00
    expect(applyPercent(333, 1500)).toBe(50); // 15% of 3.33 = 0.4995 -> 0.50
    expect(applyPercent(1, 5000)).toBe(1); // 50% of 0.01 = 0.005 -> 0.01
  });

  it('returns zero for a zero rate or a zero base', () => {
    expect(applyPercent(12_345, 0)).toBe(0);
    expect(applyPercent(0, 1000)).toBe(0);
  });
});

describe('multiplyByQuantity', () => {
  it('multiplies by whole and fractional quantities', () => {
    expect(multiplyByQuantity(10_000, 2000)).toBe(20_000); // 2 x 100.00
    expect(multiplyByQuantity(10_000, 2500)).toBe(25_000); // 2.5 x 100.00
    expect(multiplyByQuantity(999, 3000)).toBe(2997); // 3 x 9.99
  });

  it('rounds a sub-cent product half-up', () => {
    expect(multiplyByQuantity(1, 1500)).toBe(2); // 1.5 x 0.01 = 0.015 -> 0.02
    expect(multiplyByQuantity(333, 1001)).toBe(333); // 1.001 x 3.33 = 3.333 -> 3.33
  });
});

describe('currency handling', () => {
  it('knows the minor-unit exponent of each supported currency', () => {
    expect(currencyExponent('USD')).toBe(2);
    expect(currencyExponent('AED')).toBe(2);
    expect(currencyExponent('KWD')).toBe(3);
    expect(currencyExponent('JPY')).toBe(0);
  });

  it('is case-insensitive but rejects unknown codes', () => {
    expect(currencyExponent('aed')).toBe(2);
    expectPricingError(() => currencyExponent('XYZ'), 'UNSUPPORTED_CURRENCY');
  });

  it('parses and formats zero-decimal and three-decimal currencies', () => {
    expect(parseMoney('1500', 'JPY', 'x')).toBe(1500);
    expect(formatMinor(1500, 'JPY')).toBe('1500');
    expect(parseMoney('12.345', 'KWD', 'x')).toBe(12_345);
    expect(formatMinor(12_345, 'KWD')).toBe('12.345');
    expectPricingError(() => parseMoney('1.5', 'JPY', 'x'), 'PRECISION_EXCEEDED');
  });
});

describe('formatting', () => {
  it('pads minor units back to a fixed-width decimal string', () => {
    expect(formatMinor(18_900, 'USD')).toBe('189.00');
    expect(formatMinor(5, 'USD')).toBe('0.05');
    expect(formatMinor(0, 'USD')).toBe('0.00');
    expect(formatMinor(-2500, 'USD')).toBe('-25.00');
  });

  it('trims insignificant zeros from percentages and quantities', () => {
    expect(formatPercent(1000)).toBe('10');
    expect(formatPercent(1250)).toBe('12.5');
    expect(formatPercent(0)).toBe('0');
    expect(formatQuantity(1000)).toBe('1');
    expect(formatQuantity(2500)).toBe('2.5');
  });
});

describe('bounds', () => {
  it('rejects amounts beyond the supported range', () => {
    expectPricingError(() => parseMoney('999999999999', 'USD', 'x'), 'OUT_OF_RANGE');
  });

  it('rejects absurd percentages', () => {
    expectPricingError(() => parsePercent('5000', 'x'), 'PERCENT_OUT_OF_RANGE');
    expect(parsePercent('100', 'x')).toBe(10_000);
  });

  it('rejects negative quantities and prices', () => {
    expectPricingError(() => parseQuantity('-1', 'x'), 'NEGATIVE_NOT_ALLOWED');
    expectPricingError(() => parseMoney('-0.01', 'USD', 'x'), 'NEGATIVE_NOT_ALLOWED');
  });
});
