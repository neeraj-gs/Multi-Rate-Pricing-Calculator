'use client';

import * as React from 'react';
import useSWR from 'swr';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download } from 'lucide-react';

import { fetcher } from '@/lib/api-client';
import { cn, money, monthsAgoISO, todayISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/primitives';
import type { SummaryReport } from '@/lib/reports/summary';

/**
 * The summary report.
 *
 * Both range bounds are inclusive — "1 to 31 January" includes 31 January,
 * which is how a person reads it and is the difference between a report people
 * trust and a monthly support ticket.
 *
 * Totals are grouped by currency and never combined. If an account has AED and
 * USD documents in range, each gets its own card; adding them would produce a
 * number that means nothing.
 */

const PRESETS = [
  { label: 'This month', from: () => `${todayISO().slice(0, 7)}-01`, to: todayISO },
  { label: 'Last 3 months', from: () => monthsAgoISO(2), to: todayISO },
  { label: 'Last 12 months', from: () => monthsAgoISO(11), to: todayISO },
  { label: 'This year', from: () => `${todayISO().slice(0, 4)}-01-01`, to: todayISO },
];

export function ReportView() {
  const [from, setFrom] = React.useState(monthsAgoISO(5));
  const [to, setTo] = React.useState(todayISO());
  const [status, setStatus] = React.useState('all');
  const [groupBy, setGroupBy] = React.useState('month');

  const query = new URLSearchParams({ from, to, status, groupBy });
  const invalidRange = from > to;

  const { data, isLoading } = useSWR<SummaryReport>(
    invalidRange ? null : `/reports/summary?${query}`,
    fetcher,
    { keepPreviousData: true },
  );

  const primaryCurrency = data?.primaryCurrency ?? null;
  const chartData = React.useMemo(
    () =>
      (data?.timeseries ?? [])
        .filter((row) => row.currency === primaryCurrency)
        .map((row) => ({
          label: row.label,
          // Recharts needs a number to size a bar. This is a *chart geometry*
          // value, not an accounting one — every figure the user reads comes
          // from the formatted strings alongside it.
          total: row.grandTotalMinor / 100,
          grandTotal: row.grandTotal,
          totalTax: row.totalTax,
          documentCount: row.documentCount,
        })),
    [data, primaryCurrency],
  );

  return (
    <div className="px-6 py-8 lg:px-10">
      {/* Range controls */}
      <div className="flex flex-wrap items-end gap-4 rounded-sheet border border-ink-700 bg-ink-850 px-5 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="report-from">From</Label>
          <Input
            id="report-from"
            type="date"
            value={from}
            max={to}
            onChange={(event) => setFrom(event.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="report-to">To</Label>
          <Input
            id="report-to"
            type="date"
            value={to}
            min={from}
            onChange={(event) => setTo(event.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="report-status">Status</Label>
          <Select
            id="report-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="w-36"
          >
            <option value="all">All</option>
            <option value="draft">Drafts</option>
            <option value="finalized">Finalized</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="report-group">Group by</Label>
          <Select
            id="report-group"
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value)}
            className="w-32"
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </Select>
        </div>

        <div className="ml-auto flex items-end gap-2">
          <Button asChild variant="secondary" size="sm">
            <a href={`/api/reports/export?${query}`} download>
              <Download className="size-4" />
              Export CSV
            </a>
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              setFrom(preset.from());
              setTo(preset.to());
            }}
            className="rounded-full border border-ink-700 bg-ink-850 px-3 py-1 text-xs text-quill-500 transition-colors hover:border-brass-700 hover:text-brass-300"
          >
            {preset.label}
          </button>
        ))}
        <span className="ml-auto self-center font-mono text-[0.6875rem] text-quill-700">
          Both dates inclusive
        </span>
      </div>

      {invalidRange ? (
        <p
          role="alert"
          className="mt-6 rounded-sheet border border-oxblood-700 bg-oxblood-500/10 px-4 py-3 text-sm text-oxblood-300"
        >
          The start of the range is after the end. Swap the dates to see results.
        </p>
      ) : null}

      {/* Headline counts */}
      <div className="mt-8 grid gap-px overflow-hidden rounded-sheet border border-ink-700 bg-ink-700 sm:grid-cols-3">
        <Count label="Documents" value={data?.documentCount} loading={isLoading} />
        <Count label="Finalized" value={data?.finalizedCount} loading={isLoading} />
        <Count label="Line items" value={data?.lineItemCount} loading={isLoading} />
      </div>

      {/* Per-currency totals */}
      {isLoading && !data ? (
        <Skeleton className="mt-6 h-40 w-full" />
      ) : data && data.byCurrency.length > 0 ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {data.byCurrency.map((row) => (
            <div
              key={row.currency}
              className="rounded-sheet border border-ink-700 bg-ink-850 p-6"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-lg text-quill-100">{row.currency}</h3>
                <span className="font-mono text-xs text-quill-700">
                  {row.documentCount}{' '}
                  {row.documentCount === 1 ? 'document' : 'documents'}
                </span>
              </div>

              <dl className="mt-5 space-y-3">
                <Line label="Subtotal" value={money(row.subtotal, row.currency)} />
                <Line
                  label="Total discount"
                  value={`−${money(row.totalDiscount, row.currency)}`}
                  tone="verdigris"
                />
                <Line
                  label="Total tax"
                  value={`+${money(row.totalTax, row.currency)}`}
                />
                <div className="flex items-baseline justify-between pt-3">
                  <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-quill-300">
                    Grand total
                  </dt>
                  <dd className="double-rule tabular text-xl font-semibold text-brass-400">
                    {money(row.grandTotal, row.currency)}
                  </dd>
                </div>
              </dl>

              <p className="mt-5 border-t border-ink-700 pt-3 font-mono text-[0.6875rem] text-quill-700">
                Average document {money(row.averageDocumentValue, row.currency)}
              </p>
            </div>
          ))}
        </div>
      ) : !invalidRange ? (
        <p className="mt-6 rounded-sheet border border-ink-700 bg-ink-850 px-4 py-12 text-center text-sm text-quill-500">
          No documents were issued in this range.
        </p>
      ) : null}

      {/* Timeseries */}
      {chartData.length > 0 ? (
        <div className="mt-8 rounded-sheet border border-ink-700 bg-ink-850 p-6">
          <h3 className="font-display text-lg text-quill-100">
            Grand total by {groupBy}
            <span className="ml-2 font-mono text-xs text-quill-700">
              {primaryCurrency}
            </span>
          </h3>

          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <CartesianGrid stroke="#232d42" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#5b6377"
                  tick={{ fontSize: 11, fontFamily: 'var(--font-plex-mono)' }}
                  tickLine={false}
                  axisLine={{ stroke: '#232d42' }}
                />
                <YAxis
                  stroke="#5b6377"
                  tick={{ fontSize: 11, fontFamily: 'var(--font-plex-mono)' }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(205,163,73,0.06)' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0].payload as (typeof chartData)[number];
                    return (
                      <div className="rounded-sheet border border-ink-600 bg-ink-900 px-3 py-2 shadow-lift">
                        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-quill-700">
                          {label}
                        </p>
                        <p className="tabular mt-1.5 text-sm text-brass-400">
                          {money(row.grandTotal, primaryCurrency ?? 'USD')}
                        </p>
                        <p className="tabular text-xs text-quill-500">
                          tax {money(row.totalTax, primaryCurrency ?? 'USD')}
                        </p>
                        <p className="mt-1 text-xs text-quill-700">
                          {row.documentCount}{' '}
                          {row.documentCount === 1 ? 'document' : 'documents'}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="total" fill="#cda349" radius={[2, 2, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      <p className="mt-8 max-w-2xl font-mono text-xs leading-relaxed text-quill-700">
        These figures are a MongoDB aggregation over the same stored integers each
        document displays — the report is a $group, not a second calculation, so
        it cannot disagree with the documents behind it. Export the CSV to check
        it row by row.
      </p>
    </div>
  );
}

function Count({
  label,
  value,
  loading,
}: {
  label: string;
  value?: number;
  loading: boolean;
}) {
  return (
    <div className="bg-ink-900 px-5 py-5">
      <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-quill-700">
        {label}
      </p>
      {loading && value === undefined ? (
        <Skeleton className="mt-3 h-8 w-16" />
      ) : (
        <p className="tabular mt-3 text-2xl text-quill-100">{value ?? 0}</p>
      )}
    </div>
  );
}

function Line({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'verdigris';
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-quill-500">
        {label}
      </dt>
      <dd
        className={cn(
          'tabular text-sm',
          tone === 'verdigris' ? 'text-verdigris-300' : 'text-quill-100',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
