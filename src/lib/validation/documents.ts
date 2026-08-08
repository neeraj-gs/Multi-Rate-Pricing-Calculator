import { z } from 'zod';
import {
  calendarDateSchema,
  currencySchema,
  decimalInput,
  objectIdSchema,
  paginationSchema,
} from './common';
import { MAX_LINES_PER_DOCUMENT } from '@/lib/db/models/document';
import { parseQuantity, PricingError, QUANTITY_DENOMINATOR } from '@/lib/pricing';

/**
 * A discount is a tagged union, so "percent and fixed at the same time" is
 * unrepresentable rather than merely forbidden — rule 3 of the brief enforced
 * by the type system.
 *
 * The `.strict()` call matters: a client sending the older
 * `{ discountPercent, discountFixed }` shape gets a clear rejection instead of
 * having its fields silently dropped, which would produce a document with no
 * discount and no explanation.
 */
export const discountSchema = z
  .object({
    type: z.enum(['percent', 'fixed'], {
      errorMap: () => ({ message: 'Discount type must be "percent" or "fixed".' }),
    }),
    value: decimalInput,
  })
  .strict('Unexpected field on discount. Use { type, value }.');

/**
 * The line-item fields, as a plain object schema.
 *
 * Kept separate from `lineInputSchema` because a Zod schema carrying a
 * `superRefine` can no longer be `.extend()`ed or `.partial()`ed — and the
 * add-a-line and patch-a-line endpoints need exactly those operations.
 */
export const lineFieldsSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(1, 'Description is required.')
      .max(500, 'Description must be 500 characters or fewer.'),

    /**
     * The brief specifies quantity >= 1, so that is what the API enforces.
     * Up to three decimal places are allowed above that floor, because
     * "7.25 hours" is a real line item on a professional-services quote.
     */
    quantity: decimalInput,

    unitPrice: decimalInput,

    discount: discountSchema.nullish().default(null),

    taxPercent: decimalInput.nullish().default(null),
  })
  .strict();

/**
 * Rejects a quantity below 1, reusing the engine's decimal parser rather than
 * re-implementing one here. Two parsers would eventually disagree about a value
 * like `"1.0000"`.
 */
function refineQuantity(
  quantity: string | number | undefined,
  context: z.RefinementCtx,
): void {
  if (quantity === undefined) return;
  try {
    if (parseQuantity(quantity, 'quantity') < QUANTITY_DENOMINATOR) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity'],
        message: 'Quantity must be at least 1.',
      });
    }
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['quantity'],
      message:
        error instanceof PricingError ? error.message : 'Quantity is not a valid number.',
    });
  }
}

export const lineInputSchema = lineFieldsSchema.superRefine((value, context) =>
  refineQuantity(value.quantity, context),
);

export const createDocumentSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Title is required.')
      .max(200, 'Title must be 200 characters or fewer.'),

    customer: z
      .object({
        name: z
          .string()
          .trim()
          .min(1, 'Customer name is required.')
          .max(200, 'Customer name must be 200 characters or fewer.'),
        email: z
          .string()
          .trim()
          .toLowerCase()
          .max(254)
          .email('Enter a valid customer email address.')
          .or(z.literal(''))
          .optional()
          .default(''),
        address: z.string().trim().max(500).optional().default(''),
      })
      .strict(),

    issueDate: calendarDateSchema,
    dueDate: calendarDateSchema.nullish().default(null),

    currency: currencySchema.default('AED'),

    notes: z.string().trim().max(2000).optional().default(''),
    terms: z.string().trim().max(2000).optional().default(''),

    lines: z
      .array(lineInputSchema)
      .max(
        MAX_LINES_PER_DOCUMENT,
        `A document may not exceed ${MAX_LINES_PER_DOCUMENT} line items.`,
      )
      .optional()
      .default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.dueDate && value.dueDate < value.issueDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueDate'],
        message: 'Due date cannot be earlier than the issue date.',
      });
    }
  });

