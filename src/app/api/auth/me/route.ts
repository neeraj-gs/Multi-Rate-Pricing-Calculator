import { defineRoute } from '@/lib/api/route';
import { ApiError } from '@/lib/api/errors';
import { User } from '@/lib/db';
import { updatePreferencesSchema } from '@/lib/validation/auth';

export const runtime = 'nodejs';

export const GET = defineRoute({
  handler: async ({ userId }) => {
    const user = await User.findById(userId).lean();
    if (!user) throw ApiError.unauthenticated('Your session is no longer valid.');

    return {
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        company: user.company ?? '',
        preferences: user.preferences,
        createdAt: (user as { createdAt?: Date }).createdAt?.toISOString() ?? null,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      },
    };
  },
});

export const PATCH = defineRoute({
  body: updatePreferencesSchema,
  handler: async ({ userId, body }) => {
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.company !== undefined) update.company = body.company;
    if (body.currency !== undefined) update['preferences.currency'] = body.currency;
    if (body.defaultTaxPercent !== undefined) {
      // Stored scaled by 100, like every other percentage in the system.
      update['preferences.defaultTaxPercent'] = Math.round(body.defaultTaxPercent * 100);
    }
    if (body.documentPrefix !== undefined) {
      update['preferences.documentPrefix'] = body.documentPrefix.toUpperCase();
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: update },
      { new: true, runValidators: true },
    ).lean();

    if (!user) throw ApiError.unauthenticated('Your session is no longer valid.');

    return {
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        company: user.company ?? '',
        preferences: user.preferences,
      },
    };
  },
});
