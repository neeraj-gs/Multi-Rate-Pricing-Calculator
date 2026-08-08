/** Public types for the pricing engine. */

export type DiscountType = 'percent' | 'fixed';

/** Decimal values may arrive as strings (lossless) or numbers (JSON-friendly). */
export type DecimalInput = string | number;

export interface DiscountInput {
  type: DiscountType;
  /** Percent (0–1000) when `type === 'percent'`, else an amount in major units. */
  value: DecimalInput;
}

export interface LineInput {
  /** Stable identifier, preserved through the calculation for client mapping. */
  id?: string;
  description?: string;
  quantity: DecimalInput;
  unitPrice: DecimalInput;
  discount?: DiscountInput | null;
  /** Tax percentage applied to the *discounted* line amount. */
  taxPercent?: DecimalInput | null;
}

export interface DocumentInput {
  currency: string;
  lines: LineInput[];
}

/**
 * Every amount is carried twice: `*Minor` is the integer source of truth used
 * for arithmetic and storage; the plain field is a formatted decimal string for
 * display. Strings — not floats — so nothing re-introduces drift downstream.
 */
export interface LineTotals {
  id?: string;
  description?: string;

  quantity: string;
  quantityScaled: number;
  unitPrice: string;
  unitPriceMinor: number;

  discountType: DiscountType | null;
  /** Percent as entered (`"10"`), or the fixed amount (`"20.00"`). */
  discountValue: string | null;
  /**
   * The same discount as the integer the database stores: scaled percent when
   * `discountType === 'percent'`, minor units when `'fixed'`. Carried here so
   * persistence never has to re-parse the caller's input — one parse, one
   * source of truth.
   */
  discountValueScaled: number | null;

  subtotal: string;
  subtotalMinor: number;

  discountAmount: string;
  discountAmountMinor: number;

  discountedAmount: string;
  discountedAmountMinor: number;

  taxPercent: string | null;
  /** Tax percent x 100, as stored. `null` when the line is untaxed. */
  taxPercentScaled: number | null;
  taxAmount: string;
  taxAmountMinor: number;

  total: string;
  totalMinor: number;

  /**
   * Discount as a share of subtotal, in scaled percent. For a fixed discount
   * this is derived, so reports can compare like with like.
   */
  effectiveDiscountPercentScaled: number;
}

export interface DocumentTotals {
  currency: string;

  subtotal: string;
  subtotalMinor: number;

  totalDiscount: string;
  totalDiscountMinor: number;

  totalTax: string;
  totalTaxMinor: number;

  grandTotal: string;
  grandTotalMinor: number;

  lineCount: number;
}

export interface CalculatedDocument {
  lines: LineTotals[];
  totals: DocumentTotals;
}
