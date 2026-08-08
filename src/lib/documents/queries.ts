import { Types, type PipelineStage } from 'mongoose';

import { DocumentModel } from '@/lib/db';
import { formatMinor } from '@/lib/pricing';
import { toCalendarDate } from '@/lib/validation/common';
import type { ListDocumentsQuery } from '@/lib/validation/documents';

/**
 * The list view returns a **summary** of each document, not the whole thing.
 *
 * A page of 20 documents with their line items is easily 100× the payload of a
 * page of 20 rows, to render a table that shows none of it. The full record is
 * one request away when a document is actually opened.
 */
export interface DocumentSummary {
  id: string;
  number: string;
  title: string;
  customerName: string;
  issueDate: string | null;
  dueDate: string | null;
  status: 'draft' | 'finalized';
  currency: string;
  lineCount: number;
  subtotal: string;
  totalDiscount: string;
  totalTax: string;
  grandTotal: string;
  grandTotalMinor: number;
  finalizedAt: string | null;
  updatedAt: string | null;
}

export interface PaginatedDocuments {
  data: DocumentSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

const SORT_FIELDS: Record<ListDocumentsQuery['sort'], Record<string, 1 | -1>> = {
  issueDate: { issueDate: 1, _id: 1 },
  '-issueDate': { issueDate: -1, _id: -1 },
  updatedAt: { updatedAt: 1, _id: 1 },
  '-updatedAt': { updatedAt: -1, _id: -1 },
  total: { 'totals.grandTotalMinor': 1, _id: 1 },
  '-total': { 'totals.grandTotalMinor': -1, _id: -1 },
};

/**
 * Escapes a user-supplied search term before it reaches a `$regex`.
 *
 * Without this, a search for `a+++++++++b` becomes a regex that can pin a
 * database CPU for seconds — a denial of service delivered through a search
 * box. Escaping turns every metacharacter back into a literal.
 */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildDocumentFilter(
  userId: string,
  query: Partial<ListDocumentsQuery>,
): Record<string, unknown> {
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };

  if (query.status && query.status !== 'all') filter.status = query.status;

  if (query.from || query.to) {
    // Both bounds inclusive: "1–31 January" should include 31 January.
    const range: Record<string, Date> = {};
    if (query.from) range.$gte = query.from;
    if (query.to) range.$lte = query.to;
    filter.issueDate = range;
  }

  if (query.customer) {
    filter['customer.name'] = { $regex: `^${escapeRegex(query.customer)}$`, $options: 'i' };
  }

  if (query.q) {
    const pattern = escapeRegex(query.q);
    filter.$or = [
      { title: { $regex: pattern, $options: 'i' } },
      { 'customer.name': { $regex: pattern, $options: 'i' } },
      { number: { $regex: pattern, $options: 'i' } },
    ];
  }

  return filter;
}

export async function listDocuments(
  userId: string,
  query: ListDocumentsQuery,
): Promise<PaginatedDocuments> {
  const filter = buildDocumentFilter(userId, query);
  const skip = (query.page - 1) * query.limit;

  // Count and page run concurrently — they touch the same index and neither
  // depends on the other, so waiting for them in sequence is wasted latency.
  const [records, total] = await Promise.all([
    DocumentModel.find(filter)
      // Projection matters as much as the index: `lines` is the bulk of a
      // document and the table shows none of it.
      .select(
        'number title customer.name issueDate dueDate status currency totals finalizedAt updatedAt lines',
      )
      .sort(SORT_FIELDS[query.sort])
      .skip(skip)
      .limit(query.limit)
      .lean(),
    DocumentModel.countDocuments(filter),
  ]);

  return {
    data: records.map((record) => {
      const currency = record.currency;
      return {
        id: String(record._id),
        number: record.number,
        title: record.title,
        customerName: record.customer?.name ?? '',
        issueDate: toCalendarDate(record.issueDate),
        dueDate: toCalendarDate(record.dueDate),
        status: record.status as 'draft' | 'finalized',
        currency,
        lineCount: record.lines?.length ?? 0,
        subtotal: formatMinor(record.totals.subtotalMinor, currency),
        totalDiscount: formatMinor(record.totals.totalDiscountMinor, currency),
        totalTax: formatMinor(record.totals.totalTaxMinor, currency),
        grandTotal: formatMinor(record.totals.grandTotalMinor, currency),
        grandTotalMinor: record.totals.grandTotalMinor,
        finalizedAt: record.finalizedAt ? new Date(record.finalizedAt).toISOString() : null,
        updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : null,
      };
    }),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      hasMore: skip + records.length < total,
    },
  };
}

/** Distinct customer names, for the filter dropdown and autocomplete. */
export async function listCustomers(userId: string): Promise<
  Array<{ name: string; documentCount: number; lastIssueDate: string | null }>
> {
  const pipeline: PipelineStage[] = [
    { $match: { userId: new Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$customer.name',
        documentCount: { $sum: 1 },
        lastIssueDate: { $max: '$issueDate' },
      },
    },
    { $sort: { documentCount: -1, _id: 1 } },
    { $limit: 200 },
  ];

  const rows = await DocumentModel.aggregate(pipeline);
  return rows.map((row) => ({
    name: row._id as string,
    documentCount: row.documentCount as number,
    lastIssueDate: toCalendarDate(row.lastIssueDate as Date),
  }));
}
