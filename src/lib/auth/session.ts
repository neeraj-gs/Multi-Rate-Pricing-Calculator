import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';

/**
 * Sessions are stateless JWTs in an httpOnly cookie.
 *
 * ## Why a cookie and not `localStorage`
 *
 * A token in `localStorage` is readable by any script on the page, so a single
 * XSS hole hands an attacker a valid session. An `httpOnly` cookie is invisible
 * to JavaScript, so the same hole yields nothing directly stealable.
 *
 * ## Why that is safe against CSRF here
 *
 * `sameSite: 'lax'` means the browser will not attach this cookie to
 * cross-site `POST`/`PATCH`/`DELETE` requests, which is where the damage would
 * be. Combined with the fact that every mutating endpoint requires a JSON body
 * (and so triggers a CORS preflight from another origin), the classic
 * form-post CSRF is closed off.
 *
 * ## Revocation
 *
 * `jose` verification is the only check on the hot path — no database read per
 * request, which is what keeps an authenticated API call to one round trip.
 * The cost is that a stateless token cannot be individually revoked, so the
 * payload carries `tokenVersion`. Changing a password increments the stored
 * version and every outstanding token for that account stops verifying.
 */

export const SESSION_COOKIE = 'tsa_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const ISSUER = 'tessera';
const AUDIENCE = 'tessera-app';

export interface SessionPayload extends JWTPayload {
  sub: string;
  email: string;
  name: string;
  tokenVersion: number;
}

let cachedSecret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;

  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'AUTH_SECRET must be set to a random string of at least 32 characters. Generate one with: openssl rand -base64 32',
    );
  }
  cachedSecret = new TextEncoder().encode(secret);
  return cachedSecret;
}

export async function createSessionToken(
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

/** Verifies signature, expiry, issuer and audience. Returns null on any failure. */
export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'], // pinned, so `alg: none` is never accepted
    });
    if (typeof payload.sub !== 'string') return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

/** Reads and verifies the session from the incoming request's cookies. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', sessionCookieOptions(0));
}
