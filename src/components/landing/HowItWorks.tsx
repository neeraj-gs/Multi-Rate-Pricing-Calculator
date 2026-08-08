import { FileLock2 } from 'lucide-react';

/**
 * What the product is, and how a person actually uses it.
 *
 * The four steps are a genuine sequence — you cannot report on a document you
 * have not issued, or issue one you have not priced — so they are numbered.
 * Each carries a small mockup built from the real design tokens rather than a
 * screenshot, so it stays in step with the app instead of going stale.
 */

export function WhatItIs() {
  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
      <div>
        <p className="eyebrow">What it is</p>
        <h2 className="mt-4 max-w-lg text-balance font-display text-[clamp(1.75rem,3.4vw,2.75rem)] text-quill-100">
          A quoting tool for teams whose numbers get checked
        </h2>

        <dl className="mt-10 max-w-md space-y-px overflow-hidden rounded-sheet border border-ink-700 bg-ink-700">
          {[
            ['Per line', 'Percentage or fixed discount, and its own tax rate'],
            ['Currencies', '12, each rounded to its real minor unit'],
            ['Once issued', 'Read-only permanently; duplicate to amend'],
            ['Reporting', 'Any date range, grouped by currency, CSV out'],
          ].map(([term, detail]) => (
            <div
              key={term}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 bg-ink-900 px-4 py-3"
            >
              <dt className="w-24 shrink-0 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-brass-400">
                {term}
              </dt>
              <dd className="min-w-0 flex-1 text-sm text-quill-500">{detail}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="max-w-xl space-y-5 text-pretty leading-relaxed text-quill-300">
        <p>
          You build a document — a quote, a proposal, a pro-forma invoice — out
          of line items. Each line has its own quantity, unit price, discount
          and tax rate, because real pricing is never one flat rate across a
          whole document.
        </p>
        <p>
          Tessera works out what each line comes to and what the document comes
          to, on the server, in exact integer arithmetic. When the pricing is
          settled you finalize the document, and from that moment it can never
          change — which is what makes it safe to send, and what makes a report
          covering last quarter still add up next year.
        </p>
        <p className="text-quill-500">
          It is deliberately not an accounting system. It does one job: getting
          the number at the bottom of the page right, and keeping it right.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function HowYouUseIt() {
  return (
    <div>
      <div className="max-w-2xl">
        <p className="eyebrow">How you use it</p>
        <h2 className="mt-4 text-balance font-display text-[clamp(1.75rem,3.4vw,2.75rem)] text-quill-100">
          Four steps, in order
        </h2>
        <p className="mt-5 text-pretty leading-relaxed text-quill-300">
          From an empty screen to a report you can hand to a reviewer. The whole
          loop takes about a minute the first time.
        </p>
      </div>

      <div className="mt-14 space-y-px overflow-hidden rounded-sheet border border-ink-700 bg-ink-700">
        <Step
          index={1}
          title="Create the document"
          body="Give it a title, a customer and an issue date, and pick the currency. Currency is fixed at creation — changing it later would reinterpret every stored amount, since 1000 fils is not 1000 cents."
          visual={<CreateVisual />}
        />
        <Step
          index={2}
          title="Add the line items"
          body="Quantity, unit price, an optional discount as either a percentage or a fixed amount, and an optional tax rate. Totals update as you type — but the browser never does the arithmetic. Each keystroke asks the server, which runs the same function the save path runs."
          visual={<LinesVisual />}
        />
        <Step
          index={3}
          title="Finalize it"
          body="Tessera checks the document is ready — at least one line, a customer, no impossible quantities — then recalculates once and freezes it. From here the API refuses every edit. Need to change something you already sent? Duplicate it into a fresh draft; the original stays exactly as your customer received it."
          visual={<FinalizeVisual />}
        />
        <Step
          index={4}
          title="Report on it"
          body="Pick a date range and read the totals: how many documents, and what they sum to. Both dates are inclusive, and currencies are never added together. Export the underlying rows as CSV when someone wants to check the figure themselves."
          visual={<ReportVisual />}
        />
      </div>
    </div>
  );
}

function Step({
  index,
  title,
  body,
  visual,
}: {
  index: number;
  title: string;
  body: string;
  visual: React.ReactNode;
}) {
  return (
    <div className="grid gap-8 bg-ink-900 p-7 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-14 lg:p-10">
      <div>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xs text-brass-500">
            {String(index).padStart(2, '0')}
          </span>
          <h3 className="font-display text-xl text-quill-100">{title}</h3>
        </div>
        <p className="mt-3 max-w-lg text-pretty text-sm leading-relaxed text-quill-500">
          {body}
        </p>
      </div>
      <div className="min-w-0">{visual}</div>
    </div>
  );
}

/* --- Mockups, built from the real tokens ---------------------------------- */

function CreateVisual() {
  return (
    <div className="sheet space-y-3.5 p-5">
      <MockField label="Title" value="Q3 platform renewal" />
      <div className="grid gap-3.5 sm:grid-cols-2">
        <MockField label="Customer" value="Acme Trading LLC" />
        <MockField label="Issue date" value="08 / 08 / 2026" />
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <MockField label="Currency" value="AED" mono />
        <div className="flex items-end">
          <span className="rounded-[2px] bg-ink-900 px-3 py-1.5 text-xs font-medium text-parchment-100">
            Create document
          </span>
        </div>
      </div>
    </div>
  );
}

function MockField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-[0.5625rem] uppercase tracking-[0.16em] text-ink-500">
        {label}
      </p>
      <p
        className={`mt-1 rounded-[2px] border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-[0.8125rem] text-ink-900 ${
          mono ? 'tabular' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function LinesVisual() {
  return (
    <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr]">
      <div className="sheet overflow-hidden">
        <div className="border-b border-parchment-300 px-4 py-2 font-mono text-[0.5625rem] uppercase tracking-[0.14em] text-ink-500">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3">
            <span>Description</span>
            <span>Disc.</span>
            <span className="text-right">Total</span>
          </div>
        </div>
        {[
          ['Widget A', '10%', '189.00'],
          ['Widget B', '—', '52.50'],
          ['Service fee', '$20', '180.00'],
        ].map(([name, discount, total]) => (
          <div
            key={name}
            className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-parchment-300/60 px-4 py-2 text-[0.8125rem] text-ink-800 last:border-0"
          >
            <span className="truncate">{name}</span>
            <span className="tabular text-ink-500">{discount}</span>
            <span className="tabular text-right font-medium">{total}</span>
          </div>
        ))}
      </div>

      <div className="rounded-sheet border border-ink-700 bg-ink-850 p-4">
        <p className="font-mono text-[0.5625rem] uppercase tracking-[0.16em] text-quill-700">
          Grand total
        </p>
        <p className="double-rule tabular mt-2 inline-block text-lg font-semibold text-brass-400">
          $421.50
        </p>
        <p className="mt-4 flex items-center gap-1.5 font-mono text-[0.5625rem] text-quill-700">
          <span className="size-1.5 rounded-full bg-verdigris-400" />
          computed server-side · 54ms
        </p>
      </div>
    </div>
  );
}

function FinalizeVisual() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 rounded-sheet border border-verdigris-700/60 bg-verdigris-500/[0.07] px-4 py-3">
        <FileLock2 className="size-4 shrink-0 text-verdigris-400" />
        <p className="text-xs leading-snug text-verdigris-300">
          Finalized 8 Aug 2026. This document is read-only — duplicate it to make
          changes.
        </p>
      </div>

      <div className="overflow-hidden rounded-sheet border border-ink-700 bg-ink-950">
        <div className="border-b border-ink-800 px-4 py-2 font-mono text-[0.5625rem] uppercase tracking-[0.14em] text-quill-700">
          What the API does next
        </div>
        <div className="space-y-1.5 px-4 py-3 font-mono text-[0.6875rem]">
          {[
            ['PATCH  /documents/:id', '409'],
            ['POST   /documents/:id/lines', '409'],
            ['DELETE /documents/:id', '409'],
            ['GET    /documents/:id', '200'],
          ].map(([call, status]) => (
            <div key={call} className="flex items-baseline justify-between gap-4">
              <span className="truncate text-quill-500">{call}</span>
              <span
                className={
                  status === '409' ? 'text-oxblood-300' : 'text-verdigris-300'
                }
              >
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportVisual() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[
        { currency: 'AED', total: '362,618.88', count: '6 documents' },
        { currency: 'USD', total: '442,996.50', count: '3 documents' },
      ].map((row) => (
        <div
          key={row.currency}
          className="rounded-sheet border border-ink-700 bg-ink-850 p-4"
        >
          <div className="flex items-baseline justify-between">
            <span className="font-display text-sm text-quill-100">
              {row.currency}
            </span>
            <span className="font-mono text-[0.5625rem] text-quill-700">
              {row.count}
            </span>
          </div>
          <p className="double-rule tabular mt-3 inline-block text-base font-semibold text-brass-400">
            {row.total}
          </p>
        </div>
      ))}
      <p className="font-mono text-[0.625rem] leading-relaxed text-quill-700 sm:col-span-2">
        Never summed together — adding AED to USD produces a number that means
        nothing.
      </p>
    </div>
  );
}
