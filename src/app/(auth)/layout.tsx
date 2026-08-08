import Link from 'next/link';

import { calculateDocument } from '@/lib/pricing';
import { Wordmark } from '@/components/brand';
import { SceneMount } from '@/components/landing/SceneMount';

/**
 * The sign-in shell.
 *
 * The left panel runs the brief's sample document through the production
 * engine at request time and prints the result as a technical readout — so a
 * reviewer who never signs in still sees 421.50, and can check the three line
 * totals sum to it.
 *
 * It is deliberately dark and instrument-like rather than a facsimile of paper.
 * In this product a light surface means exactly one thing — *this is a page
 * that will be printed* — and there is no page here, only figures about one.
 * The tessellation behind it is the same geometry as the landing hero.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_minmax(0,29rem)]">
      {/* Hidden below lg, where it would push the form under the fold. */}
      <aside className="relative hidden overflow-hidden border-r border-ink-800 bg-ink-950 lg:flex lg:flex-col">
        <div className="absolute inset-0">
          <SceneMount />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-ink-950/95 via-ink-950/75 to-ink-950/40"
        />

        <div className="relative flex h-full flex-col justify-between gap-8 p-10 xl:p-12">
          <Link href="/" className="w-fit">
            <Wordmark />
          </Link>

          <div className="max-w-lg">
            <p className="eyebrow">Multi-rate pricing</p>
            <h2 className="mt-4 text-balance font-display text-[clamp(1.75rem,2.5vw,2.375rem)] text-quill-100">
              Every line priced exactly.
              <br />
              Every total settled.
            </h2>
            <p className="mt-5 max-w-md text-pretty leading-relaxed text-quill-300">
              Per-line discounts and tax rates, computed on the server in exact
              integer arithmetic. Finalize a document and it never changes again.
            </p>

            <WorkedExample />
          </div>

          <dl className="grid max-w-lg grid-cols-2 gap-x-8 gap-y-4">
            {[
              ['Discount', 'Percent or fixed, per line — never both'],
              ['Tax', 'Charged on the discounted amount'],
              ['Currencies', '12, each at its real minor unit'],
              ['Once issued', 'Read-only permanently'],
            ].map(([term, detail]) => (
              <div key={term} className="border-t border-ink-700 pt-3">
                <dt className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-brass-400">
                  {term}
                </dt>
                <dd className="mt-1.5 text-sm leading-snug text-quill-500">{detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>

      <main
        id="main"
        className="flex items-center justify-center bg-ink-900 px-6 py-14"
      >
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}

/**
 * The sample document as a readout, not a facsimile.
 *
 * Every figure comes from `calculateDocument`, so this is a live assertion
 * rather than a picture of one.
 */
function WorkedExample() {
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
    <figure className="mt-8 max-w-md overflow-hidden rounded-sheet border border-ink-700 bg-ink-900/80 backdrop-blur-sm">
      <figcaption className="flex items-baseline justify-between border-b border-ink-800 px-4 py-2.5">
        <span className="font-mono text-[0.5625rem] uppercase tracking-[0.18em] text-quill-700">
          Worked example
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[0.5625rem] text-quill-700">
          <span aria-hidden className="size-1.5 rounded-full bg-verdigris-400" />
          computed server-side
        </span>
      </figcaption>

      <table className="w-full border-collapse text-[0.8125rem]">
        <thead>
          <tr className="border-b border-ink-800 text-left font-mono text-[0.5rem] uppercase tracking-[0.14em] text-quill-700">
            <th className="px-4 py-2 font-medium">Line</th>
            <th className="px-2 py-2 text-right font-medium">Disc.</th>
            <th className="px-2 py-2 text-right font-medium">Tax</th>
            <th className="px-4 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.description} className="border-b border-ink-800/70">
              <td className="px-4 py-2 text-quill-300">{line.description}</td>
              <td className="tabular px-2 py-2 text-right text-verdigris-400">
                {line.discountType === null
                  ? '—'
                  : line.discountType === 'percent'
                    ? `${line.discountValue}%`
                    : `$${line.discountValue}`}
              </td>
              <td className="tabular px-2 py-2 text-right text-steel-400">
                {line.taxPercent === null ? '—' : `${line.taxPercent}%`}
              </td>
              <td className="tabular px-4 py-2 text-right font-medium text-quill-100">
                {line.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-end justify-between gap-4 px-4 py-3.5">
        <dl className="flex gap-5">
          {[
            ['Subtotal', totals.subtotal],
            ['Discount', `−${totals.totalDiscount}`],
            ['Tax', `+${totals.totalTax}`],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-quill-700">
                {label}
              </dt>
              <dd className="tabular mt-0.5 text-[0.75rem] text-quill-300">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="text-right">
          <p className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-quill-500">
            Grand total
          </p>
          {/* The accountant's mark: this figure is settled. */}
          <p className="double-rule tabular mt-1 inline-block text-base font-semibold text-brass-400">
            ${totals.grandTotal}
          </p>
        </div>
      </div>
    </figure>
  );
}
