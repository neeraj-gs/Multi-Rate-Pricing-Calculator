import { Types } from 'mongoose';
import { z } from 'zod';

import { defineRoute } from '@/lib/api/route';
import { AuditLog } from '@/lib/db';
import { loadOwnedDocument } from '@/lib/documents/service';
import { documentIdParamSchema } from '@/lib/validation/documents';

export const runtime = 'nodejs';

/** The activity feed shown beside a document. */
export const GET = defineRoute({
  params: documentIdParamSchema,
  query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }),
  handler: async ({ userId, params, query }) => {
    // Load the document first: it proves ownership, so the audit query below
    // cannot be used to probe for entries belonging to someone else.
    await loadOwnedDocument(userId, params.id);

    const entries = await AuditLog.find({
      userId: new Types.ObjectId(userId),
      entityId: new Types.ObjectId(params.id),
    })
      .sort({ at: -1 })
      .limit(query.limit)
      .lean();

    return {
      entries: entries.map((entry) => ({
        id: String(entry._id),
        action: entry.action,
        changes: entry.changes ?? null,
        metadata: entry.metadata ?? null,
        at: entry.at.toISOString(),
      })),
    };
  },
});
