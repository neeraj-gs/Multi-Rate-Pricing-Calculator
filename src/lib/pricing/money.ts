/**
 * Exact money primitives.
 *
 * ## Why integers
 *
 * Binary floating point cannot represent most decimal fractions. `0.1 + 0.2`
 * is `0.30000000000000004`, and `1.005 * 100` is `100.49999999999999` — which
 * rounds *down* to 1.00 instead of 1.01. On a document with hundreds of lines
 * those errors compound into totals that do not tie out.
 *
 * Every amount in this system is therefore stored and computed as an **integer
 * number of minor units** (cents for USD/AED/EUR, fils for KWD, whole yen for
 * JPY). Decimal input from the client is parsed by *string inspection*, never
 * by `parseFloat`-then-multiply, so no value ever passes through a float.
 *
 * Intermediate products use `BigInt`, so a multiply-then-divide is exact even
 * when the intermediate exceeds `Number.MAX_SAFE_INTEGER`. Results are checked
 * back into the safe integer range before leaving this module.
 */

import { PricingError } from './errors';

/** Fixed-point scale for percentages: 2 dp, i.e. `12.34%` -> `1234`. */
export const PERCENT_SCALE = 2;
/** Denominator that turns a scaled percent back into a ratio: 100% * 10^2. */
export const PERCENT_DENOMINATOR = 100 * 10 ** PERCENT_SCALE; // 10_000 (basis points)

/** Fixed-point scale for quantities: 3 dp, i.e. `2.5` -> `2500`. */
export const QUANTITY_SCALE = 3;
export const QUANTITY_DENOMINATOR = 10 ** QUANTITY_SCALE; // 1_000

/**
 * Upper bound for any single amount, in minor units.
 * 10^13 minor units is 100 billion major units — far beyond any legitimate
 * quote, and small enough that sums of thousands of lines stay exact in a
 * JS number. Anything larger is a bug or an attack, not a real price.
 */
export const MAX_MINOR_UNITS = 10 ** 13;

/** Percentages are capped at 1000% to catch fat-fingered input early. */
export const MAX_PERCENT_SCALED = 1000 * 10 ** PERCENT_SCALE;

/**
 * ISO 4217 minor-unit exponents for the currencies the app offers.
 * Most currencies use 2 decimal places; these are the exceptions that matter
 * for a MENA-facing product (KWD/BHD/OMR use 3, JPY uses 0).
 */
const CURRENCY_EXPONENTS: Record<string, number> = {
  AED: 2,
  SAR: 2,
  QAR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  INR: 2,
  EGP: 2,
  KWD: 3,
  BHD: 3,
  OMR: 3,
  JPY: 0,
};

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_EXPONENTS).sort();

export type CurrencyCode = string;

/** Number of decimal places a currency's minor unit represents. */
export function currencyExponent(currency: CurrencyCode): number {
  const exponent = CURRENCY_EXPONENTS[currency?.toUpperCase?.() ?? ''];
  if (exponent === undefined) {
    throw new PricingError(
      'UNSUPPORTED_CURRENCY',
      `Unsupported currency "${currency}". Supported: ${SUPPORTED_CURRENCIES.join(', ')}.`,
      'currency',
      { currency, supported: SUPPORTED_CURRENCIES },
    );
  }
  return exponent;
}

export function isSupportedCurrency(currency: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    CURRENCY_EXPONENTS,
    currency?.toUpperCase?.() ?? '',
  );
}

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;

/**
 * Parses a decimal value into an integer scaled by `10^scale`, without ever
 * touching floating point arithmetic.
 *
 * Input arrives as a `string` (preferred — lossless) or a `number` (accepted
 * because JSON bodies commonly carry numbers). Numbers are converted with
 * `toFixed`-free string formatting and rejected if they are not finite.
 *
 * Extra precision is **rejected, never truncated**: silently dropping a digit
 * from a price is exactly the class of bug this module exists to prevent.
 */
