import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';

import { getSession } from '@/lib/auth/session';
import { connectToDatabase, User } from '@/lib/db';
import { buildSummaryReport } from '@/lib/reports/summary';
import { listDocuments } from '@/lib/documents/queries';
import { reportRangeSchema } from '@/lib/validation/documents';
import {
  DISPLAY_CURRENCY_COOKIE,
  normalizeDisplayCurrency,
} from '@/lib/display-currency';
import { formatDate, groupDigits, money } from '@/lib/utils';
import { PrintButton } from '@/components/documents/PrintButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Summary report' };

/**
 * The report as a printable page.
 *
 * Carries the same filters as the dashboard through the query string, so the
 * PDF is the range you were looking at rather than a fixed default — "download
 * what I filtered" is the whole point.
 *
 * Rendered as a light page for the same reason a document is: this is the one
 * thing here destined for paper. Everything on it is a figure from the same
 * aggregation the dashboard reads, so the two cannot disagree.
 */
export default async function ReportPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const params = await searchParams;
  const parsed = reportRangeSchema.safeParse({
    from: params.from,
    to: params.to,
    status: params.status ?? 'all',
    groupBy: params.groupBy ?? 'month',
    ...(params.currency ? { currency: params.currency } : {}),
    // Carried from the dashboard, so the PDF is the view you were looking at.
    // Falls back to the cookie for a URL typed or bookmarked without it.
    display: normalizeDisplayCurrency(
      typeof params.display === 'string'
        ? params.display
        : (await cookies()).get(DISPLAY_CURRENCY_COOKIE)?.value,
    ),
  });

  // A malformed range is the dashboard's problem to explain, not the PDF's.
  if (!parsed.success) redirect('/reports');

  await connectToDatabase();

  const [report, documents, user] = await Promise.all([
    buildSummaryReport(session.sub, parsed.data),
    listDocuments(session.sub, {
      page: 1,
      limit: 100,
      status: parsed.data.status,
      from: parsed.data.from,
      to: parsed.data.to,
      sort: '-issueDate',
    }),
    User.findById(session.sub).lean(),
  ]);

  const generated = new Date().toISOString();
  const converted = report.display;
  const headline = converted ?? report.byCurrency[0];

  return (
    <div className="min-h-dvh bg-ink-950">
      <div className="no-print sticky top-0 z-10 border-b border-ink-800 bg-ink-900/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[900px] flex-wrap items-center gap-3 px-5 py-3">
          <Link
            href="/reports"
            className="flex items-center gap-1.5 text-sm text-quill-500 transition-colors hover:text-brass-300"
          >
            <ArrowLeft className="size-4" />
            Back to report
          </Link>
          <span className="ml-auto hidden font-mono text-[0.625rem] text-quill-700 sm:inline">
            Choose &ldquo;Save as PDF&rdquo; as the destination
          </span>
          <PrintButton />
        </div>
      </div>

      <div className="mx-auto max-w-[900px] px-5 py-8 print:max-w-none print:p-0">
        <article className="document-page bg-white px-10 py-12 text-[#12161f] sm:px-14">
          <header className="flex flex-wrap items-start justify-between gap-8 border-b-2 border-[#12161f] pb-6">
            <div>
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.28em] text-[#6b7280]">
                {user?.company || 'LedgerLine'}
              </p>
              <h1 className="mt-3 font-display text-[1.75rem] leading-tight">
                Summary report
              </h1>
            </div>
            <dl className="text-right text-sm">
              <div>
                <dt className="font-mono text-[0.5625rem] uppercase tracking-[0.2em] text-[#6b7280]">
                  Issue dates
                </dt>
                <dd className="tabular">
                  {formatDate(report.range.from)} — {formatDate(report.range.to)}
                </dd>
              </div>
              <div className="mt-2">
                <dt className="font-mono text-[0.5625rem] uppercase tracking-[0.2em] text-[#6b7280]">
                  Status filter
                </dt>
                <dd className="capitalize">{report.range.status}</dd>
              </div>
            </dl>
          </header>

          {/* The four figures the brief asks for. */}
          <section className="grid grid-cols-2 gap-6 border-b border-[#d8dbe0] py-7 sm:grid-cols-4">
            <Figure label="Documents" value={String(report.documentCount)} />
            <Figure
              label="Grand total"
              value={headline ? money(headline.grandTotal, headline.currency) : '—'}
              settled
            />
            <Figure
              label="Total tax"
              value={headline ? money(headline.totalTax, headline.currency) : '—'}
            />
            <Figure
              label="Total discount"
              value={headline ? money(headline.totalDiscount, headline.currency) : '—'}
            />
          </section>

          {/* Per currency, never combined. */}
          <section className="py-7">
            <h2 className="font-mono text-[0.5625rem] uppercase tracking-[0.2em] text-[#6b7280]">
              By currency
            </h2>
            <table className="mt-3 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#12161f] text-left font-mono text-[0.5625rem] uppercase tracking-[0.14em] text-[#6b7280]">
                  <th className="pb-2 pr-4 font-medium">Currency</th>
                  <th className="pb-2 pr-4 text-right font-medium">Docs</th>
                  <th className="pb-2 pr-4 text-right font-medium">Subtotal</th>
                  <th className="pb-2 pr-4 text-right font-medium">Discount</th>
                  <th className="pb-2 pr-4 text-right font-medium">Tax</th>
                  <th className="pb-2 pl-4 text-right font-medium">Grand total</th>
                  {converted ? (
                    <th className="pb-2 pl-4 text-right font-medium">
                      In {converted.currency}
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {report.byCurrency.map((row, index) => (
                  <tr key={row.currency} className="border-b border-[#e5e7eb]">
                    <td className="py-2.5 pr-4 font-medium">{row.currency}</td>
                    <td className="tabular py-2.5 pr-4 text-right">
                      {row.documentCount}
                    </td>
                    {/* Grouped, but without the currency marker — the row's
                        first column already names it. */}
                    <td className="tabular py-2.5 pr-4 text-right">
                      {groupDigits(row.subtotal)}
                    </td>
                    <td className="tabular py-2.5 pr-4 text-right">
                      −{groupDigits(row.totalDiscount)}
                    </td>
                    <td className="tabular py-2.5 pr-4 text-right">
                      +{groupDigits(row.totalTax)}
                    </td>
                    <td className="tabular py-2.5 pl-4 text-right font-semibold">
                      {groupDigits(row.grandTotal)}
                    </td>
                    {converted ? (
                      <td className="tabular py-2.5 pl-4 text-right">
                        {groupDigits(converted.sources[index]?.grandTotal ?? '0.00')}
                      </td>
                    ) : null}
                  </tr>
                ))}

                {/* The combined figure only exists once there is a rate, so it
                    is a row of the converted column and of nothing else. */}
                {converted ? (
                  <tr className="border-b-2 border-[#12161f]">
                    <td className="py-2.5 pr-4 font-medium" colSpan={5}>
                      Combined, converted to {converted.currency}
                    </td>
                    <td />
                    <td className="tabular py-2.5 pl-4 text-right font-semibold">
                      {groupDigits(converted.grandTotal)}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            {converted && converted.converted ? (
              <p className="mt-3 font-mono text-[0.625rem] leading-relaxed text-[#9ca3af]">
                Each currency is reported in its own terms first; the final
                column converts it at rates of {converted.ratesAsOf} —{' '}
                {converted.sources.map((source) => source.rate).join(', ')}. Every
                unconverted row satisfies subtotal − discount + tax = grand total
                exactly. The combined figure depends on those rates and is for
                comparison, not for accounting.
              </p>
            ) : (
              <p className="mt-3 font-mono text-[0.625rem] leading-relaxed text-[#9ca3af]">
                Currencies are reported separately and never summed — adding one to
                another produces a figure that means nothing. Each row satisfies
                subtotal − discount + tax = grand total exactly.
              </p>
            )}
          </section>

          {/* The documents behind the figures. */}
          <section className="border-t border-[#d8dbe0] py-7">
            <h2 className="font-mono text-[0.5625rem] uppercase tracking-[0.2em] text-[#6b7280]">
              Documents in range ({documents.pagination.total})
            </h2>
            <table className="mt-3 w-full border-collapse text-[0.8125rem]">
              <thead>
                <tr className="border-b border-[#12161f] text-left font-mono text-[0.5625rem] uppercase tracking-[0.14em] text-[#6b7280]">
                  <th className="pb-2 pr-3 font-medium">Number</th>
                  <th className="pb-2 pr-3 font-medium">Customer</th>
                  <th className="pb-2 pr-3 font-medium">Issued</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 pr-3 text-right font-medium">Tax</th>
                  <th className="pb-2 pl-3 text-right font-medium">Grand total</th>
                </tr>
              </thead>
              <tbody>
                {documents.data.map((document) => (
                  <tr key={document.id} className="border-b border-[#e5e7eb]">
                    <td className="tabular py-2 pr-3">{document.number}</td>
                    <td className="py-2 pr-3">{document.customerName}</td>
                    <td className="tabular py-2 pr-3">
                      {formatDate(document.issueDate)}
                    </td>
                    <td className="py-2 pr-3 capitalize">{document.status}</td>
                    <td className="tabular py-2 pr-3 text-right">
                      {document.currency} {document.totalTax}
                    </td>
                    <td className="tabular py-2 pl-3 text-right font-medium">
                      {document.currency} {document.grandTotal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {documents.pagination.total > documents.data.length ? (
              <p className="mt-3 font-mono text-[0.625rem] text-[#9ca3af]">
                Showing the first {documents.data.length} of{' '}
                {documents.pagination.total}. Export the CSV for the full list.
              </p>
            ) : null}
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#d8dbe0] pt-5 font-mono text-[0.5625rem] uppercase tracking-[0.14em] text-[#9ca3af]">
            <span>Generated {formatDate(generated)} · both range dates inclusive</span>
            <span>LedgerLine</span>
          </footer>
        </article>
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  settled,
}: {
  label: string;
  value: string;
  settled?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-[0.5625rem] uppercase tracking-[0.18em] text-[#6b7280]">
        {label}
      </p>
      {/* Nowrap: a currency code orphaned onto its own line above its amount
          reads as two facts rather than one figure — and the settled figure's
          rule would then underline only half of it. */}
      <p
        className={`tabular mt-2 whitespace-nowrap text-[0.9375rem] ${
          settled ? 'double-rule inline-block font-semibold' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}
