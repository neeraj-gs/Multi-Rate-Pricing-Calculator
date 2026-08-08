import { NextResponse } from 'next/server';
import { connectToDatabase, mongoose } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Liveness and readiness in one endpoint.
 *
 * It actually pings the database rather than just returning `{ ok: true }`.
 * A health check that only proves the process is running will happily report
 * green while every request fails on a dropped connection — which is precisely
 * when you need it to tell you something.
 */
export async function GET() {
  const startedAt = Date.now();

  try {
    await connectToDatabase();
    await mongoose.connection.db?.admin().ping();

    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      latencyMs: Date.now() - startedAt,
      version: process.env.npm_package_version ?? '1.0.0',
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'degraded',
        database: 'unreachable',
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : 'Unknown error',
        at: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
