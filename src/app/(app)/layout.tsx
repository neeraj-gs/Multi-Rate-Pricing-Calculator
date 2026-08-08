import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth/session';
import { AppShell } from '@/components/app/AppShell';

/**
 * The authenticated area.
 *
 * The session is read here, on the server, and the user is passed down — so no
 * page has to fetch its own identity and no screen flashes an empty state while
 * that request is in flight. Middleware already redirects unauthenticated
 * navigation; this second check is what makes that middleware an optimisation
 * rather than the only thing standing between a visitor and the app.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <AppShell user={{ name: session.name, email: session.email }}>{children}</AppShell>
  );
}
