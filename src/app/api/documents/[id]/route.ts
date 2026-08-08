import { defineRoute } from '@/lib/api/route';
import {
  deleteDocument,
  loadOwnedDocument,
  updateDocument,
} from '@/lib/documents/service';
import { serializeDocument } from '@/lib/documents/serialize';
import {
  documentIdParamSchema,
  updateDocumentSchema,
} from '@/lib/validation/documents';

export const runtime = 'nodejs';

export const GET = defineRoute({
  params: documentIdParamSchema,
  handler: async ({ userId, params }) => {
    const document = await loadOwnedDocument(userId, params.id);
    return {
      document: serializeDocument(
        document as unknown as Parameters<typeof serializeDocument>[0],
      ),
    };
  },
});

/**
 * Edits a draft.
 *
 * Rejects with `409 DOCUMENT_FINALIZED` if the document has been issued — the
 * immutability rule lives in the service layer, so it applies identically here,
 * on the line endpoints, and to anything added later.
 */
export const PATCH = defineRoute({
  params: documentIdParamSchema,
  body: updateDocumentSchema,
  handler: async ({ userId, params, body, ctx }) => ({
    document: await updateDocument(userId, params.id, body, ctx),
  }),
});

export const DELETE = defineRoute({
  params: documentIdParamSchema,
  handler: async ({ userId, params, ctx }) => deleteDocument(userId, params.id, ctx),
});
