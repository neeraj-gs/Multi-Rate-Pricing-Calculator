import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

/**
 * An account.
 *
 * `passwordHash` carries `select: false`, so it is omitted from every query
 * unless explicitly requested. A hash that is never loaded cannot be leaked by
 * an over-eager `res.json(user)` — the cheapest possible guard against the most
 * common way credentials escape.
 */
const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      // Stored lowercase and trimmed so the unique index is the sole authority
      // on "is this address taken", with no case-variant duplicates.
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true, select: false },

    company: { type: String, trim: true, maxlength: 160, default: '' },

    preferences: {
      currency: { type: String, default: 'AED', uppercase: true, maxlength: 3 },
      defaultTaxPercent: { type: Number, default: 500, min: 0 }, // scaled: 5%
      documentPrefix: { type: String, default: 'QT', trim: true, maxlength: 8 },
    },

    /**
     * Bumped on password change. Tokens carry the value they were minted with,
     * so raising it invalidates every existing session at once — session
     * revocation without a session table.
     */
    tokenVersion: { type: Number, default: 0 },

    lastLoginAt: { type: Date },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

userSchema.index({ email: 1 }, { unique: true });

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: string };

export const User: Model<UserDocument> =
  (models.User as Model<UserDocument>) ?? model<UserDocument>('User', userSchema);
