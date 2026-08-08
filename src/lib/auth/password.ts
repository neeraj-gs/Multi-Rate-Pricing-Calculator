import bcrypt from 'bcryptjs';

/**
 * Cost factor 12: roughly 250 ms per hash on current serverless hardware.
 * Slow enough that offline cracking of a leaked hash is expensive, fast enough
 * that a login does not feel broken. Raise it as hardware improves — bcrypt
 * embeds the cost in the hash, so existing hashes keep verifying.
 */
const COST_FACTOR = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST_FACTOR);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * A hash of a value nobody knows, verified against when an email does not
 * exist.
 *
 * Without this, "no such account" returns in ~1 ms while a real account takes
 * ~250 ms, and that gap is a free account-enumeration oracle. Burning the same
 * work on both paths closes it.
 */
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.7d1lC1qgo1qEEmA5FKb2mB.gDVxMJPO';

export async function burnPasswordTime(password: string): Promise<void> {
  await bcrypt.compare(password, DUMMY_HASH);
}