export function parseScaledInt(
  input: string | number,
  scale: number,
  path: string,
  options: { allowNegative?: boolean } = {},
): number {
  const { allowNegative = false } = options;

  let raw: string;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new PricingError('INVALID_NUMBER', 'Value must be a finite number.', path);
    }
    // `toString` on a JS number yields the shortest round-tripping decimal,
    // which is the closest thing to the digits the user actually typed.
    raw = input.toString();
    if (raw.includes('e') || raw.includes('E')) {
      // Exponential notation (very large/small magnitudes) — expand it so the
      // digit-counting below stays correct.
      raw = expandExponential(raw, path);
    }
  } else if (typeof input === 'string') {
    raw = input.trim().replace(/[,_\s]/g, '');
    if (raw !== '' && /[eE]/.test(raw)) {
      raw = expandExponential(raw, path);
    }
  } else {
    throw new PricingError('INVALID_NUMBER', 'Value must be a number.', path);
  }

  if (raw === '') {
    throw new PricingError('INVALID_NUMBER', 'Value is required.', path);
  }

  const match = DECIMAL_PATTERN.exec(raw);
  if (!match) {
    throw new PricingError(
      'INVALID_NUMBER',
      `"${raw}" is not a valid decimal number.`,
      path,
    );
  }

  const [, sign, whole, fraction = ''] = match;

  if (fraction.length > scale) {
    // Trailing zeros carry no information, so `10.500` at scale 2 is fine.
    const significant = fraction.replace(/0+$/, '');
    if (significant.length > scale) {
      throw new PricingError(
        'PRECISION_EXCEEDED',
        `Value supports at most ${scale} decimal place${scale === 1 ? '' : 's'}, received "${raw}".`,
        path,
        { maxDecimalPlaces: scale, received: raw },
      );
    }
  }

  const padded = (fraction + '0'.repeat(scale)).slice(0, scale);
  const digits = `${whole}${padded}`.replace(/^0+(?=\d)/, '');
  const magnitude = Number(digits);

  if (!Number.isSafeInteger(magnitude)) {
    throw new PricingError(
      'AMOUNT_OVERFLOW',
      `Value "${raw}" is too large to represent exactly.`,
      path,
    );
  }

  const value = sign === '-' ? -magnitude : magnitude;

  if (!allowNegative && value < 0) {
    throw new PricingError(
      'NEGATIVE_NOT_ALLOWED',
      'Value must not be negative.',
      path,
      { received: raw },
    );
  }

  return value;
}

/** Expands `1.5e-7` / `1.2e+21` into plain decimal notation. */
function expandExponential(raw: string, path: string): string {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(raw);
  if (!match) {
    throw new PricingError('INVALID_NUMBER', `"${raw}" is not a valid number.`, path);
  }
  const [, sign, whole, fraction = '', exponentText] = match;
  const exponent = Number(exponentText);
  const digits = whole + fraction;
  const pointIndex = whole.length + exponent;

  if (pointIndex <= 0) {
    return `${sign}0.${'0'.repeat(-pointIndex)}${digits}`;
  }
  if (pointIndex >= digits.length) {
    return `${sign}${digits}${'0'.repeat(pointIndex - digits.length)}`;
  }
  return `${sign}${digits.slice(0, pointIndex)}.${digits.slice(pointIndex)}`;
}

/** Parses a money amount into minor units for the given currency. */
export function parseMoney(
  input: string | number,
  currency: CurrencyCode,
  path: string,
  options: { allowNegative?: boolean } = {},
): number {
  const minor = parseScaledInt(input, currencyExponent(currency), path, options);
  assertWithinRange(minor, path);
  return minor;
}

