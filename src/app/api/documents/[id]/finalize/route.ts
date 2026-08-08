import { defineRoute } from '@/lib/api/route';
import { finalizeDocument } from '@/lib/documents/service';
import {
  documentIdParamSchema,
  finalizeDocumentSchema,
} from '@/lib/validation/documents';

export const runtime = 'nodejs';

/**
 * Issues a document, freezing it permanently.
 *
 * Validates first (at least one line, a customer, no non-positive quantities or
 * negative prices), then recalculates and freezes. Finalizing twice is a 409
 * rather than a silent no-op, so a double-clicked button is reported rather
 * than hidden.
 */
export const POST = defineRoute({
  params: documentIdParamSchema,
  body: finalizeDocumentSchema,
  idempotent: true,
  handler: async ({ userId, params, body, ctx }) => ({
    document: await finalizeDocument(userId, params.id, body?.revision, ctx),
  }),
});