/**
 * Updates are a partial of create.
 *
 * ## Changing currency
 *
 * Amounts are stored as integer minor units, so the naive swap reinterprets
 * every one of them — 10000 is 100.00 in AED and 10.000 in KWD, and a price
 * would silently move by a factor of ten.
 *
 * The service therefore does not reinterpret the integers. It reads each line
 * back out as the decimal text it was entered as, changes the currency, and
 * re-parses that text at the new precision: a line typed as 100.00 stays 100,
 * which is what someone switching currency actually means. Where the value
 * cannot survive the move — 100.50 into JPY, which has no minor unit — the
 * request is rejected naming the line, rather than quietly truncating it.
 *
 * Drafts only. A finalized document is frozen like everything else about it.
 */
export const updateDocumentSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required.').max(200).optional(),
    currency: currencySchema.optional(),
    customer: z
      .object({
        name: z.string().trim().min(1, 'Customer name is required.').max(200),
        email: z
          .string()
          .trim()
          .toLowerCase()
          .max(254)
          .email('Enter a valid customer email address.')
          .or(z.literal(''))
          .optional()
          .default(''),
        address: z.string().trim().max(500).optional().default(''),
      })
      .strict()
      .optional(),
    issueDate: calendarDateSchema.optional(),
    dueDate: calendarDateSchema.nullish(),
    notes: z.string().trim().max(2000).optional(),
    terms: z.string().trim().max(2000).optional(),
    lines: z
      .array(lineInputSchema)
      .max(
        MAX_LINES_PER_DOCUMENT,
        `A document may not exceed ${MAX_LINES_PER_DOCUMENT} line items.`,
      )
      .optional(),
    /** Echoed from the last read; a mismatch means someone else edited first. */
    revision: z.number().int().positive().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const documentIdParamSchema = z.object({ id: objectIdSchema });

export const lineIdParamSchema = z.object({
  id: objectIdSchema,
  lineId: objectIdSchema,
});

/** Adding one line to an existing draft. */
export const createLineSchema = lineFieldsSchema
  .extend({
    /** Zero-based insert position; appends when omitted. */
    position: z.number().int().min(0).optional(),
  })
  .superRefine((value, context) => refineQuantity(value.quantity, context));

export const updateLineSchema = lineFieldsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  })
  .superRefine((value, context) => refineQuantity(value.quantity, context));

export const listDocumentsSchema = paginationSchema.extend({
  status: z.enum(['draft', 'finalized', 'all']).default('all'),
  q: z.string().trim().max(200).optional(),
  from: calendarDateSchema.optional(),
  to: calendarDateSchema.optional(),
  customer: z.string().trim().max(200).optional(),
  sort: z
    .enum(['issueDate', '-issueDate', 'updatedAt', '-updatedAt', 'total', '-total'])
    .default('-issueDate'),
});

export const duplicateDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    issueDate: calendarDateSchema.optional(),
  })
  .strict()
  .optional()
  .default({});

export const finalizeDocumentSchema = z
  .object({
    revision: z.number().int().positive().optional(),
  })
  .strict()
  .optional()
  .default({});

/**
 * Report range.
 *
 * Both bounds are inclusive, matching how a person reads "1 Jan to 31 Jan".
 * An exclusive upper bound is the classic source of "the last day of the month
 * is missing from my report" support tickets.
 */
export const reportRangeSchema = z
  .object({
    from: calendarDateSchema,
    to: calendarDateSchema,
    status: z.enum(['draft', 'finalized', 'all']).default('all'),
    currency: currencySchema.optional(),
    groupBy: z.enum(['day', 'week', 'month']).default('month'),
  })
  .refine((value) => value.from <= value.to, {
    path: ['from'],
    message: 'The start of the range must not be after the end.',
  });

export const shareLinkSchema = z
  .object({
    expiresInDays: z.number().int().min(1).max(365).default(30),
  })
  .strict()
  .optional()
  .default({});

/** Stateless calculation preview — no persistence, no auth-scoped data. */
export const previewSchema = z
  .object({
    currency: currencySchema.default('AED'),
    lines: z.array(lineInputSchema).max(MAX_LINES_PER_DOCUMENT).default([]),
  })
  .strict();

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type LineItemInput = z.infer<typeof lineInputSchema>;
export type ListDocumentsQuery = z.infer<typeof listDocumentsSchema>;
export type ReportRangeQuery = z.infer<typeof reportRangeSchema>;
