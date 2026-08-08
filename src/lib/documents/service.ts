import { Types } from 'mongoose';

import {
  DocumentModel,
  User,
  formatDocumentNumber,
  nextSequence,
  type DocumentLine,
  type DocumentRecord,
} from '@/lib/db';
import { calculateDocument, type LineInput, type LineTotals } from '@/lib/pricing';
import { ApiError } from '@/lib/api/errors';
import { diffFields, recordAudit } from '@/lib/api/audit';
import type { RequestContext } from '@/lib/api/context';
import type {
  CreateDocumentInput,
  LineItemInput,
  UpdateDocumentInput,
} from '@/lib/validation/documents';
import { serializeDocument, storedLineToInput, type ApiDocument } from './serialize';

/**
 * All document writes go through this module.
 *
 * Two invariants are enforced here and nowhere else, which is the point of
 * having the layer at all:
 *
 *   1. **Stored amounts only ever come from `calculateDocument`.** No route
 *      assembles a total by hand, so the printed document, the stored record
 *      and the summary report cannot drift apart.
 *   2. **A finalized document is immutable.** Every mutating path calls
 *      `assertEditable` before touching anything. The check is not repeated in
 *      each route handler, because a check that must be remembered on every new
 *      endpoint is a check that will eventually be missed.
 */

type LoadedDocument = DocumentRecord & {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
  save: () => Promise<unknown>;
};

/** Rejects any edit to a finalized document, with an explanation of the way out. */
export function assertEditable(document: Pick<DocumentRecord, 'status'>): void {
  if (document.status === 'finalized') {
    throw new ApiError(
      409,
      'DOCUMENT_FINALIZED',
      'This document is finalized and can no longer be edited. Duplicate it into a new draft if you need to make changes.',
      [
        {
          path: 'status',
          message: 'Finalized documents are read-only.',
          code: 'DOCUMENT_FINALIZED',
        },
      ],
    );
  }
}

/**
 * Optimistic concurrency.
 *
 * Two tabs open on the same draft is not a hypothetical — it is the normal way
 * people work. Last-write-wins would silently discard the other tab's edit;
 * this turns that into a 409 the UI can explain and recover from.
 */
function assertRevision(document: DocumentRecord, expected: number | undefined): void {
  if (expected !== undefined && expected !== document.revision) {
    throw new ApiError(
      409,
      'REVISION_MISMATCH',
      'This document was changed somewhere else since you loaded it. Refresh to see the latest version.',
      [
        {
          path: 'revision',
          message: `Expected revision ${document.revision}, received ${expected}.`,
        },
      ],
    );
  }
}

/** Loads a document, scoped to its owner. Cross-tenant reads are simply 404s. */
export async function loadOwnedDocument(
  userId: string,
  documentId: string,
): Promise<LoadedDocument> {
  if (!Types.ObjectId.isValid(documentId)) {
    throw ApiError.notFound('Document not found.');
  }

  const document = await DocumentModel.findOne({
    _id: new Types.ObjectId(documentId),
    // `userId` is part of the *query*, not an afterwards check. A document
    // belonging to someone else is indistinguishable from one that does not
    // exist, so the API never confirms the existence of another user's data.
    userId: new Types.ObjectId(userId),
  });

  if (!document) throw ApiError.notFound('Document not found.');
  return document as unknown as LoadedDocument;
}

/** Maps engine output onto the stored line shape. */
function toStoredLines(
  inputs: LineItemInput[] | LineInput[],
  computed: LineTotals[],
): DocumentLine[] {
  return computed.map((line, index) => ({
    description: String(
      (inputs[index] as { description?: string })?.description ?? line.description ?? '',
    ),
    position: index,
    quantityScaled: line.quantityScaled,
    unitPriceMinor: line.unitPriceMinor,
    discountType: line.discountType,
    discountValueScaled: line.discountValueScaled,
    taxPercentScaled: line.taxPercentScaled,
    subtotalMinor: line.subtotalMinor,
    discountAmountMinor: line.discountAmountMinor,
    discountedAmountMinor: line.discountedAmountMinor,
    taxAmountMinor: line.taxAmountMinor,
    totalMinor: line.totalMinor,
  })) as unknown as DocumentLine[];
}

