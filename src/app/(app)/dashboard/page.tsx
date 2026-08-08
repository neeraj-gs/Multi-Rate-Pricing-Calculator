import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, FileText, Plus } from 'lucide-react';

import { getSession } from '@/lib/auth/session';
import { connectToDatabase } from '@/lib/db';
import { listDocuments } from '@/lib/documents/queries';
import { buildSummaryReport } from '@/lib/reports/summary';
import { reportRangeSchema } from '@/lib/validation/documents';
import { formatDate, money, monthsAgoISO, todayISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, StatusBadge } from '@/components/ui/primitives';
import { PageHeader } from '@/components/app/PageHeader';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Overview' };

/**
 * The overview.
 *
 * Rendered on the server, calling the same query and aggregation modules the
 * API routes call — so the dashboard cannot show a figure the API would
 * disagree with, and the page arrives complete rather than assembling itself
 * from three fetches after paint.
 */
export default async function DashboardPage() {
  const session = await getSession();
  await connectToDatabase();

  const range = reportRangeSchema.parse({
    from: monthsAgoISO(11),
    to: todayISO(),
    status: 'all',
    groupBy: 'month',
  });

  const [report, recent] = await Promise.all([
    buildSummaryReport(session!.sub, range),
    listDocuments(session!.sub, {
      page: 1,
      limit: 6,
      status: 'all',
      sort: '-updatedAt',
    }),
  ]);

  const primary = report.byCurrency[0];
  const firstName = session!.name.split(' ')[0];

  if (report.documentCount === 0 && recent.pagination.total === 0) {
    return (
      <div>
        <PageHeader eyebrow="Overview" title={`Welcome, ${firstName}`} />
        <EmptyState
          icon={<FileText />}
          title="Nothing here yet"
          description="Create your first document. You can start from the worked example if you want to see how discounts and tax interact."
          action={
            <Button asChild variant="primary" size="lg">
              <Link href="/documents/new">
                <Plus className="size-4" />
                Create a document
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${firstName}`}
        description="The last twelve months, computed from your stored documents."
        actions={
          <Button asChild variant="primary">
            <Link href="/documents/new">
              <Plus className="size-4" />
              New document
            </Link>
          </Button>
        }
      />

      <div className="px-6 py-8 lg:px-10">
        {/* Headline figures. The grand total carries the double rule. */}
        <div className="grid gap-px overflow-hidden rounded-sheet border border-ink-700 bg-ink-700 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Documents"
            value={String(report.documentCount)}
            caption={`${report.draftCount} draft · ${report.finalizedCount} finalized`}
          />
          <Metric
            label="Grand total"
            value={primary ? money(primary.grandTotal, primary.currency) : '—'}
            caption={primary ? `${primary.currency} · 12 months` : 'No documents yet'}
            settled
          />
          <Metric
            label="Total tax"
            value={primary ? money(primary.totalTax, primary.currency) : '—'}
            caption="On discounted amounts"
          />
          <Metric
            label="Total discount"
            value={primary ? money(primary.totalDiscount, primary.currency) : '—'}
            caption="Given away"
            tone="verdigris"
          />
        </div>

        {report.byCurrency.length > 1 ? (
          <p className="mt-3 font-mono text-xs text-quill-700">
            Showing {primary?.currency}. You also have documents in{' '}
            {report.byCurrency
              .slice(1)
              .map((row) => row.currency)
              .join(', ')}{' '}
            — currencies are never added together.
          </p>
        ) : null}

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_20rem]">
          {/* Recent documents */}
          <section>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-xl text-quill-100">Recently edited</h2>
              <Link
                href="/documents"
                className="flex items-center gap-1 font-mono text-xs text-brass-400 hover:underline"
              >
                All documents
                <ArrowRight className="size-3" />
              </Link>
            </div>

            <div className="overflow-hidden rounded-sheet border border-ink-700">
              {recent.data.map((document, index) => (
                <Link
                  key={document.id}
                  href={`/documents/${document.id}`}
                  className={`flex items-center gap-4 bg-ink-900 px-4 py-3 transition-colors hover:bg-ink-850 ${
                    index > 0 ? 'border-t border-ink-800' : ''
                  }`}
                >
                  <span className="w-20 shrink-0 font-mono text-xs text-brass-500">
                    {document.number}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-quill-100">
                      {document.title}
                    </span>
                    <span className="block truncate text-xs text-quill-700">
                      {document.customerName} · {formatDate(document.issueDate)}
                    </span>
                  </span>
                  <StatusBadge status={document.status} />
                  {/* Wide enough for a seven-figure AED amount, and never
                      allowed to wrap — a total that breaks across two lines
                      stops reading as one number. */}
                  <span className="tabular w-36 shrink-0 whitespace-nowrap text-right text-sm text-quill-100">
                    {money(document.grandTotal, document.currency)}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* Top customers */}
          <aside>
            <h2 className="mb-4 font-display text-xl text-quill-100">Top customers</h2>
            {report.topCustomers.length === 0 ? (
              <p className="rounded-sheet border border-ink-700 bg-ink-850 px-4 py-6 text-center text-sm text-quill-700">
                No documents in this period.
              </p>
            ) : (
              <ol className="space-y-px overflow-hidden rounded-sheet border border-ink-700 bg-ink-700">
                {report.topCustomers.slice(0, 6).map((customer, index) => (
                  <li
                    key={`${customer.name}-${customer.currency}`}
                    className="flex items-center gap-3 bg-ink-900 px-4 py-3"
                  >
                    <span className="font-mono text-[0.625rem] text-quill-700">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-quill-300">
                      {customer.name}
                    </span>
                    <span className="tabular shrink-0 whitespace-nowrap text-sm text-quill-100">
                      {money(customer.grandTotal, customer.currency)}
                    </span>
                  </li>
                ))}
              </ol>
            )}

            <Link
              href="/reports"
              className="mt-4 flex items-center justify-between rounded-sheet border border-ink-700 bg-ink-850 px-4 py-3 text-sm text-quill-300 transition-colors hover:border-brass-700 hover:text-brass-300"
            >
              Full report by date range
              <ArrowRight className="size-4" />
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  caption,
  settled,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  settled?: boolean;
  tone?: 'verdigris';
}) {
  return (
    <div className="bg-ink-900 px-5 py-5">
      <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-quill-700">
        {label}
      </p>
      <p
        className={`tabular mt-3 text-2xl ${
          settled
            ? 'double-rule inline-block font-semibold text-brass-400'
            : tone === 'verdigris'
              ? 'text-verdigris-300'
              : 'text-quill-100'
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-quill-700">{caption}</p>
    </div>
  );
}
