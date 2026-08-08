import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

/**
 * Replay protection for unsafe requests.
 *
 * A client that retries a `POST /documents` after a timeout must not end up
 * with two documents. Callers send an `Idempotency-Key` header; the first
 * request to claim a key stores its response, and any later request presenting
 * the same key gets that stored response back instead of executing again.
 *
 * The unique index on `(userId, key)` is the lock itself — the claim is a
 * single atomic insert, so two concurrent retries cannot both win. `fingerprint`
 * guards the other failure mode: reusing one key for a *different* body is a
 * client bug, and returning the unrelated cached response would be worse than
 * an error.
 *
 * Records self-destruct after 24 hours via a TTL index, so the collection stays
 * small without a cleanup job.
 */
const idempotencyKeySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, required: true, maxlength: 200 },
    endpoint: { type: String, required: true },
    /** SHA-256 of method + path + body. */
    fingerprint: { type: String, required: true },

    status: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress' },
    responseStatus: { type: Number, default: null },
    responseBody: { type: Schema.Types.Mixed, default: null },

    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

idempotencyKeySchema.index({ userId: 1, key: 1 }, { unique: true });
idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export type IdempotencyKeyRecord = InferSchemaType<typeof idempotencyKeySchema>;

export const IdempotencyKey: Model<IdempotencyKeyRecord> =
  (models.IdempotencyKey as Model<IdempotencyKeyRecord>) ??
  model<IdempotencyKeyRecord>('IdempotencyKey', idempotencyKeySchema);
