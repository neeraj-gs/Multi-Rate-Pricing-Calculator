import { defineRoute } from '@/lib/api/route';
import { recordAudit } from '@/lib/api/audit';
import { clearSessionCookie } from '@/lib/auth/session';

export const runtime = 'nodejs';

export const POST = defineRoute({
  auth: false,
  handler: async ({ session, ctx }) => {
    // Signing out an already-signed-out browser is not an error; it is exactly
    // what a user clicking "sign out" on a stale tab expects to happen.
    if (session) {
      await recordAudit({
        userId: session.sub,
        action: 'user.logout',
        entityType: 'user',
        entityId: session.sub,
        entityLabel: session.email,
        context: ctx,
      });
    }

    await clearSessionCookie();
    return { signedOut: true };
  },
});
