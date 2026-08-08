import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

/**
 * Append-only record of every state change.
 *
 * A system that computes money should be able to answer "who changed this, when,
 * and what did it look like before" without reaching for database backups. The
 * collection is write-once by convention — nothing in the codebase updates or
 * deletes an entry, and the API exposes read-only endpoints over it.
 *
 * Entries capture a *diff*, not a full copy: storing the whole document on every
 * keystroke-level save would dwarf the data it describes.
 */

export const AUDIT_ACTIONS = [
  'user.signup',
  'user.login',
  'user.login_failed',
  'user.logout',
  'document.create',
  'document.update',
  'document.delete',
  'document.finalize',
  'document.duplicate',
  'document.line.create',
  'document.line.update',
  'document.line.delete',
  'document.share',
  'document.edit_rejected',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

const auditLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },

    entityType: { type: String, required: true }, // 'document' | 'user'
    entityId: { type: Schema.Types.ObjectId, default: null },
    /** Human-readable label, kept so the log stays readable after a delete. */
    entityLabel: { type: String, default: '' },

    /** Field-level changes: `{ title: { from: 'A', to: 'B' } }`. */
    changes: { type: Schema.Types.Mixed, default: null },
    /** Extra context — rejection reason, totals at finalize time, and so on. */
    metadata: { type: Schema.Types.Mixed, default: null },

    ip: { type: String, default: '' },
    userAgent: { type: String, default: '', maxlength: 400 },
    requestId: { type: String, default: '' },

    at: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
);

/** The audit timeline: one user's history, newest first. */
auditLogSchema.index({ userId: 1, at: -1 });
/** The per-document activity feed shown in the editor sidebar. */
auditLogSchema.index({ userId: 1, entityId: 1, at: -1 });

export type AuditLogRecord = InferSchemaType<typeof auditLogSchema>;

export const AuditLog: Model<AuditLogRecord> =
  (models.AuditLog as Model<AuditLogRecord>) ??
  model<AuditLogRecord>('AuditLog', auditLogSchema);
