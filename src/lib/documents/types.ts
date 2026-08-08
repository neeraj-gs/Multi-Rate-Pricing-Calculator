/**
 * The wire contract, in a file with no server imports.
 *
 * Client components need these shapes. Declaring them here rather than in
 * `serialize.ts` — which reaches into Mongoose — means a component can import
 * the type without any chance of dragging the database driver into the browser
 * bundle, even if someone later turns one of these into a runtime value.
 */

export type DiscountType = 'percent' | 'fixed';
export type DocumentStatus = 'draft' | 'finalized';

export interface ApiLine {
  id: string;
  description: string;
  position: number;
  quantity: string;
  unitPrice: string;
  discount: { type: DiscountType; value: string } | null;
  taxPercent: string | null;

  subtotal: string;
  discountAmount: string;
  discountedAmount: string;
  taxAmount: string;
  total: string;

  amounts: {
    quantityScaled: number;
    unitPriceMinor: number;
    subtotalMinor: number;
    discountAmountMinor: number;
    discountedAmountMinor: number;
    taxAmountMinor: number;
    totalMinor: number;
  };
}

export interface ApiTotals {
  currency: string;
  subtotal: string;
  totalDiscount: string;
  totalTax: string;
  grandTotal: string;
  amounts: {
    subtotalMinor: number;
    totalDiscountMinor: number;
    totalTaxMinor: number;
    grandTotalMinor: number;
  };
  lineCount: number;
}

export interface ApiDocument {
  id: string;
  number: string;
  title: string;
  customer: { name: string; email: string; address: string };
  issueDate: string | null;
  dueDate: string | null;
  status: DocumentStatus;
  currency: string;
  notes: string;
  terms: string;
  lines: ApiLine[];
  totals: ApiTotals;
  /** Convenience for the UI, so it never re-derives the lifecycle rule itself. */
  editable: boolean;
  finalizedAt: string | null;
  duplicatedFromId: string | null;
  revision: number;
  createdAt: string | null;
  updatedAt: string | null;
}

/** A line as the editor holds it, before the server has priced it. */
export interface DraftLine {
  /** Local key. Present on saved lines, generated for unsaved ones. */
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountType: DiscountType | 'none';
  discountValue: string;
  taxPercent: string;
}

/**
 * The preview endpoint's response — the engine's output, unpersisted.
 *
 * `quantity` and `unitPrice` come back normalised to the currency's precision,
 * which is what lets the preview show what will actually be *stored* rather
 * than the raw text still sitting in the input.
 */
export interface PreviewResponse {
  lines: Array<{
    quantity: string;
    unitPrice: string;
    subtotal: string;
    discountAmount: string;
    discountedAmount: string;
    taxAmount: string;
    total: string;
  }>;
  totals: {
    currency: string;
    subtotal: string;
    totalDiscount: string;
    totalTax: string;
    grandTotal: string;
    lineCount: number;
  };
}
