import { Types, type PipelineStage } from 'mongoose';

import { DocumentModel } from '@/lib/db';
import { formatMinor } from '@/lib/pricing';
import { toCalendarDate } from '@/lib/validation/common';
import type { ReportRangeQuery } from '@/lib/validation/documents';

/**
 * Summary reporting.
 *
 * ## Aggregated in the database, not in Node
 *
 * The naive version loads every document in the range and adds it up in
 * JavaScript. That is fine for a demo and untenable for a real account: it
 * moves megabytes over the wire to produce four numbers, and its cost grows
 * with the data rather than with the answer. These pipelines run against the
 * `{ userId, issueDate }` index and return a handful of rows.
 *
 * ## Why totals are grouped by currency
 *
 * Adding AED to USD produces a number that means nothing. The brief asks for
 * "sum of grand totals", and the only correct reading of that across a
 * multi-currency book is one sum *per currency*. The document count is the one
 * figure that is currency-independent, so it is also reported on its own.
 *
 * ## Why the figures always tie out
 *
 * The pipeline sums the same stored `totals.*Minor` integers that the document
 * detail view displays. There is no separate report-time calculation that could
 * disagree with the documents it summarises — the report is a `$group`, not a
 * recalculation.
 */

export interface CurrencyTotals {
  currency: string;
  documentCount: number;
  subtotal: string;
  totalDiscount: string;
  totalTax: string;
  grandTotal: string;
  amounts: {
    subtotalMinor: number;
    totalDiscountMinor: number;
    totalTaxMinor: number;
    grandTotalMinor: number;
  };
  averageDocumentValue: string;

  /**
   * Ratios, for reading rather than for accounting.
   *
   * These are the two questions a finance lead actually asks of a quote book:
   * how much am I giving away, and what is tax actually costing on what is left.
   * They are percentages of already-exact integers, so a float is honest here —
   * and they are never added to or stored, only displayed.
   */
  discountRatePercent: string;
  effectiveTaxRatePercent: string;
}

export interface StatusSplit {
  currency: string;
  status: 'draft' | 'finalized';
  documentCount: number;
  grandTotal: string;
  grandTotalMinor: number;
}

export interface SummaryReport {
  range: { from: string; to: string; status: string; groupBy: string };
  documentCount: number;
  draftCount: number;
  finalizedCount: number;
  lineItemCount: number;
  byCurrency: CurrencyTotals[];
  /** The currency with the most documents in range — what the UI leads with. */
  primaryCurrency: string | null;

  /** Value committed versus still in progress, which counts alone cannot show. */
  byStatus: StatusSplit[];

  /**
   * The same aggregate over the immediately preceding window of equal length.
   *
   * A total without a comparison is a number; with one it is a direction. The
   * window is derived from the requested range rather than a fixed month, so
   * "last 90 days" compares against the 90 before it.
   */
  comparison: {
    from: string;
    to: string;
    documentCount: number;
    byCurrency: Array<{ currency: string; grandTotalMinor: number }>;
  } | null;
  /**
   * Every period the range spans, in order — including the ones with nothing in
   * them.
   *
   * `timeseries` only contains periods that have documents, because that is what
   * a `$group` returns. Plotting those rows directly draws a time axis that
   * skips its empty months: a book with nothing issued in January renders
   * "Dec 2025, Feb 2026" side by side, which reads as *no gap* rather than as a
   * quiet month, and silently compresses the shape of the trend. Charts join
   * onto this axis so a period with no documents is drawn as zero.
   */
  periods: Array<{ period: string; label: string }>;

  timeseries: Array<{
    period: string;
    label: string;
    currency: string;
    documentCount: number;
    grandTotal: string;
    totalTax: string;
    totalDiscount: string;
    grandTotalMinor: number;
  }>;
  topCustomers: Array<{
    name: string;
    currency: string;
    documentCount: number;
    grandTotal: string;
    grandTotalMinor: number;
  }>;
}

