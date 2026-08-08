import { defineRoute } from '@/lib/api/route';
import { addLine } from '@/lib/documents/service';
import { createLineSchema, documentIdParamSchema } from '@/lib/validation/documents';

export const runtime = 'nodejs';

/**
 * Appends (or inserts) one line on a draft.
 *
 * Returns the **whole document**, not just the new line. Adding a line changes
 * every document-level total, so returning the line alone would force the
 * client to recompute totals locally — the one thing the brief rules out.
 */
export const POST = defineRoute({
  params: documentIdParamSchema,
  body: createLineSchema,
  successStatus: 201,
  handler: async ({ userId, params, body, ctx }) => ({
    document: await addLine(userId, params.id, body, ctx),
  }),
});
