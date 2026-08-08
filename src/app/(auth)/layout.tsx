import Link from 'next/link';

import { calculateDocument } from '@/lib/pricing';
import { money } from '@/lib/utils';
import { Mark } from '@/components/brand';

/**
 * The sign-in shell.
 *
 * The right panel shows the product's whole argument in the space of a receipt:
 * three lines with different discount and tax treatments, resolving to a figure
 * under a double rule. Computed at request time by the real engine, so even
 * this decoration is load-bearing.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,32rem)]">
      {/* Narrative panel — hidden on small screens, where it would push the
          form below the fold for no benefit. */}
      <aside className="relative hidden overflow-hidden border-r border-ink-800 bg-ink-850 lg:block">
        <div className="ink-grid absolute inset-0 opacity-60" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_30%_30%,rgba(205,163,73,0.14),transparent_70%)]" />

        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-sheet border border-brass-700 bg-brass-500/10 p-1 text-brass-400">
              <Mark />
            </span>
            <span className="font-display text-lg text-quill-100">
              Tessera
            </span>
          </Link>

          <div className="max-w-md">
            <h2 className="text-balance font-display text-4xl leading-tight text-quill-100">
              Every line adds up. Twice underlined.
            </h2>
            <p className="mt-5 text-pretty leading-relaxed text-quill-500">
              Per-line discounts and tax, computed on the server in exact integer
              arithmetic. Finalize a document and it never changes again.
            </p>
            <MiniLedger />
          </div>

          <p className="font-mono text-xs text-quill-700">
            Rounding: half-up, per line, to the currency’s minor unit.
          </p>
        </div>
      </aside>

      <main
        id="main"
        className="flex items-center justify-center bg-ink-900 px-6 py-16"
      >
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}

function MiniLedger() {
  const { lines, totals } = calculateDocument({
    currency: 'USD',
    lines: [
      {
        description: 'Widget A',
        quantity: 2,
        unitPrice: '100.00',
        discount: { type: 'percent', value: 10 },
        taxPercent: 5,
      },
      { description: 'Widget B', quantity: 1, unitPrice: '50.00', taxPercent: 5 },
      {
        description: 'Service fee',
        quantity: 1,
        unitPrice: '200.00',
        discount: { type: 'fixed', value: '20.00' },
      },
    ],
  });

  return (
    <dl className="mt-10 space-y-2.5 rounded-sheet border border-ink-700 bg-ink-900/70 p-5">
      {lines.map((line) => (
        <div key={line.description} className="flex items-baseline justify-between gap-4">
          <dt className="truncate text-sm text-quill-500">{line.description}</dt>
          <dd className="tabular text-sm text-quill-300">{money(line.total, 'USD')}</dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 pt-3">
        <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-quill-500">
          Grand total
        </dt>
        <dd className="double-rule tabular font-semibold text-brass-400">
          {money(totals.grandTotal, 'USD')}
        </dd>
      </div>
    </dl>
  );
}
