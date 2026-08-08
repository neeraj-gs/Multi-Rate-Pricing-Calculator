import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';

export const runtime = 'nodejs';

/**
 * Ends a session whose account no longer exists, then sends the browser to
 * sign in with an explanation.
 *
 * This is a route handler rather than a few lines in the app layout because a
 * server component may not modify cookies — Next refuses the write outright.
 * And a bare `redirect('/login')` from the layout would loop: the cookie is
 * still validly signed, so middleware would treat the visitor as authenticated
 * and bounce them straight back to the dashboard.
 *
 * Clearing the cookie on the redirect response breaks that cycle in one hop.
 *
 * A GET that changes state is normally wrong; here the state being changed is
 * only "forget this browser's dead credential", which is safe to repeat and
 * needs to work as a plain navigation.
 */
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(
    new URL('/login?reason=account-unavailable', request.url),
  );
  response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
  return response;
}