function buildMatch(userId: string, query: ReportRangeQuery): Record<string, unknown> {
  const match: Record<string, unknown> = {
    userId: new Types.ObjectId(userId),
    // Inclusive on both ends — see the note in `queries.ts`.
    issueDate: { $gte: query.from, $lte: query.to },
  };
  if (query.status !== 'all') match.status = query.status;
  if (query.currency) match.currency = query.currency;
  return match;
}

const PERIOD_FORMAT: Record<ReportRangeQuery['groupBy'], string> = {
  day: '%Y-%m-%d',
  week: '%G-W%V', // ISO week-numbering year and week
  month: '%Y-%m',
};

export async function buildSummaryReport(
  userId: string,
  query: ReportRangeQuery,
): Promise<SummaryReport> {
  const match = buildMatch(userId, query);

  const totalsPipeline: PipelineStage[] = [
    { $match: match },
    {
      $group: {
        _id: '$currency',
        documentCount: { $sum: 1 },
        draftCount: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
        finalizedCount: { $sum: { $cond: [{ $eq: ['$status', 'finalized'] }, 1, 0] } },
        lineItemCount: { $sum: { $size: '$lines' } },
        subtotalMinor: { $sum: '$totals.subtotalMinor' },
        totalDiscountMinor: { $sum: '$totals.totalDiscountMinor' },
        totalTaxMinor: { $sum: '$totals.totalTaxMinor' },
        grandTotalMinor: { $sum: '$totals.grandTotalMinor' },
      },
    },
    { $sort: { documentCount: -1, _id: 1 } },
  ];

  const timeseriesPipeline: PipelineStage[] = [
    { $match: match },
    {
      $group: {
        _id: {
          // Formatted in UTC, matching how issue dates are stored, so a period
          // boundary means the same thing to every viewer.
          period: {
            $dateToString: {
              format: PERIOD_FORMAT[query.groupBy],
              date: '$issueDate',
              timezone: 'UTC',
            },
          },
          currency: '$currency',
        },
        documentCount: { $sum: 1 },
        grandTotalMinor: { $sum: '$totals.grandTotalMinor' },
        totalTaxMinor: { $sum: '$totals.totalTaxMinor' },
        totalDiscountMinor: { $sum: '$totals.totalDiscountMinor' },
      },
    },
    { $sort: { '_id.period': 1, '_id.currency': 1 } },
    { $limit: 400 },
  ];

  const topCustomersPipeline: PipelineStage[] = [
    { $match: match },
    {
      $group: {
        _id: { name: '$customer.name', currency: '$currency' },
        documentCount: { $sum: 1 },
        grandTotalMinor: { $sum: '$totals.grandTotalMinor' },
      },
    },
    { $sort: { grandTotalMinor: -1 } },
    { $limit: 8 },
  ];

  const statusPipeline: PipelineStage[] = [
    { $match: match },
    {
      $group: {
        _id: { currency: '$currency', status: '$status' },
        documentCount: { $sum: 1 },
        grandTotalMinor: { $sum: '$totals.grandTotalMinor' },
      },
    },
    { $sort: { '_id.currency': 1, '_id.status': 1 } },
  ];

  /*
   * The preceding window of equal length, so a total reads as a direction
   * rather than as a bare number. Both bounds inclusive, like the range itself,
   * which is why the length is (to − from) + 1 day.
   */
  const dayMs = 24 * 60 * 60 * 1000;
  const spanMs = query.to.getTime() - query.from.getTime() + dayMs;
  const previousTo = new Date(query.from.getTime() - dayMs);
  const previousFrom = new Date(query.from.getTime() - spanMs);

  const comparisonPipeline: PipelineStage[] = [
    {
      $match: {
        ...match,
        issueDate: { $gte: previousFrom, $lte: previousTo },
      },
    },
    {
      $group: {
        _id: '$currency',
        documentCount: { $sum: 1 },
        grandTotalMinor: { $sum: '$totals.grandTotalMinor' },
      },
    },
  ];

  const [totalsRows, timeseriesRows, customerRows, statusRows, comparisonRows] =
    await Promise.all([
      DocumentModel.aggregate(totalsPipeline),
      DocumentModel.aggregate(timeseriesPipeline),
      DocumentModel.aggregate(topCustomersPipeline),
      DocumentModel.aggregate(statusPipeline),
      DocumentModel.aggregate(comparisonPipeline),
    ]);

  const byCurrency: CurrencyTotals[] = totalsRows.map((row) => {
    const currency = row._id as string;
    const count = row.documentCount as number;
    return {
      currency,
      documentCount: count,
      subtotal: formatMinor(row.subtotalMinor, currency),
      totalDiscount: formatMinor(row.totalDiscountMinor, currency),
      totalTax: formatMinor(row.totalTaxMinor, currency),
      grandTotal: formatMinor(row.grandTotalMinor, currency),
      amounts: {
        subtotalMinor: row.subtotalMinor as number,
        totalDiscountMinor: row.totalDiscountMinor as number,
        totalTaxMinor: row.totalTaxMinor as number,
        grandTotalMinor: row.grandTotalMinor as number,
      },
      averageDocumentValue: formatMinor(
        count === 0 ? 0 : Math.round((row.grandTotalMinor as number) / count),
        currency,
      ),
      discountRatePercent: ratio(
        row.totalDiscountMinor as number,
        row.subtotalMinor as number,
      ),
      effectiveTaxRatePercent: ratio(
        row.totalTaxMinor as number,
        (row.subtotalMinor as number) - (row.totalDiscountMinor as number),
      ),
    };
  });

  return {
    range: {
      from: toCalendarDate(query.from) ?? '',
      to: toCalendarDate(query.to) ?? '',
      status: query.status,
      groupBy: query.groupBy,
    },
    documentCount: totalsRows.reduce((sum, row) => sum + (row.documentCount as number), 0),
    draftCount: totalsRows.reduce((sum, row) => sum + (row.draftCount as number), 0),
    finalizedCount: totalsRows.reduce(
      (sum, row) => sum + (row.finalizedCount as number),
      0,
    ),
    lineItemCount: totalsRows.reduce((sum, row) => sum + (row.lineItemCount as number), 0),
    byCurrency,
    primaryCurrency: byCurrency[0]?.currency ?? null,

    byStatus: statusRows.map((row) => ({
      currency: row._id.currency as string,
      status: row._id.status as 'draft' | 'finalized',
      documentCount: row.documentCount as number,
      grandTotal: formatMinor(row.grandTotalMinor, row._id.currency as string),
      grandTotalMinor: row.grandTotalMinor as number,
    })),

    comparison: {
      from: toCalendarDate(previousFrom) ?? '',
      to: toCalendarDate(previousTo) ?? '',
      documentCount: comparisonRows.reduce(
        (sum, row) => sum + (row.documentCount as number),
        0,
      ),
      byCurrency: comparisonRows.map((row) => ({
        currency: row._id as string,
        grandTotalMinor: row.grandTotalMinor as number,
      })),
    },
    periods: periodAxis(query.from, query.to, query.groupBy),
    timeseries: timeseriesRows.map((row) => {
      const currency = row._id.currency as string;
      const period = row._id.period as string;
      return {
        period,
        label: formatPeriodLabel(period, query.groupBy),
        currency,
        documentCount: row.documentCount as number,
        grandTotal: formatMinor(row.grandTotalMinor, currency),
        totalTax: formatMinor(row.totalTaxMinor, currency),
        totalDiscount: formatMinor(row.totalDiscountMinor, currency),
        grandTotalMinor: row.grandTotalMinor as number,
      };
    }),
    topCustomers: customerRows.map((row) => {
      const currency = row._id.currency as string;
      return {
        name: row._id.name as string,
        currency,
        documentCount: row.documentCount as number,
        grandTotal: formatMinor(row.grandTotalMinor, currency),
        grandTotalMinor: row.grandTotalMinor as number,
      };
    }),
  };
}