/** Parses a percentage into hundredths of a percent (basis points). */
export function parsePercent(input: string | number, path: string): number {
  const scaled = parseScaledInt(input, PERCENT_SCALE, path);
  if (scaled > MAX_PERCENT_SCALED) {
    throw new PricingError(
      'PERCENT_OUT_OF_RANGE',
      `Percentage must be between 0 and ${MAX_PERCENT_SCALED / 10 ** PERCENT_SCALE}.`,
      path,
      { max: MAX_PERCENT_SCALED / 10 ** PERCENT_SCALE },
    );
  }
  return scaled;
}

/** Parses a quantity into thousandths. */
export function parseQuantity(input: string | number, path: string): number {
  const scaled = parseScaledInt(input, QUANTITY_SCALE, path);
  assertWithinRange(scaled, path);
  return scaled;
}

export function assertWithinRange(minor: number, path: string): void {
  if (Math.abs(minor) > MAX_MINOR_UNITS) {
    throw new PricingError(
      'OUT_OF_RANGE',
      'Amount exceeds the maximum supported value.',
      path,
      { max: MAX_MINOR_UNITS },
    );
  }
}

/**
 * Computes `round(a * b / divisor)` exactly, using half-up rounding
 * (ties round away from zero).
 *
 * `BigInt` keeps the intermediate product exact regardless of magnitude — the
 * one place where a plain `number` could silently lose precision.
 */
export function mulDivRoundHalfUp(a: number, b: number, divisor: number): number {
  if (divisor === 0) throw new PricingError('INVALID_NUMBER', 'Division by zero.', '');
  if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(divisor)) {
    throw new PricingError(
      'INVALID_NUMBER',
      'Fixed-point arithmetic requires integer operands.',
      '',
    );
  }

  const product = BigInt(a) * BigInt(b);
  const d = BigInt(divisor);
  const negative = product < 0n !== d < 0n;
  const absProduct = product < 0n ? -product : product;
  const absDivisor = d < 0n ? -d : d;

  // floor((2n + d) / 2d) === round-half-up for non-negative n.
  const rounded = (absProduct * 2n + absDivisor) / (absDivisor * 2n);
  const result = Number(negative ? -rounded : rounded);

  if (!Number.isSafeInteger(result)) {
    throw new PricingError(
      'AMOUNT_OVERFLOW',
      'Computed amount is too large to represent exactly.',
      '',
    );
  }
  return result;
}

/** Applies a scaled percentage to an amount in minor units, rounded half-up. */
export function applyPercent(amountMinor: number, percentScaled: number): number {
  return mulDivRoundHalfUp(amountMinor, percentScaled, PERCENT_DENOMINATOR);
}

/** Multiplies an amount in minor units by a scaled quantity, rounded half-up. */
export function multiplyByQuantity(
  amountMinor: number,
  quantityScaled: number,
): number {
  return mulDivRoundHalfUp(amountMinor, quantityScaled, QUANTITY_DENOMINATOR);
}

/** Renders minor units as a plain decimal string, e.g. `18900` -> `"189.00"`. */
export function formatMinor(minor: number, currency: CurrencyCode): string {
  const exponent = currencyExponent(currency);
  const negative = minor < 0;
  const digits = Math.abs(minor).toString().padStart(exponent + 1, '0');
  if (exponent === 0) return `${negative ? '-' : ''}${digits}`;
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** Renders a scaled percentage, e.g. `1250` -> `"12.5"`. */
export function formatPercent(percentScaled: number): string {
  const text = (percentScaled / 10 ** PERCENT_SCALE).toFixed(PERCENT_SCALE);
  return text.replace(/\.?0+$/, '');
}

/** Renders a scaled quantity, e.g. `2500` -> `"2.5"`. */
export function formatQuantity(quantityScaled: number): string {
  const text = (quantityScaled / QUANTITY_DENOMINATOR).toFixed(QUANTITY_SCALE);
  return text.replace(/\.?0+$/, '');
}

/**
 * Converts minor units to a `number` in major units.
 * Display only — never feed the result back into a calculation.
 */
export function minorToMajorNumber(minor: number, currency: CurrencyCode): number {
  return minor / 10 ** currencyExponent(currency);
}
