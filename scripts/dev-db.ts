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
 */

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

const PORT = 27018;
const DB_PATH = resolve(process.cwd(), '.mongo-data');

async function main() {
  mkdirSync(DB_PATH, { recursive: true });

  const server = await MongoMemoryServer.create({
    instance: {
      port: PORT,
      dbName: 'ledgerline',
      dbPath: DB_PATH,
      // Without this the data directory is wiped on shutdown, which would make
      // it a scratch database rather than a local one.
      storageEngine: 'wiredTiger',
    },
    binary: { version: '7.0.14' },
  });

  const uri = `mongodb://127.0.0.1:${PORT}/ledgerline`;

  console.log('');
  console.log('  MongoDB is running locally.');
  console.log('');
  console.log(`  MONGODB_URI=${uri}`);
  console.log(`  data        ${DB_PATH}`);
  console.log('');
  console.log('  Put that line in .env.local, then run `npm run dev`.');
  console.log('  Press Ctrl+C to stop.');
  console.log('');

  const shutdown = async () => {
    console.log('\n  Stopping MongoDB…');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Could not start the local database:', error);
  process.exit(1);
});
