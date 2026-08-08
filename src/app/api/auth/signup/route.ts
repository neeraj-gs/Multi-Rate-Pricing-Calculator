import { defineRoute } from '@/lib/api/route';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { recordAudit } from '@/lib/api/audit';
import { ApiError } from '@/lib/api/errors';
import { User } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSessionToken, setSessionCookie } from '@/lib/auth/session';
import { signupSchema } from '@/lib/validation/auth';

export const runtime = 'nodejs';

export const POST = defineRoute({
  auth: false,
  body: signupSchema,
  rateLimit: RATE_LIMITS.auth,
  successStatus: 201,
  handler: async ({ body, ctx }) => {
    const passwordHash = await hashPassword(body.password);

    let created;
    try {
      // No "does this email exist" check first. Between the check and the
      // insert another request can create the same account, so the unique index
      // is the only authority that cannot race. The duplicate-key error is the
      // expected path, handled in `toApiError`.
      created = await User.create({
        email: body.email,
        name: body.name,
        company: body.company,
        passwordHash,
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: number }).code === 11000
      ) {
        throw new ApiError(
          409,
          'EMAIL_TAKEN',
          'An account with that email already exists. Try signing in instead.',
          [{ path: 'email', message: 'This email is already registered.' }],
        );
      }
      throw error;
    }

    const token = await createSessionToken({
      sub: String(created._id),
      email: created.email,
      name: created.name,
      tokenVersion: created.tokenVersion ?? 0,
    });
    await setSessionCookie(token);

    await recordAudit({
      userId: String(created._id),
      action: 'user.signup',
      entityType: 'user',
      entityId: String(created._id),
      entityLabel: created.email,
      context: ctx,
    });

    return {
      user: {
        id: String(created._id),
        email: created.email,
        name: created.name,
        company: created.company ?? '',
        preferences: created.preferences,
      },
    };
  },
});
