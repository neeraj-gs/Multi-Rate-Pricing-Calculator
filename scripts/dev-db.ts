/**
 * A local MongoDB with nothing to install.
 *
 * `mongodb-memory-server` is already a dev dependency for the integration
 * tests, and it ships a real `mongod`. Pointing it at a persistent `dbPath`
 * turns it into an ordinary local database that survives restarts — so a
 * reviewer can clone the repo, run two commands and have a working app,
 * without a MongoDB install or an Atlas account.
 *
 *   npm run db:local     # leave running in one terminal
 *   npm run dev          # in another
 *
 * Anyone who already has MongoDB or an Atlas cluster can ignore this entirely
 * and set MONGODB_URI themselves.
 *
 * ## The two failure modes this handles
 *
 * `mongod` takes an exclusive lock on its data directory, and both ways that
 * lock goes wrong produce the same unreadable `DBPathInUse` stack trace:
 *
 *   1. **It is already running** — a second terminal, or a previous run still
 *      alive. Nothing is broken; the right answer is to say so and exit
 *      successfully, so this composes in a script.
 *   2. **A stale lock** — the last run was killed hard (closed terminal, lost
 *      power) and never cleaned up its `mongod.lock`. Nothing holds the port,
 *      so the lock is a lie and can be removed.
 *
 * Telling them apart is a port probe, and getting it wrong in either direction
 * is what turns a five-second fix into a confusing error.
 */

import { createConnection } from 'node:net';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

const PORT = 27018;
const DB_NAME = 'tessera';
const DB_PATH = resolve(process.cwd(), '.mongo-data');
const LOCK_FILE = resolve(DB_PATH, 'mongod.lock');
const URI = `mongodb://127.0.0.1:${PORT}/${DB_NAME}`;

/** Resolves true if something is accepting connections on the port. */
function isPortLive(port: number, timeoutMs = 700): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (live: boolean) => {
      socket.destroy();
      resolvePromise(live);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function banner(lines: string[]): void {
  console.log(`\n${lines.map((line) => `  ${line}`).join('\n')}\n`);
}

async function main() {
  mkdirSync(DB_PATH, { recursive: true });

  if (await isPortLive(PORT)) {
    banner([
      'MongoDB is already running on this port — nothing to do.',
      '',
      `MONGODB_URI=${URI}`,
      '',
      'If you meant to restart it, stop the other terminal first.',
    ]);
    // Exit 0: "already running" is success from the caller's point of view.
    return;
  }

  // The port is free, so any lock file left behind is stale.
  if (existsSync(LOCK_FILE)) {
    try {
      rmSync(LOCK_FILE);
      console.log('  Cleared a stale lock from a previous run.');
    } catch {
      banner([
        'Could not remove a stale lock file.',
        '',
        `  ${LOCK_FILE}`,
        '',
        'Delete it by hand, or remove the whole .mongo-data directory to',
        'start from an empty database, then run this again.',
      ]);
      process.exitCode = 1;
      return;
    }
  }

  let server: MongoMemoryServer;
  try {
    server = await MongoMemoryServer.create({
      instance: {
        port: PORT,
        dbName: DB_NAME,
        dbPath: DB_PATH,
        // Without this the data directory is wiped on shutdown, which would
        // make it a scratch database rather than a local one.
        storageEngine: 'wiredTiger',
      },
      binary: { version: '7.0.14' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    banner([
      'Could not start the local database.',
      '',
      message.includes('DBPathInUse')
        ? 'Another mongod is using .mongo-data. Close the other terminal and retry.'
        : message.split('\n')[0],
      '',
      'Options:',
      '  · rm -rf .mongo-data   to start from an empty database',
      '  · set MONGODB_URI in .env.local to use your own MongoDB or Atlas',
    ]);
    process.exitCode = 1;
    return;
  }

  banner([
    'MongoDB is running locally.',
    '',
    `MONGODB_URI=${URI}`,
    `data        ${DB_PATH}`,
    '',
    'That line is already in .env.local by default.',
    'Next: `npm run seed` once, then `npm run dev` in another terminal.',
    'Press Ctrl+C to stop.',
  ]);

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log('\n  Stopping MongoDB…');
    // A clean stop releases the lock. Without this the next run would find a
    // stale one — which is exactly the case handled above.
    await server.stop().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  banner([
    'Could not start the local database.',
    '',
    error instanceof Error ? error.message.split('\n')[0] : String(error),
  ]);
  process.exit(1);
});