/**
 * Recalculates a document's lines and totals from scratch.
 *
 * Always the whole document, never a delta. Applying an incremental adjustment
 * ("subtract the old line total, add the new one") is faster and is how stored
 * totals drift out of sync with their lines after a few years of edge cases.
 */
function applyLines(
  document: LoadedDocument,
  lines: LineItemInput[] | LineInput[],
): void {
  const { lines: computed, totals } = calculateDocument({
    currency: document.currency,
    lines: lines as LineInput[],
  });

  document.lines = toStoredLines(lines, computed) as typeof document.lines;
  document.totals = {
    subtotalMinor: totals.subtotalMinor,
    totalDiscountMinor: totals.totalDiscountMinor,
    totalTaxMinor: totals.totalTaxMinor,
    grandTotalMinor: totals.grandTotalMinor,
  } as typeof document.totals;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createDocument(
  userId: string,
  input: CreateDocumentInput,
  ctx?: RequestContext,
): Promise<ApiDocument> {
  const owner = await User.findById(userId).lean();
  const prefix = owner?.preferences?.documentPrefix ?? 'QT';
  const sequence = await nextSequence(userId);

  const { lines: computed, totals } = calculateDocument({
    currency: input.currency,
    lines: input.lines as LineInput[],
  });

  const created = await DocumentModel.create({
    userId: new Types.ObjectId(userId),
    number: formatDocumentNumber(prefix, sequence),
    sequence,
    title: input.title,
    customer: input.customer,
    issueDate: input.issueDate,
    dueDate: input.dueDate ?? null,
    status: 'draft',
    currency: input.currency,
    notes: input.notes,
    terms: input.terms,
    lines: toStoredLines(input.lines, computed),
    totals: {
      subtotalMinor: totals.subtotalMinor,
      totalDiscountMinor: totals.totalDiscountMinor,
      totalTaxMinor: totals.totalTaxMinor,
      grandTotalMinor: totals.grandTotalMinor,
    },
    revision: 1,
  });

  await recordAudit({
    userId,
    action: 'document.create',
    entityType: 'document',
    entityId: String(created._id),
    entityLabel: `${created.number} — ${created.title}`,
    metadata: { lineCount: created.lines.length, grandTotal: totals.grandTotal },
    context: ctx,
  });

  return serializeDocument(created as unknown as Parameters<typeof serializeDocument>[0]);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateDocument(
  userId: string,
  documentId: string,
  input: UpdateDocumentInput,
  ctx?: RequestContext,
): Promise<ApiDocument> {
  const document = await loadOwnedDocument(userId, documentId);

  if (document.status === 'finalized') {
    // The rejection itself is worth recording: repeated attempts to edit an
    // issued document are exactly the kind of thing a finance team wants to see.
    await recordAudit({
      userId,
      action: 'document.edit_rejected',
      entityType: 'document',
      entityId: documentId,
      entityLabel: `${document.number} — ${document.title}`,
      metadata: { attemptedFields: Object.keys(input), reason: 'DOCUMENT_FINALIZED' },
      context: ctx,
    });
  }
  assertEditable(document);
  assertRevision(document, input.revision);

  const before = {
    title: document.title,
    customer: JSON.parse(JSON.stringify(document.customer)),
    issueDate: document.issueDate,
    dueDate: document.dueDate,
    notes: document.notes,
    terms: document.terms,
    currency: document.currency,
    grandTotalMinor: document.totals.grandTotalMinor,
  };

  if (input.title !== undefined) document.title = input.title;
  if (input.customer !== undefined) {
    document.customer = input.customer as typeof document.customer;
  }
  if (input.issueDate !== undefined) document.issueDate = input.issueDate;
  if (input.dueDate !== undefined) document.dueDate = input.dueDate ?? null;
  if (input.notes !== undefined) document.notes = input.notes;
  if (input.terms !== undefined) document.terms = input.terms;

  /*
   * Currency, and the one ordering that makes it safe.
   *
   * Stored amounts are integer minor units, and decoding them back to decimals
   * depends on the *old* currency's exponent — 10000 is 100.00 in AED and
   * 10.000 in KWD. So the existing lines have to be read out as text before
   * the currency changes, and re-priced from that text afterwards. Swapping
   * the currency first would reinterpret every integer and move every price.
   */
  const currencyChanged =
    input.currency !== undefined && input.currency !== document.currency;
  const carriedLines = currencyChanged ? currentLineInputs(document) : null;

  if (currencyChanged) document.currency = input.currency!;

  if (input.lines !== undefined) {
    applyLines(document, input.lines);
  } else if (carriedLines) {
    // Re-parsed at the new precision. A value that cannot survive the move —
    // 100.50 into JPY — throws here, naming the line, instead of truncating.
    applyLines(document, carriedLines);
  }

  if (document.dueDate && document.issueDate && document.dueDate < document.issueDate) {
    throw ApiError.badRequest('Due date cannot be earlier than the issue date.', [
      { path: 'dueDate', message: 'Due date cannot be earlier than the issue date.' },
    ]);
  }

  document.revision += 1;
  await document.save();

  await recordAudit({
    userId,
    action: 'document.update',
    entityType: 'document',
    entityId: documentId,
    entityLabel: `${document.number} — ${document.title}`,
    changes: diffFields(before, {
      title: document.title,
      customer: JSON.parse(JSON.stringify(document.customer)),
      issueDate: document.issueDate,
      dueDate: document.dueDate,
      notes: document.notes,
      terms: document.terms,
      currency: document.currency,
      grandTotalMinor: document.totals.grandTotalMinor,
    }),
    context: ctx,
  });

  return serializeDocument(document as unknown as Parameters<typeof serializeDocument>[0]);
}

// ---------------------------------------------------------------------------
// Line-level operations
// ---------------------------------------------------------------------------

function currentLineInputs(document: LoadedDocument): LineInput[] {
  return [...document.lines]
    .sort((a, b) => a.position - b.position)
    .map((line) => storedLineToInput(line, document.currency));
}

export async function addLine(
  userId: string,
  documentId: string,
  input: LineItemInput & { position?: number },
  ctx?: RequestContext,
): Promise<ApiDocument> {
  const document = await loadOwnedDocument(userId, documentId);
  assertEditable(document);

  const lines = currentLineInputs(document);
  const at = Math.min(input.position ?? lines.length, lines.length);
  lines.splice(at, 0, input as LineInput);

  applyLines(document, lines);
  document.revision += 1;
  await document.save();

  await recordAudit({
    userId,
    action: 'document.line.create',
    entityType: 'document',
    entityId: documentId,
    entityLabel: `${document.number} — ${document.title}`,
    metadata: { description: input.description, position: at },
    context: ctx,
  });

  return serializeDocument(document as unknown as Parameters<typeof serializeDocument>[0]);
}

export async function updateLine(
  userId: string,
  documentId: string,
  lineId: string,
  input: Partial<LineItemInput>,
  ctx?: RequestContext,
): Promise<ApiDocument> {
  const document = await loadOwnedDocument(userId, documentId);
  assertEditable(document);

  const lines = currentLineInputs(document);
  const index = lines.findIndex((line) => line.id === lineId);
  if (index === -1) throw ApiError.notFound('Line item not found on this document.');

  const before = { ...lines[index] };
  lines[index] = {
    ...lines[index],
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
    ...(input.unitPrice !== undefined ? { unitPrice: input.unitPrice } : {}),
    ...(input.discount !== undefined ? { discount: input.discount } : {}),
    ...(input.taxPercent !== undefined ? { taxPercent: input.taxPercent } : {}),
  };

  applyLines(document, lines);
  document.revision += 1;
  await document.save();

  await recordAudit({
    userId,
    action: 'document.line.update',
    entityType: 'document',
    entityId: documentId,
    entityLabel: `${document.number} — ${document.title}`,
    changes: diffFields(
      before as unknown as Record<string, unknown>,
      lines[index] as unknown as Record<string, unknown>,
    ),
    context: ctx,
  });

  return serializeDocument(document as unknown as Parameters<typeof serializeDocument>[0]);
}

export async function removeLine(
  userId: string,
  documentId: string,
  lineId: string,
  ctx?: RequestContext,
): Promise<ApiDocument> {
  const document = await loadOwnedDocument(userId, documentId);
  assertEditable(document);

  const lines = currentLineInputs(document);
  const index = lines.findIndex((line) => line.id === lineId);
  if (index === -1) throw ApiError.notFound('Line item not found on this document.');

  const [removed] = lines.splice(index, 1);
  applyLines(document, lines);
  document.revision += 1;
  await document.save();

  await recordAudit({
    userId,
    action: 'document.line.delete',
    entityType: 'document',
    entityId: documentId,
    entityLabel: `${document.number} — ${document.title}`,
    metadata: { description: removed?.description ?? '', lineId },
    context: ctx,
  });

  return serializeDocument(document as unknown as Parameters<typeof serializeDocument>[0]);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Checks worth making at the moment a document becomes a commitment.
 *
 * These are stricter than the per-field rules that apply while drafting: a
 * half-finished draft is fine, an issued quote with no lines is not. The brief
 * lists this as a stretch goal; it is cheap and it is the last point at which
 * a mistake is still free to fix.
 */
export function collectFinalizeProblems(document: DocumentRecord): string[] {
  const problems: string[] = [];

  if (document.lines.length === 0) {
    problems.push('A document must have at least one line item before it can be finalized.');
  }
  if (!document.customer?.name?.trim()) {
    problems.push('A customer name is required before finalizing.');
  }
  if (!document.issueDate) {
    problems.push('An issue date is required before finalizing.');
  }

  document.lines.forEach((line, index) => {
    const label = line.description?.trim() || `Line ${index + 1}`;
    if (line.quantityScaled <= 0) {
      problems.push(`${label}: quantity must be greater than zero.`);
    }
    if (line.unitPriceMinor < 0) {
      problems.push(`${label}: unit price cannot be negative.`);
    }
    if (line.totalMinor < 0) {
      problems.push(`${label}: line total cannot be negative.`);
    }
  });

  return problems;
}

export async function finalizeDocument(
  userId: string,
  documentId: string,
  expectedRevision: number | undefined,
  ctx?: RequestContext,
): Promise<ApiDocument> {
  const document = await loadOwnedDocument(userId, documentId);

  if (document.status === 'finalized') {
    throw new ApiError(
      409,
      'DOCUMENT_FINALIZED',
      'This document has already been finalized.',
      [{ path: 'status', message: 'Already finalized.', code: 'DOCUMENT_FINALIZED' }],
    );
  }
  assertRevision(document, expectedRevision);

  const problems = collectFinalizeProblems(document);
  if (problems.length > 0) {
    throw ApiError.unprocessable(
      'This document is not ready to be finalized.',
      problems.map((message) => ({ path: 'lines', message })),
    );
  }

  // Recalculate before freezing. If a deployment changed the engine between
  // the last edit and now, the stored figures are refreshed *before* they
  // become permanent rather than being frozen stale.
  applyLines(document, currentLineInputs(document));

  document.status = 'finalized';
  document.finalizedAt = new Date();
  document.revision += 1;
  await document.save();

  await recordAudit({
    userId,
    action: 'document.finalize',
    entityType: 'document',
    entityId: documentId,
    entityLabel: `${document.number} — ${document.title}`,
    metadata: {
      grandTotalMinor: document.totals.grandTotalMinor,
      currency: document.currency,
      lineCount: document.lines.length,
    },
    context: ctx,
  });

  return serializeDocument(document as unknown as Parameters<typeof serializeDocument>[0]);
}

/**
 * Copies any document — finalized or not — into a fresh draft.
 *
 * This is the sanctioned escape hatch from immutability. Because an issued
 * document can never be edited, "I need to change one line on the quote I sent
 * last week" has to resolve to a *new* document, and `duplicatedFromId`
 * preserves the link between the two so the history stays legible.
 */
export async function duplicateDocument(
  userId: string,
  documentId: string,
  overrides: { title?: string; issueDate?: Date } = {},
  ctx?: RequestContext,
): Promise<ApiDocument> {
  const source = await loadOwnedDocument(userId, documentId);

  const owner = await User.findById(userId).lean();
  const prefix = owner?.preferences?.documentPrefix ?? 'QT';
  const sequence = await nextSequence(userId);

  // Recomputed from the source's inputs rather than copied, so a duplicate is
  // never a vessel for stale figures.
  const inputs = currentLineInputs(source);
  const { lines: computed, totals } = calculateDocument({
    currency: source.currency,
    lines: inputs,
  });

  const copy = await DocumentModel.create({
    userId: new Types.ObjectId(userId),
    number: formatDocumentNumber(prefix, sequence),
    sequence,
    title: overrides.title ?? `${source.title} (copy)`,
    customer: JSON.parse(JSON.stringify(source.customer)),
    issueDate: overrides.issueDate ?? new Date(),
    dueDate: source.dueDate ?? null,
    status: 'draft',
    currency: source.currency,
    notes: source.notes,
    terms: source.terms,
    lines: toStoredLines(inputs, computed),
    totals: {
      subtotalMinor: totals.subtotalMinor,
      totalDiscountMinor: totals.totalDiscountMinor,
      totalTaxMinor: totals.totalTaxMinor,
      grandTotalMinor: totals.grandTotalMinor,
    },
    duplicatedFromId: source._id,
    revision: 1,
  });

  await recordAudit({
    userId,
    action: 'document.duplicate',
    entityType: 'document',
    entityId: String(copy._id),
    entityLabel: `${copy.number} — ${copy.title}`,
    metadata: { sourceId: documentId, sourceNumber: source.number },
    context: ctx,
  });

  return serializeDocument(copy as unknown as Parameters<typeof serializeDocument>[0]);
}

/**
 * Deletes a **draft**.
 *
 * Finalized documents are never deletable. An issued document is a record of
 * something that happened, and reports covering past periods must keep adding
 * up the same way tomorrow as they did today. Removing one would silently
 * change history.
 */
export async function deleteDocument(
  userId: string,
  documentId: string,
  ctx?: RequestContext,
): Promise<{ id: string; deleted: true }> {
  const document = await loadOwnedDocument(userId, documentId);

  if (document.status === 'finalized') {
    throw new ApiError(
      409,
      'DOCUMENT_FINALIZED',
      'Finalized documents cannot be deleted, because reports covering past periods depend on them.',
      [{ path: 'status', message: 'Finalized documents are permanent.' }],
    );
  }

  await DocumentModel.deleteOne({
    _id: document._id,
    userId: new Types.ObjectId(userId),
  });

  await recordAudit({
    userId,
    action: 'document.delete',
    entityType: 'document',
    entityId: documentId,
    entityLabel: `${document.number} — ${document.title}`,
    metadata: { grandTotalMinor: document.totals.grandTotalMinor },
    context: ctx,
  });

  return { id: documentId, deleted: true };
}