/**
 * A percentage of two integer minor-unit sums, to one decimal place.
 *
 * Division is the one place a ratio has to leave integer arithmetic, and that
 * is fine precisely because the result is never money: it is displayed, never
 * summed, and never stored.
 */
function ratio(part: number, whole: number): string {
  if (whole <= 0) return '0.0';
  return ((part / whole) * 100).toFixed(1);
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * The complete, ordered list of periods a range covers.
 *
 * Keys are generated to match `PERIOD_FORMAT` exactly — the same strings
 * `$dateToString` produces — so the join in the UI is a plain lookup rather than
 * a re-parse. Everything is computed in UTC, for the reason given at the
 * pipeline: a period boundary has to mean the same thing to every viewer.
 *
 * Capped at the same 400 rows the timeseries pipeline is capped at. Beyond that
 * the axis is denser than the pixels available anyway, and returning the empty
 * array lets the caller fall back to plotting the rows it has.
 */
const MAX_PERIODS = 400;

function periodAxis(
  from: Date,
  to: Date,
  groupBy: ReportRangeQuery['groupBy'],
): Array<{ period: string; label: string }> {
  const periods: string[] = [];
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));

  while (cursor <= end && periods.length <= MAX_PERIODS) {
    if (groupBy === 'month') {
      periods.push(
        `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
      );
      cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
    } else if (groupBy === 'week') {
      periods.push(isoWeekKey(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    } else {
      periods.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  if (periods.length > MAX_PERIODS) return [];
  return periods.map((period) => ({ period, label: formatPeriodLabel(period, groupBy) }));
}

/**
 * ISO-8601 week key, `%G-W%V` — week-numbering year and week number.
 *
 * The week-numbering year is not always the calendar year: 1 Jan 2027 falls in
 * week 53 of 2026. Stepping to the nearest Thursday first is the standard way to
 * resolve both at once, because a week's Thursday is always in its own
 * week-numbering year.
 */
function isoWeekKey(date: Date): string {
  const thursday = new Date(date.getTime());
  // Sunday is 0; treat it as day 7 so the week runs Monday–Sunday.
  const isoDay = thursday.getUTCDay() === 0 ? 7 : thursday.getUTCDay();
  thursday.setUTCDate(thursday.getUTCDate() + 4 - isoDay);

  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function formatPeriodLabel(period: string, groupBy: string): string {
  if (groupBy === 'month') {
    const [year, month] = period.split('-');
    return `${MONTH_NAMES[Number(month) - 1] ?? month} ${year}`;
  }
  if (groupBy === 'week') return period.replace('-W', ' wk ');
  const [year, month, day] = period.split('-');
  return `${day} ${MONTH_NAMES[Number(month) - 1] ?? month} ${year}`;
}

/**
 * Row-level export of the documents behind a report.
 *
 * A summary that cannot be drilled into is a number you have to trust. This is
 * how a finance team checks the report against their own spreadsheet — which
 * is exactly what they will do the first time the figure surprises them.
 */
export async function buildReportCsv(
  userId: string,
  query: ReportRangeQuery,
): Promise<string> {
  const rows = await DocumentModel.find(buildMatch(userId, query))
    .select('number title customer.name issueDate status currency totals lines')
    .sort({ issueDate: 1, _id: 1 })
    .limit(10_000)
    .lean();

  const header = [
    'Number', 'Title', 'Customer', 'Issue date', 'Status', 'Currency',
    'Line items', 'Subtotal', 'Total discount', 'Total tax', 'Grand total',
  ];

  const lines = rows.map((row) => {
    const currency = row.currency;
    return [
      row.number,
      row.title,
      row.customer?.name ?? '',
      toCalendarDate(row.issueDate) ?? '',
      row.status,
      currency,
      String(row.lines?.length ?? 0),
      formatMinor(row.totals.subtotalMinor, currency),
      formatMinor(row.totals.totalDiscountMinor, currency),
      formatMinor(row.totals.totalTaxMinor, currency),
      formatMinor(row.totals.grandTotalMinor, currency),
    ].map(escapeCsvCell).join(',');
  });

  return [header.join(','), ...lines].join('\r\n');
}

/**
 * Escapes a CSV cell, including the leading-character guard.
 *
 * A cell beginning `=`, `+`, `-` or `@` is executed as a formula when the file
 * is opened in Excel, which turns a customer name into a code-execution vector
 * on the finance team's laptop. Prefixing a single quote neutralises it while
 * still displaying the original text.
 */
function escapeCsvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}
