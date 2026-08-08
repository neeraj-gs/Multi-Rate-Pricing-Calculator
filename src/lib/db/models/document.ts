import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import { SUPPORTED_CURRENCIES } from '@/lib/pricing';

/**
 * ## Why line items are embedded, not a separate collection
 *
 * Lines are only ever read as part of their document, only ever written as part
 * of their document, and are naturally bounded (a quote with 500 lines is a CSV
 * import, not a quote). Embedding gives:
 *
 *   - **One round trip** to render a document — no `$lookup`, no N+1.
 *   - **Atomic writes.** Recalculating totals and rewriting lines is a single
 *     document update, so a crash can never leave stored totals disagreeing
 *     with the lines above them. With a separate collection this would need a
 *     multi-document transaction on every keystroke-level save.
 *   - **A natural immutability boundary.** Freezing a finalized document is one
 *     guarded update, not a cascade across collections.
 *
 * The tradeoff is the 16 MB document ceiling and the cost of rewriting the
 * array on every edit. `MAX_LINES_PER_DOCUMENT` keeps both bounded, and the
 * migration path — if a customer ever needs thousands of lines — is a separate
 * `documentLines` collection keyed by `documentId`, with totals still stored on
 * the parent.
 *
 * ## Why computed amounts are stored
 *
 * Every line carries its own `subtotalMinor`, `discountAmountMinor`,
 * `taxAmountMinor` and `totalMinor`, and the parent stores the rollup. They are
 * derived data, and storing derived data is normally a smell — but here it buys
 * two things worth more than the redundancy:
 *
 *   1. **Reports aggregate in the database.** A date-range summary is one
 *      indexed `$match` plus a `$group`, instead of loading every document into
 *      the application to re-add it up.
 *   2. **A finalized document is a snapshot.** If tax rules or rounding ever
 *      change, an already-issued quote keeps the figures the customer accepted.
 *
 * The invariant that makes this safe: **stored amounts are only ever written by
 * `calculateDocument`.** No route computes a total by hand. See
 * `src/lib/documents/service.ts`, which is the only module that writes here.
 */

export const MAX_LINES_PER_DOCUMENT = 200;

const lineSchema = new Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 500 },
    position: { type: Number, required: true, default: 0 },

    // ---- Inputs (integers; see src/lib/pricing/money.ts) -------------------
    /** Quantity x 1000. `2.5` is stored as `2500`. */
    quantityScaled: { type: Number, required: true, min: 1 },
    /** Unit price in the currency's minor units. */
    unitPriceMinor: { type: Number, required: true, min: 0 },

    discountType: { type: String, enum: ['percent', 'fixed', null], default: null },
    /** Percent x 100 when `discountType === 'percent'`, else minor units. */
    discountValueScaled: { type: Number, default: null, min: 0 },
    /** Tax percent x 100. `5%` is stored as `500`. */
    taxPercentScaled: { type: Number, default: null, min: 0 },

    // ---- Computed by the pricing engine, never by hand --------------------
    subtotalMinor: { type: Number, required: true, min: 0 },
    discountAmountMinor: { type: Number, required: true, min: 0, default: 0 },
    discountedAmountMinor: { type: Number, required: true, min: 0 },
    taxAmountMinor: { type: Number, required: true, min: 0, default: 0 },
    totalMinor: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const totalsSchema = new Schema(
  {
    subtotalMinor: { type: Number, required: true, default: 0 },
    totalDiscountMinor: { type: Number, required: true, default: 0 },
    totalTaxMinor: { type: Number, required: true, default: 0 },
    grandTotalMinor: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const documentSchema = new Schema(
  {
    // Every query in the app is scoped by `userId`. It leads every index for
    // that reason — tenant isolation and index selectivity in one field.
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    number: { type: String, required: true },
    sequence: { type: Number, required: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },

    customer: {
      name: { type: String, required: true, trim: true, maxlength: 200 },
      email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
      address: { type: String, trim: true, maxlength: 500, default: '' },
    },

    /**
     * Normalised to UTC midnight of the calendar date it represents.
     * Issue date is a *date*, not an instant: a quote issued on 31 January in
     * Dubai must land in January's report for a reviewer in London too. Storing
     * a wall-clock timestamp would silently move documents between periods
     * depending on who is looking.
     */
    issueDate: { type: Date, required: true },
    dueDate: { type: Date, default: null },

    status: {
      type: String,
      enum: ['draft', 'finalized'],
      required: true,
      default: 'draft',
    },

    currency: {
      type: String,
      required: true,
      uppercase: true,
      enum: SUPPORTED_CURRENCIES,
      default: 'AED',
    },

    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    terms: { type: String, trim: true, maxlength: 2000, default: '' },

    lines: {
      type: [lineSchema],
      default: [],
      validate: {
        validator: (lines: unknown[]) => lines.length <= MAX_LINES_PER_DOCUMENT,
        message: `A document may not exceed ${MAX_LINES_PER_DOCUMENT} line items.`,
      },
    },

    totals: { type: totalsSchema, required: true, default: () => ({}) },

    finalizedAt: { type: Date, default: null },
    /** Set when this document was created by duplicating another. */
    duplicatedFromId: { type: Schema.Types.ObjectId, ref: 'Document', default: null },

    /**
     * Optimistic concurrency token. Clients echo the revision they read; a
     * write whose revision no longer matches is rejected with 409 rather than
     * quietly overwriting a change made in another tab.
     */
    revision: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, versionKey: false },
);

// ---------------------------------------------------------------------------
// Indexes. Each one exists for a specific query in this codebase.
// ---------------------------------------------------------------------------

/**
 * Default list view and the summary report, which both scan a user's documents
 * by issue date. `_id` tie-breaks so pagination is stable when several
 * documents share a date.
 */
documentSchema.index({ userId: 1, issueDate: -1, _id: -1 });

/** The status filter chips ("Drafts" / "Finalized") in the documents list. */
documentSchema.index({ userId: 1, status: 1, issueDate: -1 });

/** Document numbers are unique per user, and are looked up directly by number. */
documentSchema.index({ userId: 1, number: 1 }, { unique: true });

/** "Recently edited" on the dashboard. */
documentSchema.index({ userId: 1, updatedAt: -1 });

/** Grouping documents by customer on the dashboard and in reports. */
documentSchema.index({ userId: 1, 'customer.name': 1, issueDate: -1 });

export type DocumentLine = InferSchemaType<typeof lineSchema>;
export type DocumentRecord = InferSchemaType<typeof documentSchema>;

export const DocumentModel: Model<DocumentRecord> =
  (models.Document as Model<DocumentRecord>) ??
  model<DocumentRecord>('Document', documentSchema);
