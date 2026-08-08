import {
  formatMinor,
  formatPercent,
  formatQuantity,
  type DiscountType,
  type LineInput,
} from '@/lib/pricing';
import { toCalendarDate } from '@/lib/validation/common';
import type { DocumentLine, DocumentRecord } from '@/lib/db';

/**
 * Wire format for a document.
 *
 * Every amount is sent **twice**: as a formatted decimal string for display,
 * and as the integer minor-unit value under `amounts`. Clients render the
 * string and compare the integer. A JSON number for money would put the value
 * straight back into a float on the way in — the exact drift this system spends
 * its effort avoiding — so no monetary value is ever serialised as a number.
 */

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
  status: 'draft' | 'finalized';
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

function serializeDiscount(
  line: DocumentLine,
  currency: string,
): ApiLine['discount'] {
  if (!line.discountType || line.discountValueScaled == null) return null;
  return {
    type: line.discountType as DiscountType,
    value:
      line.discountType === 'percent'
        ? formatPercent(line.discountValueScaled)
        : formatMinor(line.discountValueScaled, currency),
  };
}

export function serializeLine(line: DocumentLine, currency: string): ApiLine {
  const discountedAmountMinor = line.discountedAmountMinor;
  return {
    id: String((line as unknown as { _id: unknown })._id),
    description: line.description,
    position: line.position,
    quantity: formatQuantity(line.quantityScaled),
    unitPrice: formatMinor(line.unitPriceMinor, currency),
    discount: serializeDiscount(line, currency),
    taxPercent: line.taxPercentScaled == null ? null : formatPercent(line.taxPercentScaled),

    subtotal: formatMinor(line.subtotalMinor, currency),
    discountAmount: formatMinor(line.discountAmountMinor, currency),
    discountedAmount: formatMinor(discountedAmountMinor, currency),
    taxAmount: formatMinor(line.taxAmountMinor, currency),
    total: formatMinor(line.totalMinor, currency),

    amounts: {
      quantityScaled: line.quantityScaled,
      unitPriceMinor: line.unitPriceMinor,
      subtotalMinor: line.subtotalMinor,
      discountAmountMinor: line.discountAmountMinor,
      discountedAmountMinor,
      taxAmountMinor: line.taxAmountMinor,
      totalMinor: line.totalMinor,
    },
  };
}

export function serializeTotals(
  totals: DocumentRecord['totals'],
  currency: string,
  lineCount: number,
): ApiTotals {
  return {
    currency,
    subtotal: formatMinor(totals.subtotalMinor, currency),
    totalDiscount: formatMinor(totals.totalDiscountMinor, currency),
    totalTax: formatMinor(totals.totalTaxMinor, currency),
    grandTotal: formatMinor(totals.grandTotalMinor, currency),
    amounts: {
      subtotalMinor: totals.subtotalMinor,
      totalDiscountMinor: totals.totalDiscountMinor,
      totalTaxMinor: totals.totalTaxMinor,
      grandTotalMinor: totals.grandTotalMinor,
    },
    lineCount,
  };
}

export function serializeDocument(
  record: DocumentRecord & { _id: unknown; createdAt?: Date; updatedAt?: Date },
): ApiDocument {
  const currency = record.currency;
  const lines = [...record.lines]
    .sort((a, b) => a.position - b.position)
    .map((line) => serializeLine(line, currency));

  return {
    id: String(record._id),
    number: record.number,
    title: record.title,
    customer: {
      name: record.customer?.name ?? '',
      email: record.customer?.email ?? '',
      address: record.customer?.address ?? '',
    },
    issueDate: toCalendarDate(record.issueDate),
    dueDate: toCalendarDate(record.dueDate),
    status: record.status as 'draft' | 'finalized',
    currency,
    notes: record.notes ?? '',
    terms: record.terms ?? '',
    lines,
    totals: serializeTotals(record.totals, currency, lines.length),
    editable: record.status === 'draft',
    finalizedAt: record.finalizedAt ? new Date(record.finalizedAt).toISOString() : null,
    duplicatedFromId: record.duplicatedFromId ? String(record.duplicatedFromId) : null,
    revision: record.revision,
    createdAt: record.createdAt ? new Date(record.createdAt).toISOString() : null,
    updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : null,
  };
}

/**
 * Turns stored lines back into engine input.
 *
 * Editing one line means recalculating the whole document, and the engine only
 * speaks decimal input. Round-tripping through the same formatters the API uses
 * guarantees the reconstructed input is byte-identical to what was originally
 * submitted, so a no-op edit cannot silently change a stored figure.
 */
export function storedLineToInput(line: DocumentLine, currency: string): LineInput {
  return {
    id: String((line as unknown as { _id: unknown })._id),
    description: line.description,
    quantity: formatQuantity(line.quantityScaled),
    unitPrice: formatMinor(line.unitPriceMinor, currency),
    discount:
      line.discountType && line.discountValueScaled != null
        ? {
            type: line.discountType as DiscountType,
            value:
              line.discountType === 'percent'
                ? formatPercent(line.discountValueScaled)
                : formatMinor(line.discountValueScaled, currency),
          }
        : null,
    taxPercent: line.taxPercentScaled == null ? null : formatPercent(line.taxPercentScaled),
  };
}
