import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth/session';
import { connectToDatabase, User } from '@/lib/db';
import { AppShell } from '@/components/app/AppShell';

/**
 * The authenticated area.
 *
 * The session is read here, on the server, and the user is passed down — so no
 * page has to fetch its own identity and no screen flashes an empty state while
 * that request is in flight. Middleware already redirects unauthenticated
 * navigation; this second check is what makes that middleware an optimisation
 * rather than the only thing standing between a visitor and the app.
 *
 * ## Why the account is confirmed to still exist
 *
 * A session token is signed and stateless, so it stays valid until it expires
 * even if the account behind it is gone. Without this check the app looks the
 * user up, finds nothing, and renders a perfectly convincing *empty account* —
 * which is what reseeding the database used to produce, and is indistinguishable
 * from data loss. Ending the session says what actually happened.
 *
 * One indexed lookup by `_id` per navigation, and only in the app shell.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  await connectToDatabase();
  const user = await User.findById(session.sub).select('_id name email').lean();

  // Handed to a route handler, because a server component may not modify
  // cookies — and redirecting straight to /login would loop, since the cookie
  // is still validly signed and middleware would bounce it back here.
  if (!user) redirect('/api/auth/session-ended');

  return (
    <AppShell user={{ name: user.name, email: user.email }}>{children}</AppShell>
  );
}
