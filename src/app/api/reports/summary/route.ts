import { defineRoute } from '@/lib/api/route';
import { buildSummaryReport } from '@/lib/reports/summary';
import { reportRangeSchema } from '@/lib/validation/documents';

export const runtime = 'nodejs';

/**
 * Summary over an issue-date range.
 *
 * Returns document count and per-currency sums of grand total, tax and
 * discount, plus a timeseries and the top customers behind those numbers.
 * Both range bounds are inclusive.
 */
export const GET = defineRoute({
  query: reportRangeSchema,
  handler: async ({ userId, query }) => buildSummaryReport(userId, query),
});
