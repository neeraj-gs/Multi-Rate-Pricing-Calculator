import { defineRoute } from '@/lib/api/route';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { recordAudit } from '@/lib/api/audit';
import { ApiError } from '@/lib/api/errors';
import { User } from '@/lib/db';
import { burnPasswordTime, verifyPassword } from '@/lib/auth/password';
import { createSessionToken, setSessionCookie } from '@/lib/auth/session';
import { loginSchema } from '@/lib/validation/auth';

export const runtime = 'nodejs';

/** Lock an account for 15 minutes after this many consecutive failures. */
const MAX_FAILED_ATTEMPTS = 8;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export const POST = defineRoute({
  auth: false,
  body: loginSchema,
  rateLimit: RATE_LIMITS.auth,
  handler: async ({ body, ctx }) => {
    const user = await User.findOne({ email: body.email }).select('+passwordHash');

    if (!user) {
      // Spend the same time hashing as a real verification would, then return
      // the same message. Otherwise the response time and wording together
      // reveal which addresses have accounts.
      await burnPasswordTime(body.password);
      throw new ApiError(
        401,
        'INVALID_CREDENTIALS',
        'That email and password combination is not correct.',
      );
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new ApiError(
        423,
        'ACCOUNT_LOCKED',
        `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      );
    }

    const valid = await verifyPassword(body.password, user.passwordHash);

    if (!valid) {
      // The counter lives in MongoDB rather than in memory, so it survives
      // container churn — the in-process rate limiter cannot make that promise.
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            failedLoginAttempts: attempts,
            ...(attempts >= MAX_FAILED_ATTEMPTS
              ? { lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) }
              : {}),
          },
        },
      );

      await recordAudit({
        userId: String(user._id),
        action: 'user.login_failed',
        entityType: 'user',
        entityId: String(user._id),
        entityLabel: user.email,
        metadata: { attempts },
        context: ctx,
      });

      throw new ApiError(
        401,
        'INVALID_CREDENTIALS',
        'That email and password combination is not correct.',
      );
    }

    await User.updateOne(
      { _id: user._id },
      {
        $set: { failedLoginAttempts: 0, lastLoginAt: new Date() },
        $unset: { lockedUntil: '' },
      },
    );

    const token = await createSessionToken({
      sub: String(user._id),
      email: user.email,
      name: user.name,
      tokenVersion: user.tokenVersion ?? 0,
    });
    await setSessionCookie(token);

    await recordAudit({
      userId: String(user._id),
      action: 'user.login',
      entityType: 'user',
      entityId: String(user._id),
      entityLabel: user.email,
      context: ctx,
    });

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
