/**
 * MongoDB connection, shaped for a serverless runtime.
 *
 * Every Vercel function invocation may run in a fresh module scope but often
 * reuses a warm container. Opening a new connection per request would exhaust
 * the Atlas connection limit within minutes of real traffic, so the connection
 * promise is cached on `globalThis` — the one place that survives module
 * re-evaluation during dev hot-reload and function reuse alike.
 *
 * The cache stores the *promise*, not the resolved connection: concurrent
 * invocations that arrive during a cold start then share one handshake instead
 * of racing to open several.
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

interface MongooseCache {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __ledgerlineMongoose: MongooseCache | undefined;
}

const cache: MongooseCache = globalThis.__ledgerlineMongoose ?? {
  connection: null,
  promise: null,
};
globalThis.__ledgerlineMongoose = cache;

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cache.connection) return cache.connection;

  if (!cache.promise) {
    if (!MONGODB_URI) {
      throw new Error(
        'MONGODB_URI is not set. Copy .env.example to .env.local and provide a MongoDB connection string.',
      );
    }

    mongoose.set('strictQuery', true);
    // Surfaces schema/path typos as errors instead of silently dropping fields.
    mongoose.set('strict', 'throw');

    cache.promise = mongoose
      .connect(MONGODB_URI, {
        // A small pool is correct for serverless: many short-lived containers,
        // each needing only a couple of sockets.
        maxPoolSize: 10,
        minPoolSize: 0,
        serverSelectionTimeoutMS: 10_000,
        socketTimeoutMS: 45_000,
        // Writes are acknowledged by a majority before we report success, so a
        // finalized document cannot be lost to a primary failover.
        writeConcern: { w: 'majority' },
        retryWrites: true,
        autoIndex: process.env.NODE_ENV !== 'production',
      })
      .then((connected) => {
        cache.connection = connected;
        return connected;
      })
      .catch((error) => {
        // Clear the cached promise so the next request retries rather than
        // replaying a permanently rejected promise forever.
        cache.promise = null;
        throw error;
      });
  }

  return cache.promise;
}

export async function disconnectFromDatabase(): Promise<void> {
  if (cache.connection) {
    await cache.connection.disconnect();
  }
  cache.connection = null;
  cache.promise = null;
}

export { mongoose };
