import { NextResponse } from 'next/server';

import { defineRoute } from '@/lib/api/route';
import { buildReportCsv } from '@/lib/reports/summary';
import { reportRangeSchema } from '@/lib/validation/documents';

export const runtime = 'nodejs';

/** Row-level CSV of every document behind a summary, for reconciliation. */
export const GET = defineRoute({
  query: reportRangeSchema,
  handler: async ({ userId, query }) => {
    const csv = await buildReportCsv(userId, query);
    const from = query.from.toISOString().slice(0, 10);
    const to = query.to.toISOString().slice(0, 10);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ledgerline-${from}-to-${to}.csv"`,
        'Cache-Control': 'no-store',
      },
    }) as unknown as NextResponse;
  },
});
