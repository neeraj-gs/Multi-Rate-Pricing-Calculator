import { defineRoute } from '@/lib/api/route';
import { createDocument } from '@/lib/documents/service';
import { listDocuments } from '@/lib/documents/queries';
import { createDocumentSchema, listDocumentsSchema } from '@/lib/validation/documents';

export const runtime = 'nodejs';

export const GET = defineRoute({
  query: listDocumentsSchema,
  handler: async ({ userId, query }) => listDocuments(userId, query),
});

export const POST = defineRoute({
  body: createDocumentSchema,
  // A retried create must not produce a second quote. Clients send
  // `Idempotency-Key`; without one the endpoint behaves normally.
  idempotent: true,
  successStatus: 201,
  handler: async ({ userId, body, ctx }) => ({
    document: await createDocument(userId, body, ctx),
  }),
});
