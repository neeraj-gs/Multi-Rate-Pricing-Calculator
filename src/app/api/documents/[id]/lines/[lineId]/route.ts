import { defineRoute } from '@/lib/api/route';
import { removeLine, updateLine } from '@/lib/documents/service';
import { lineIdParamSchema, updateLineSchema } from '@/lib/validation/documents';

export const runtime = 'nodejs';

export const PATCH = defineRoute({
  params: lineIdParamSchema,
  body: updateLineSchema,
  handler: async ({ userId, params, body, ctx }) => ({
    document: await updateLine(userId, params.id, params.lineId, body, ctx),
  }),
});

export const DELETE = defineRoute({
  params: lineIdParamSchema,
  handler: async ({ userId, params, ctx }) => ({
    document: await removeLine(userId, params.id, params.lineId, ctx),
  }),
});
