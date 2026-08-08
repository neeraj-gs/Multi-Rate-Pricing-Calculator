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

  const [totalsRows, timeseriesRows, customerRows] = await Promise.all([
    DocumentModel.aggregate(totalsPipeline),
    DocumentModel.aggregate(timeseriesPipeline),
    DocumentModel.aggregate(topCustomersPipeline),
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

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

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
