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
          LedgerLine works out what each line comes to and what the document comes
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
          body="LedgerLine checks the document is ready — at least one line, a customer, no impossible quantities — then recalculates once and freezes it. From here the API refuses every edit. Need to change something you already sent? Duplicate it into a fresh draft; the original stays exactly as your customer received it."
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

/**
 * A window frame, so each mockup reads as a screen of the product rather than
 * as a floating fragment of UI.
 */
function Frame({
  chrome,
  children,
  padded = true,
}: {
  chrome: React.ReactNode;
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-sheet border border-ink-700 bg-ink-950 shadow-lift">
      <div className="flex items-center gap-3 border-b border-ink-800 bg-ink-900 px-4 py-2.5">
        {chrome}
      </div>
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </div>
  );
}

function DocChrome({ status }: { status: 'draft' | 'finalized' }) {
  return (
    <>
      <span className="font-mono text-[0.6875rem] text-brass-500">QT-0042</span>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.12em] ${
          status === 'finalized'
            ? 'border-verdigris-700 bg-verdigris-500/12 text-verdigris-300'
            : 'border-ink-600 bg-ink-800 text-quill-500'
        }`}
      >
        <span
          aria-hidden
          className={`size-1 rounded-full ${
            status === 'finalized' ? 'bg-verdigris-400' : 'bg-quill-700'
          }`}
        />
        {status}
      </span>
    </>
  );
}

function CreateVisual() {
  return (
    <Frame
      chrome={
        <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-quill-700">
          New document
        </span>
      }
    >
      <div className="space-y-4">
        <MockField label="Title" value="Q3 platform renewal" />
        <div className="grid gap-4 sm:grid-cols-2">
          <MockField label="Customer" value="Acme Trading LLC" />
          <MockField label="Issue date" value="08 / 08 / 2026" mono />
        </div>
        <div className="grid items-end gap-4 sm:grid-cols-2">
          <MockField label="Currency" value="AED" mono hint="fixed at creation" />
          <span className="rounded-sheet bg-brass-500 px-3 py-2 text-center text-[0.8125rem] font-semibold text-ink-950">
            Create document
          </span>
        </div>
      </div>
    </Frame>
  );
}

function MockField({
  label,
  value,
  mono,
  hint,
}: {
  label: string;
  value: string;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[0.5625rem] uppercase tracking-[0.16em] text-quill-700">
          {label}
        </p>
        {hint ? (
          <p className="font-mono text-[0.5625rem] text-quill-700">{hint}</p>
        ) : null}
      </div>
      <p
        className={`mt-1.5 rounded-sheet border border-ink-600 bg-ink-900 px-2.5 py-2 text-[0.8125rem] text-quill-100 ${
          mono ? 'tabular' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function LinesVisual() {
  const rows = [
    ['Widget A', '2', '100.00', '10%', '5%', '189.00'],
    ['Widget B', '1', '50.00', '—', '5%', '52.50'],
    ['Service fee', '1', '200.00', '$20', '—', '180.00'],
  ];

  return (
    <Frame chrome={<DocChrome status="draft" />} padded={false}>
      {/*
        Stacked, not side by side. A six-column table and a totals panel do not
        both fit in the ~490px this mockup gets: as columns, whichever one lost
        the negotiation clipped its own figures. Stacking is also what the real
        editor does at this width.
      */}
      <div className="bg-ink-950">
        <div className="p-4 pb-0">
          <div className="overflow-hidden rounded-sheet border border-ink-700 bg-ink-900">
            <div className="grid grid-cols-[minmax(0,1fr)_1.75rem_3rem_2.25rem_1.75rem_3.25rem] gap-2 border-b border-ink-800 px-3 py-2 font-mono text-[0.5rem] uppercase tracking-[0.1em] text-quill-700">
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Unit</span>
              <span className="text-right">Disc</span>
              <span className="text-right">Tax</span>
              <span className="text-right">Total</span>
            </div>
            {rows.map(([name, qty, unit, disc, tax, total]) => (
              <div
                key={name}
                className="grid grid-cols-[minmax(0,1fr)_1.75rem_3rem_2.25rem_1.75rem_3.25rem] gap-2 border-b border-ink-800/70 px-3 py-2 text-[0.75rem] text-quill-100 last:border-0"
              >
                <span className="truncate">{name}</span>
                <span className="tabular text-right text-quill-300">{qty}</span>
                <span className="tabular text-right text-quill-300">{unit}</span>
                <span className="tabular text-right text-verdigris-400">{disc}</span>
                <span className="tabular text-right text-steel-400">{tax}</span>
                <span className="tabular text-right font-medium">{total}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 p-4">
          <p className="flex items-center gap-1.5 font-mono text-[0.5625rem] text-quill-700">
            <span aria-hidden className="size-1.5 rounded-full bg-verdigris-400" />
            computed server-side · 54ms
          </p>

          <dl className="flex flex-wrap items-end gap-x-6 gap-y-2">
            {[
              ['Subtotal', '$450.00'],
              ['Discount', '−$40.00'],
              ['Tax', '+$11.50'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="whitespace-nowrap font-mono text-[0.5rem] uppercase tracking-[0.14em] text-quill-700">
                  {label}
                </dt>
                <dd className="tabular mt-0.5 whitespace-nowrap text-[0.75rem] text-quill-300">
                  {value}
                </dd>
              </div>
            ))}
            <div>
              <dt className="whitespace-nowrap font-mono text-[0.5rem] uppercase tracking-[0.14em] text-quill-500">
                Grand total
              </dt>
              <dd className="double-rule tabular mt-0.5 inline-block whitespace-nowrap text-base font-semibold text-brass-400">
                $421.50
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </Frame>
  );
}

function FinalizeVisual() {
  return (
    <Frame chrome={<DocChrome status="finalized" />}>
      <div className="mb-4 flex items-center gap-2.5 rounded-sheet border border-verdigris-700/60 bg-verdigris-500/[0.07] px-3.5 py-2.5">
        <FileLock2 className="size-3.5 shrink-0 text-verdigris-400" />
        <p className="text-xs leading-snug text-verdigris-300">
          Finalized 8 Aug 2026 — read-only. Duplicate it to make changes.
        </p>
      </div>

      <p className="mb-2 font-mono text-[0.5625rem] uppercase tracking-[0.14em] text-quill-700">
        What the API does from here
      </p>
      <div className="space-y-1 font-mono text-[0.6875rem]">
        {[
          ['PATCH', '/documents/:id', '409'],
          ['POST', '/documents/:id/lines', '409'],
          ['DELETE', '/documents/:id', '409'],
          ['POST', '/documents/:id/duplicate', '201'],
          ['GET', '/documents/:id', '200'],
        ].map(([method, path, status]) => {
          const refused = status === '409';
          return (
            <div key={path + method} className="flex items-baseline gap-3">
              <span className="w-14 shrink-0 text-quill-700">{method}</span>
              <span className="min-w-0 flex-1 truncate text-quill-500">{path}</span>
              <span className={refused ? 'text-oxblood-300' : 'text-verdigris-300'}>
                {status}
              </span>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

function ReportVisual() {
  return (
    <Frame
      chrome={
        <>
          <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-quill-700">
            Summary
          </span>
          <span className="tabular ml-auto text-[0.6875rem] text-quill-500">
            1 Mar – 31 Aug 2026
          </span>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-px overflow-hidden rounded-sheet border border-ink-700 bg-ink-700">
        {[
          ['Documents', '10'],
          ['Finalized', '9'],
          ['Line items', '32'],
        ].map(([label, value]) => (
          <div key={label} className="bg-ink-900 px-3 py-2.5">
            <p className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-quill-700">
              {label}
            </p>
            <p className="tabular mt-1 text-sm text-quill-100">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { currency: 'AED', total: '362,618.88', tax: '16,941.38', count: 6 },
          { currency: 'USD', total: '442,996.50', tax: '21,086.50', count: 3 },
        ].map((row) => (
          <div
            key={row.currency}
            className="rounded-sheet border border-ink-700 bg-ink-900 p-3.5"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-display text-sm text-quill-100">
                {row.currency}
              </span>
              <span className="font-mono text-[0.5625rem] text-quill-700">
                {row.count} documents
              </span>
            </div>
            <p className="double-rule tabular mt-3 inline-block text-base font-semibold text-brass-400">
              {row.total}
            </p>
            <p className="tabular mt-3 text-[0.6875rem] text-quill-700">
              of which tax {row.tax}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-3 font-mono text-[0.625rem] leading-relaxed text-quill-700">
        Never summed together — adding AED to USD produces a number that means
        nothing.
      </p>
    </Frame>
  );
}
