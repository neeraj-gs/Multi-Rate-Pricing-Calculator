import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

/**
 * A real MongoDB, in memory.
 *
 * These tests exercise unique indexes, atomic `$inc` counters and aggregation
 * pipelines. A mocked driver would assert that the code calls the functions the
 * test author expected, which is a different — and much weaker — claim than
 * "the constraint actually holds".
 */

let server: MongoMemoryServer | null = null;

export async function startTestDatabase(): Promise<void> {
  server = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
  process.env.MONGODB_URI = server.getUri('tessera-test');
  process.env.AUTH_SECRET =
    process.env.AUTH_SECRET ?? 'test-secret-value-at-least-32-characters-long';

  await mongoose.connect(process.env.MONGODB_URI);
  // Indexes are what several of these tests are actually asserting on, so they
  // must exist before the first insert.
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.createIndexes()),
  );
}

export async function stopTestDatabase(): Promise<void> {
  await mongoose.disconnect();
  await server?.stop();
  server = null;
}

/** Empties every collection between tests, keeping indexes intact. */
export async function clearDatabase(): Promise<void> {
  const collections = mongoose.connection.collections;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({})),
  );
}
