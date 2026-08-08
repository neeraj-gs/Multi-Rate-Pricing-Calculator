import { Types } from 'mongoose';
import { z } from 'zod';

import { defineRoute } from '@/lib/api/route';
import { AuditLog, AUDIT_ACTIONS } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * The account-wide audit trail.
 *
 * Read-only by construction: there is no write endpoint over this collection
 * anywhere in the API, and entries are only ever created as a side effect of
 * the action they describe.
 */
export const GET = defineRoute({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(200).default(100),
    action: z.enum(AUDIT_ACTIONS).optional(),
  }),
  handler: async ({ userId, query }) => {
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (query.action) filter.action = query.action;

    const entries = await AuditLog.find(filter)
      .sort({ at: -1 })
      .limit(query.limit)
      .lean();

    return {
      entries: entries.map((entry) => ({
        id: String(entry._id),
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ? String(entry.entityId) : null,
        entityLabel: entry.entityLabel ?? '',
        changes: entry.changes ?? null,
        metadata: entry.metadata ?? null,
        ip: entry.ip ?? '',
        at: entry.at.toISOString(),
      })),
    };
  },
});
