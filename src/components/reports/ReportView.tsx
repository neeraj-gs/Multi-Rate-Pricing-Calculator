'use client';

import * as React from 'react';
import Link from 'next/link';
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
import { ArrowDownRight, ArrowUpRight, Download, FileText, Minus } from 'lucide-react';

import { fetcher } from '@/lib/api-client';
import { formatMinor } from '@/lib/pricing';
import { cn, formatDate, money, monthsAgoISO, todayISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/field';
import { Skeleton, StatusBadge } from '@/components/ui/primitives';
import type { SummaryReport } from '@/lib/reports/summary';
import type { PaginatedDocuments } from '@/lib/documents/queries';
import {
  AXIS_TEXT,
  GRID,
  LIFECYCLE,
  MEASURE,
  currencyColour,
} from './chart-tokens';

/**
 * The summary report.
 *
 * Both range bounds are inclusive — "1 to 31 January" includes 31 January,
 * which is how a person reads it and is the difference between a report people
 * trust and a monthly support ticket.
 *
 * Totals are grouped by currency and never combined. If an account has AED and
 * USD documents in range, each gets its own figures; adding them would produce
 * a number that means nothing.
 *
 * ## Why these forms
 *
 * The four figures the brief asks for are *headline numbers*, so they are stat
 * tiles rather than a chart — a chart of four unrelated scalars communicates
 * less than the scalars do. Money over time is a bar chart. Tax and discount
 * are the same unit as the grand total but roughly a twentieth of it, so they
 * get their own small multiples rather than a second y-axis: a dual-axis chart
 * lets you imply any correlation you like by choosing the scales.
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

  // The documents behind the figures. A summary you cannot drill into is a
  // number you have to take on trust.
  const { data: documents } = useSWR<PaginatedDocuments>(
    invalidRange
      ? null
      : `/documents?from=${from}&to=${to}&status=${status}&sort=-total&limit=8`,
    fetcher,
    { keepPreviousData: true },
  );

  const primary = data?.byCurrency[0] ?? null;
  const currencyOrder = React.useMemo(
    () => (data?.byCurrency ?? []).map((row) => row.currency),
    [data],
  );

  const previousPrimary = data?.comparison?.byCurrency.find(
    (row) => row.currency === primary?.currency,
  );

  return (
    <div className="px-6 py-8 lg:px-10">
      <Filters
        from={from}
        setFrom={setFrom}
        to={to}
        setTo={setTo}
        status={status}
        setStatus={setStatus}
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        query={query.toString()}
        onPreset={(preset) => {
          setFrom(preset.from());
          setTo(preset.to());
        }}
      />

      {invalidRange ? (
        <p
          role="alert"
          className="mt-6 rounded-sheet border border-oxblood-700 bg-oxblood-500/10 px-4 py-3 text-sm text-oxblood-300"
        >
          The start of the range is after the end. Swap the dates to see results.
        </p>
      ) : null}

      {/* The brief's four figures, in the order it lists them. */}
      <div className="mt-8 grid gap-px overflow-hidden rounded-sheet border border-ink-700 bg-ink-700 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Documents"
          value={data ? String(data.documentCount) : null}
          caption={
            data ? `${data.draftCount} draft · ${data.finalizedCount} finalized` : ''
          }
          delta={delta(data?.documentCount, data?.comparison?.documentCount)}
          loading={isLoading}
        />
        <Kpi
          label="Grand total"
          value={primary ? money(primary.grandTotal, primary.currency) : null}
          caption={primary ? `${primary.currency} · in range` : 'No documents'}
          delta={delta(
            primary?.amounts.grandTotalMinor,
            previousPrimary?.grandTotalMinor,
          )}
          settled
          loading={isLoading}
        />
        <Kpi
          label="Total tax"
          value={primary ? money(primary.totalTax, primary.currency) : null}
          caption={
            primary
              ? `${primary.effectiveTaxRatePercent}% of discounted value`
              : 'On discounted amounts'
          }
          tone="steel"
          loading={isLoading}
        />
        <Kpi
          label="Total discount"
          value={primary ? money(primary.totalDiscount, primary.currency) : null}
          caption={
            primary
              ? `${primary.discountRatePercent}% of subtotal given away`
              : 'Before tax'
          }
          tone="verdigris"
          loading={isLoading}
        />
      </div>

      {data && data.byCurrency.length > 1 ? (
        <p className="mt-3 font-mono text-xs text-quill-700">
          Headline figures show {primary?.currency}. Every currency is broken out
          below — they are never added together.
        </p>
      ) : null}

      {/* Trend */}
      {data && data.timeseries.length > 0 ? (
        <div className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <TrendChart report={data} groupBy={groupBy} />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <SmallMultiple
              report={data}
              measure="totalTax"
              label="Tax"
              colour={MEASURE.tax}
            />
            <SmallMultiple
              report={data}
              measure="totalDiscount"
              label="Discount"
              colour={MEASURE.discount}
            />
          </div>
        </div>
      ) : null}

      {/* Composition */}
      {data && data.byCurrency.length > 0 ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <StatusComposition report={data} />
          <CurrencyMix report={data} order={currencyOrder} />
        </div>
      ) : null}

      {/* Per-currency detail */}
      {isLoading && !data ? (
        <Skeleton className="mt-4 h-48 w-full" />
      ) : data && data.byCurrency.length > 0 ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {data.byCurrency.map((row) => (
            <CurrencyCard key={row.currency} row={row} order={currencyOrder} />
          ))}
        </div>
      ) : !invalidRange ? (
        <p className="mt-8 rounded-sheet border border-ink-700 bg-ink-850 px-4 py-14 text-center text-sm text-quill-500">
          No documents were issued in this range.
        </p>
      ) : null}

      {/* Ranked customers */}
      {data && data.topCustomers.length > 0 ? (
        <TopCustomers report={data} />
      ) : null}

      {/* The rows behind the numbers */}
      {documents && documents.data.length > 0 ? (
        <DocumentsInRange documents={documents} />
      ) : null}

      <p className="mt-8 max-w-3xl font-mono text-xs leading-relaxed text-quill-700">
        These figures are a MongoDB aggregation over the same stored integers each
        document displays — the report is a $group, not a second calculation, so
        it cannot disagree with the documents behind it. Export the CSV or the PDF
        to check it row by row.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Filters({
  from,
  setFrom,
  to,
  setTo,
  status,
  setStatus,
  groupBy,
  setGroupBy,
  query,
  onPreset,
}: {
  from: string;
  setFrom: (value: string) => void;
  to: string;
  setTo: (value: string) => void;
  status: string;
  setStatus: (value: string) => void;
  groupBy: string;
  setGroupBy: (value: string) => void;
  query: string;
  onPreset: (preset: (typeof PRESETS)[number]) => void;
}) {
  return (
    <>
      {/* Filters in one row above the charts, as a group. */}
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
              CSV
            </a>
          </Button>
          <Button asChild variant="primary" size="sm">
            <Link href={`/reports/print?${query}`}>
              <FileText className="size-4" />
              PDF
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onPreset(preset)}
            className="rounded-full border border-ink-700 bg-ink-850 px-3 py-1 text-xs text-quill-500 transition-colors hover:border-brass-700 hover:text-brass-300"
          >
            {preset.label}
          </button>
        ))}
        <span className="ml-auto self-center font-mono text-[0.6875rem] text-quill-700">
          Both dates inclusive
        </span>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function delta(current?: number, previous?: number) {
  if (current === undefined || previous === undefined || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function Kpi({
  label,
  value,
  caption,
  delta: change,
  settled,
  tone,
  loading,
}: {
  label: string;
  value: string | null;
  caption: string;
  delta?: number | null;
  settled?: boolean;
  tone?: 'steel' | 'verdigris';
  loading?: boolean;
}) {
  return (
    <div className="bg-ink-900 px-5 py-5">
      <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-quill-700">
        {label}
      </p>

      {loading && value === null ? (
        <Skeleton className="mt-3 h-8 w-28" />
      ) : (
        <p
          className={cn(
            'tabular mt-3 text-2xl',
            settled
              ? 'double-rule inline-block font-semibold text-brass-400'
              : tone === 'steel'
                ? 'text-steel-300'
                : tone === 'verdigris'
                  ? 'text-verdigris-300'
                  : 'text-quill-100',
          )}
        >
          {value ?? '—'}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {change !== null && change !== undefined ? <Delta value={change} /> : null}
        <p className="text-xs text-quill-700">{caption}</p>
      </div>
    </div>
  );
}

/**
 * Direction against the preceding window of equal length.
 *
 * The arrow and the sign both carry it, so this never depends on colour alone.
 */
function Delta({ value }: { value: number }) {
  const flat = Math.abs(value) < 0.5;
  const up = value > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-mono text-[0.6875rem]',
        flat ? 'text-quill-700' : up ? 'text-verdigris-300' : 'text-oxblood-300',
      )}
      title="Compared with the preceding period of equal length"
    >
      <Icon className="size-3" />
      {flat ? 'flat' : `${up ? '+' : ''}${value.toFixed(0)}%`}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

function ChartCard({
  title,
  meta,
  children,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn('rounded-sheet border border-ink-700 bg-ink-850', className)}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink-700 px-5 py-3.5">
        <h2 className="font-display text-base text-quill-100">{title}</h2>
        {meta ? (
          <span className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-quill-700">
            {meta}
          </span>
        ) : null}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ChartTooltip({
  label,
  rows,
}: {
  label: string;
  rows: Array<[string, string]>;
}) {
  return (
    <div className="rounded-sheet border border-ink-600 bg-ink-950 px-3 py-2 shadow-lift">
      <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-quill-700">
        {label}
      </p>
      <dl className="mt-1.5 space-y-0.5">
        {rows.map(([key, value]) => (
          <div key={key} className="flex items-baseline justify-between gap-4">
            <dt className="text-xs text-quill-500">{key}</dt>
            <dd className="tabular text-xs text-quill-100">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * One currency's series, laid over every period the range covers.
 *
 * The aggregation only returns periods that have documents, so plotting it
 * directly draws a time axis with its empty months *removed* — December next to
 * February, reading as consecutive. Joining onto `report.periods` puts the
 * quiet months back as zeroes, which is what actually happened.
 *
 * Falls back to the returned rows when the axis is absent (a range too dense to
 * enumerate), because a compressed axis still beats no chart.
 */
function seriesFor(report: SummaryReport, currency: string) {
  const found = new Map(
    report.timeseries.filter((row) => row.currency === currency).map((row) => [row.period, row]),
  );

  const axis =
    report.periods.length > 0
      ? report.periods
      : [...found.values()].map((row) => ({ period: row.period, label: row.label }));

  const zero = formatMinor(0, currency);

  return axis.map(({ period, label }) => {
    const row = found.get(period);
    return {
      label,
      // Chart geometry only. Every figure the reader sees comes from the
      // formatted strings alongside it.
      plot: row?.grandTotalMinor ?? 0,
      grandTotal: row?.grandTotal ?? zero,
      totalTax: row?.totalTax ?? zero,
      totalDiscount: row?.totalDiscount ?? zero,
      documentCount: row?.documentCount ?? 0,
    };
  });
}

/**
 * A two-line time tick: the period on top, its year beneath — and the year only
 * on the tick where it changes.
 *
 * Twelve "Sep 2025"-width labels do not fit across a chart this wide; recharts'
 * answer is to drop every other one, which leaves an axis whose gridlines and
 * labels no longer correspond. Splitting the year off makes each label short
 * enough that all of them fit, and printing it once per year turns the repeated
 * token into a boundary marker — the reader sees where 2026 begins instead of
 * reading "2025" nine times.
 */
function TimeTick({
  x,
  y,
  payload,
  showYear,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string | number; index?: number };
  showYear: (index: number) => boolean;
}) {
  const label = String(payload?.value ?? '');
  const split = label.lastIndexOf(' ');
  const head = split === -1 ? label : label.slice(0, split);
  const year = split === -1 ? '' : label.slice(split + 1);
  const index = payload?.index ?? 0;

  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text
        textAnchor="middle"
        dy={12}
        fill={AXIS_TEXT}
        fontSize={11}
        fontFamily="var(--font-plex-mono)"
      >
        {head}
      </text>
      {year && showYear(index) ? (
        <text
          textAnchor="middle"
          dy={26}
          fill={AXIS_TEXT}
          fontSize={10}
          fontFamily="var(--font-plex-mono)"
        >
          {year}
        </text>
      ) : null}
    </g>
  );
}

/** The indices at which a new year starts — where the year is worth printing. */
function yearBoundaries(labels: string[]): (index: number) => boolean {
  const boundaries = new Set<number>();
  let previous = '';
  labels.forEach((label, index) => {
    const year = label.slice(label.lastIndexOf(' ') + 1);
    if (year !== previous) {
      boundaries.add(index);
      previous = year;
    }
  });
  return (index: number) => boundaries.has(index);
}

function TrendChart({
  report,
  groupBy,
}: {
  report: SummaryReport;
  groupBy: string;
}) {
  const currency = report.primaryCurrency ?? 'USD';
  const rows = seriesFor(report, currency);
  const showYear = yearBoundaries(rows.map((row) => row.label));

  return (
    <ChartCard
      title="Grand total over time"
      meta={`${currency} · by ${groupBy}`}
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 12, left: 4 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="label"
              stroke={AXIS_TEXT}
              tick={<TimeTick showYear={showYear} />}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              interval={0}
              height={38}
            />
            <YAxis
              stroke={AXIS_TEXT}
              tick={{ fontSize: 11, fontFamily: 'var(--font-plex-mono)' }}
              tickLine={false}
              axisLine={false}
              width={68}
              tickFormatter={(value: number) =>
                Math.abs(value) >= 100_000
                  ? `${Math.round(value / 100_000)}k`
                  : String(Math.round(value / 100))
              }
            />
            <Tooltip
              cursor={{ fill: 'rgba(189,130,38,0.08)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as (typeof rows)[number];
                return (
                  <ChartTooltip
                    label={String(label)}
                    rows={[
                      ['Grand total', money(row.grandTotal, currency)],
                      ['Tax', money(row.totalTax, currency)],
                      [
                        'Documents',
                        `${row.documentCount} ${row.documentCount === 1 ? 'document' : 'documents'}`,
                      ],
                    ]}
                  />
                );
              }}
            />
            {/* Rounded data-end anchored to the baseline, thin marks. */}
            <Bar
              dataKey="plot"
              fill={MEASURE.total}
              radius={[4, 4, 0, 0]}
              maxBarSize={44}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 font-mono text-[0.625rem] text-quill-700">
        Axis in {currency} · k = thousands
      </p>
    </ChartCard>
  );
}

/**
 * Tax and discount, each on its own scale.
 *
 * They share a unit with the grand total but are roughly a twentieth of it, so
 * plotting them on the same axis would flatten them to nothing — and putting
 * them on a *second* axis would let the scales imply whatever relationship
 * suited. Small multiples keep the form identical and the scales honest.
 */
function SmallMultiple({
  report,
  measure,
  label,
  colour,
}: {
  report: SummaryReport;
  measure: 'totalTax' | 'totalDiscount';
  label: string;
  colour: string;
}) {
  const currency = report.primaryCurrency ?? 'USD';
  const rows = seriesFor(report, currency).map((row) => ({
    label: row.label,
    plot: Number(row[measure].replace(/,/g, '')),
    display: row[measure],
  }));

  return (
    <ChartCard title={label} meta={currency}>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              content={({ active, payload, label: period }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as (typeof rows)[number];
                return (
                  <ChartTooltip
                    label={String(period)}
                    rows={[[label, money(row.display, currency)]]}
                  />
                );
              }}
            />
            <Bar dataKey="plot" fill={colour} radius={[3, 3, 0, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/* -------------------------------------------------------------------------- */

/** Committed value versus still in progress — what counts alone cannot show. */
function StatusComposition({ report }: { report: SummaryReport }) {
  const currency = report.primaryCurrency ?? 'USD';
  const rows = report.byStatus.filter((row) => row.currency === currency);
  const finalized = rows.find((row) => row.status === 'finalized');
  const draft = rows.find((row) => row.status === 'draft');

  const finalizedValue = finalized?.grandTotalMinor ?? 0;
  const draftValue = draft?.grandTotalMinor ?? 0;
  const total = finalizedValue + draftValue;
  if (total === 0) return null;

  const finalizedShare = (finalizedValue / total) * 100;

  return (
    <ChartCard title="Committed vs in progress" meta={currency}>
      {/* 2px surface gap between fills, and both segments directly labelled —
          so the split never depends on telling two colours apart. */}
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        <div
          style={{ width: `${finalizedShare}%`, background: LIFECYCLE.finalized }}
          className="rounded-l-full"
        />
        <div
          style={{ width: `${100 - finalizedShare}%`, background: LIFECYCLE.draft }}
          className="rounded-r-full"
        />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4">
        <Legend
          swatch={LIFECYCLE.finalized}
          term="Finalized"
          value={money(finalized?.grandTotal ?? '0.00', currency)}
          detail={`${finalized?.documentCount ?? 0} documents · ${finalizedShare.toFixed(0)}%`}
        />
        <Legend
          swatch={LIFECYCLE.draft}
          term="Draft"
          value={money(draft?.grandTotal ?? '0.00', currency)}
          detail={`${draft?.documentCount ?? 0} documents · ${(100 - finalizedShare).toFixed(0)}%`}
        />
      </dl>
    </ChartCard>
  );
}

function CurrencyMix({
  report,
  order,
}: {
  report: SummaryReport;
  order: string[];
}) {
  if (report.byCurrency.length < 2) return null;

  // Share of *document count*, not of value — values in different currencies
  // cannot be summed, so a value share would be a meaningless denominator.
  const total = report.documentCount;

  return (
    <ChartCard title="Currency mix" meta="by document count">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {report.byCurrency.map((row) => (
          <div
            key={row.currency}
            style={{
              width: `${(row.documentCount / total) * 100}%`,
              background: currencyColour(row.currency, order),
            }}
          />
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {report.byCurrency.map((row) => (
          <Legend
            key={row.currency}
            swatch={currencyColour(row.currency, order)}
            term={row.currency}
            value={money(row.grandTotal, row.currency)}
            detail={`${row.documentCount} · ${((row.documentCount / total) * 100).toFixed(0)}%`}
          />
        ))}
      </dl>
    </ChartCard>
  );
}

/** A swatch beside text, never a coloured label — text keeps text tokens. */
function Legend({
  swatch,
  term,
  value,
  detail,
}: {
  swatch: string;
  term: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-[2px]"
          style={{ background: swatch }}
        />
        <span className="truncate font-mono text-[0.625rem] uppercase tracking-[0.14em] text-quill-500">
          {term}
        </span>
      </dt>
      <dd className="tabular mt-1.5 text-sm text-quill-100">{value}</dd>
      <dd className="mt-0.5 font-mono text-[0.625rem] text-quill-700">{detail}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CurrencyCard({
  row,
  order,
}: {
  row: SummaryReport['byCurrency'][number];
  order: string[];
}) {
  return (
    <section className="rounded-sheet border border-ink-700 bg-ink-850 p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="flex items-center gap-2 font-display text-base text-quill-100">
          <span
            aria-hidden
            className="size-2 rounded-[2px]"
            style={{ background: currencyColour(row.currency, order) }}
          />
          {row.currency}
        </h3>
        <span className="font-mono text-[0.625rem] text-quill-700">
          {row.documentCount} {row.documentCount === 1 ? 'document' : 'documents'}
        </span>
      </div>

      <dl className="mt-5 space-y-2.5">
        <Row label="Subtotal" value={money(row.subtotal, row.currency)} />
        <Row
          label="Total discount"
          value={`−${money(row.totalDiscount, row.currency)}`}
          tone="verdigris"
        />
        <Row
          label="Total tax"
          value={`+${money(row.totalTax, row.currency)}`}
          tone="steel"
        />
        <div className="flex items-baseline justify-between pt-3">
          <dt className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-quill-300">
            Grand total
          </dt>
          <dd className="double-rule tabular text-lg font-semibold text-brass-400">
            {money(row.grandTotal, row.currency)}
          </dd>
        </div>
      </dl>

      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-ink-700 pt-4">
        <Stat label="Average" value={money(row.averageDocumentValue, row.currency)} />
        <Stat label="Discount rate" value={`${row.discountRatePercent}%`} />
        <Stat label="Effective tax" value={`${row.effectiveTaxRatePercent}%`} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-quill-700">
        {label}
      </dt>
      <dd className="tabular mt-1 truncate text-xs text-quill-300">{value}</dd>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'verdigris' | 'steel';
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-quill-700">
        {label}
      </dt>
      <dd
        className={cn(
          'tabular text-sm',
          tone === 'verdigris'
            ? 'text-verdigris-300'
            : tone === 'steel'
              ? 'text-steel-300'
              : 'text-quill-300',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Ranked magnitude — horizontal bars, direct-labelled, no legend needed. */
function TopCustomers({ report }: { report: SummaryReport }) {
  const currency = report.primaryCurrency ?? 'USD';
  const rows = report.topCustomers.filter((row) => row.currency === currency);
  if (rows.length === 0) return null;

  const largest = Math.max(...rows.map((row) => row.grandTotalMinor));

  return (
    <ChartCard title="Top customers" meta={currency} className="mt-4">
      <ol className="space-y-3">
        {rows.map((row, index) => (
          <li key={row.name}>
            <div className="flex items-baseline justify-between gap-4">
              <span className="flex min-w-0 items-baseline gap-2.5">
                <span className="font-mono text-[0.625rem] text-quill-700">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="truncate text-sm text-quill-100">{row.name}</span>
              </span>
              <span className="tabular shrink-0 text-sm text-quill-300">
                {money(row.grandTotal, currency)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(row.grandTotalMinor / largest) * 100}%`,
                  background: MEASURE.total,
                }}
              />
            </div>
          </li>
        ))}
      </ol>
    </ChartCard>
  );
}

function DocumentsInRange({ documents }: { documents: PaginatedDocuments }) {
  return (
    <ChartCard
      title="Largest documents in range"
      meta={`${documents.pagination.total} in total`}
      className="mt-4"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-quill-700">
              <th className="pb-2.5 pr-4 font-medium">Number</th>
              <th className="pb-2.5 pr-4 font-medium">Customer</th>
              <th className="pb-2.5 pr-4 font-medium">Issued</th>
              <th className="pb-2.5 pr-4 font-medium">Status</th>
              <th className="pb-2.5 pl-4 text-right font-medium">Grand total</th>
            </tr>
          </thead>
          <tbody>
            {documents.data.map((document) => (
              <tr key={document.id} className="border-b border-ink-800 last:border-0">
                <td className="py-2.5 pr-4">
                  <Link
                    href={`/documents/${document.id}`}
                    className="font-mono text-xs text-brass-400 hover:underline"
                  >
                    {document.number}
                  </Link>
                </td>
                <td className="py-2.5 pr-4 text-quill-300">{document.customerName}</td>
                <td className="tabular py-2.5 pr-4 text-xs text-quill-500">
                  {formatDate(document.issueDate)}
                </td>
                <td className="py-2.5 pr-4">
                  <StatusBadge status={document.status} />
                </td>
                <td className="tabular py-2.5 pl-4 text-right text-quill-100">
                  {money(document.grandTotal, document.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
