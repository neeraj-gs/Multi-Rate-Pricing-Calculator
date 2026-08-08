import {
  formatMinor,
  formatPercent,
  formatQuantity,
  type DiscountType,
  type LineInput,
} from '@/lib/pricing';
import { toCalendarDate } from '@/lib/validation/common';
import type { DocumentLine, DocumentRecord } from '@/lib/db';
import type { ApiDocument, ApiLine, ApiTotals } from './types';

export type { ApiDocument, ApiLine, ApiTotals } from './types';

/**
 * Wire format for a document.
 *
 * Every amount is sent **twice**: as a formatted decimal string for display,
 * and as the integer minor-unit value under `amounts`. Clients render the
 * string and compare the integer. A JSON number for money would put the value
 * straight back into a float on the way in — the exact drift this system spends
 * its effort avoiding — so no monetary value is ever serialised as a number.
 */

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
