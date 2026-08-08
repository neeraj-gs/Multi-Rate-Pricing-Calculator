import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

/**
 * A public, read-only link to a single document — the thing you actually send
 * a customer.
 *
 * Only a SHA-256 hash of the token is stored. The raw token is shown to the
 * owner exactly once, at creation. If the database is ever exposed, the hashes
 * in it cannot be turned back into working links — the same reasoning that
 * applies to passwords applies to bearer tokens in a URL.
 *
 * Links expire, and can be revoked before they do.
 */
const shareLinkSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },

    tokenHash: { type: String, required: true },

    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    viewCount: { type: Number, default: 0 },
    lastViewedAt: { type: Date, default: null },

    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

shareLinkSchema.index({ tokenHash: 1 }, { unique: true });
shareLinkSchema.index({ userId: 1, documentId: 1, createdAt: -1 });
/** Expired links are swept automatically rather than lingering as dead rows. */
shareLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ShareLinkRecord = InferSchemaType<typeof shareLinkSchema>;

export const ShareLink: Model<ShareLinkRecord> =
  (models.ShareLink as Model<ShareLinkRecord>) ??
  model<ShareLinkRecord>('ShareLink', shareLinkSchema);
