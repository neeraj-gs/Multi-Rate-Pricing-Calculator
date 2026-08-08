import { AuditLog, type AuditAction } from '@/lib/db';
import type { RequestContext } from './context';

/**
 * Writes an audit entry.
 *
 * Deliberately never throws. A failed audit write must not roll back the user's
 * actual work — losing a customer's edit because the log was briefly unwritable
 * is a worse outcome than a gap in the log. The failure is reported to the
 * server logs, where an alert would pick it up.
 *
 * (In a system with a compliance mandate the tradeoff inverts: the write
 * becomes part of the same transaction as the change, and a failure blocks it.
 * That is a deliberate decision to revisit, not an oversight — see the README.)
 */
export async function recordAudit(input: {
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
  metadata?: Record<string, unknown> | null;
  context?: RequestContext;
}): Promise<void> {
  try {
    await AuditLog.create({
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      entityLabel: input.entityLabel ?? '',
      changes: input.changes ?? null,
      metadata: input.metadata ?? null,
      ip: input.context?.ip ?? '',
      userAgent: input.context?.userAgent ?? '',
      requestId: input.context?.requestId ?? '',
      at: new Date(),
    });
  } catch (error) {
    console.error('[audit] failed to record entry', {
      action: input.action,
      entityId: input.entityId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Field-level diff between two snapshots, for the audit trail.
 *
 * Only changed keys are kept; unchanged fields would bury the signal. Values
 * are compared by JSON shape so nested objects (customer, totals) work without
 * a bespoke comparator.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const key of Object.keys(after)) {
    const from = before[key];
    const to = after[key];
    if (JSON.stringify(from ?? null) !== JSON.stringify(to ?? null)) {
      changes[key] = { from: from ?? null, to: to ?? null };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}
