import { defineRoute } from '@/lib/api/route';
import { duplicateDocument } from '@/lib/documents/service';
import {
  documentIdParamSchema,
  duplicateDocumentSchema,
} from '@/lib/validation/documents';

export const runtime = 'nodejs';

/**
 * Copies any document — including a finalized one — into a new draft.
 *
 * This is the sanctioned way to "edit" an issued document: the original stays
 * exactly as the customer received it, and the correction happens on a new
 * record that links back to it.
 */
export const POST = defineRoute({
  params: documentIdParamSchema,
  body: duplicateDocumentSchema,
  idempotent: true,
  successStatus: 201,
  handler: async ({ userId, params, body, ctx }) => ({
    document: await duplicateDocument(
      userId,
      params.id,
      { title: body?.title, issueDate: body?.issueDate },
      ctx,
    ),
  }),
});
