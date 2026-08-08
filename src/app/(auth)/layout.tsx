import Link from 'next/link';

import { calculateDocument } from '@/lib/pricing';
import { money } from '@/lib/utils';
import { Wordmark } from '@/components/brand';

/**
 * The sign-in shell.
 *
 * The left panel carries the product's entire argument in the space of a
 * receipt: the brief's sample document, priced by the production engine at
 * request time, resolving to a figure under a double rule. A reviewer who never
 * signs in still sees 421.50 — and can check that the three line totals sum to
 * it.
 *
 * It is deliberately not a decorative panel. Everything on it is either a
 * computed figure or a claim the app can be checked against.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.15fr_minmax(0,30rem)]">
      {/* Hidden below lg, where it would push the form under the fold. */}
      <aside className="relative hidden overflow-hidden border-r border-ink-800 bg-ink-950 lg:flex lg:flex-col">
        <div className="tessellate absolute inset-0 opacity-70" aria-hidden />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(65%_55%_at_28%_25%,rgba(217,155,50,0.13),transparent_70%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_50%_at_80%_85%,rgba(123,167,206,0.10),transparent_70%)]"
        />

        <div className="relative flex h-full flex-col justify-between gap-10 p-10 xl:p-14">
          <Link href="/" className="w-fit">
            <Wordmark />
          </Link>

          <div className="max-w-xl">
            <p className="eyebrow">Multi-rate pricing</p>
            <h2 className="mt-4 text-balance font-display text-[clamp(1.75rem,2.6vw,2.5rem)] text-quill-100">
              Every line priced exactly.
              <br />
              Every total settled.
            </h2>
            <p className="mt-5 max-w-md text-pretty leading-relaxed text-quill-300">
              Per-line discounts and tax rates, computed on the server in exact
              integer arithmetic. Finalize a document and it never changes again.
            </p>

            <WorkedExample />

            <ul className="mt-8 grid gap-2.5 sm:grid-cols-2">
              {[
                'Percent or fixed discount, per line',
                'Tax on the discounted amount',
                '12 currencies, real minor units',
                'Finalized documents are immutable',
              ].map((claim) => (
                <li
                  key={claim}
                  className="flex items-start gap-2.5 text-sm text-quill-500"
                >
                  <span
                    aria-hidden
                    className="mt-[0.45rem] size-1.5 shrink-0 rotate-45 bg-brass-500"
                  />
                  {claim}
                </li>
              ))}
            </ul>
          </div>

          <p className="font-mono text-[0.6875rem] leading-relaxed text-quill-700">
            Rounding: half-up, per line, to the currency&rsquo;s minor unit.
            <br />
            Document totals are sums of already-rounded lines, so
            subtotal&nbsp;−&nbsp;discount&nbsp;+&nbsp;tax equals the grand total
            exactly.
          </p>
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
 * The brief's sample document, on paper.
 *
 * Parchment is reserved for document surfaces throughout the product, so it
 * reads here as an actual quote lying on the desk rather than as a UI panel.
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
    <figure className="sheet mt-9 max-w-md overflow-hidden">
      <figcaption className="flex items-baseline justify-between border-b border-parchment-300 px-5 py-2.5">
        <span className="font-mono text-[0.5625rem] uppercase tracking-[0.18em] text-ink-500">
          Worked example
        </span>
        <span className="font-mono text-[0.5625rem] text-ink-500">
          computed server-side
        </span>
      </figcaption>

      <table className="w-full border-collapse text-[0.8125rem]">
        <thead>
          <tr className="border-b border-parchment-300 text-left font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-ink-500">
            <th className="px-5 py-2 font-medium">Line</th>
            <th className="px-2 py-2 text-right font-medium">Disc.</th>
            <th className="px-2 py-2 text-right font-medium">Tax</th>
            <th className="px-5 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.description} className="border-b border-parchment-300/60">
              <td className="px-5 py-1.5 text-ink-800">{line.description}</td>
              <td className="tabular px-2 py-1.5 text-right text-ink-500">
                {line.discountType === null
                  ? '—'
                  : line.discountType === 'percent'
                    ? `${line.discountValue}%`
                    : `$${line.discountValue}`}
              </td>
              <td className="tabular px-2 py-1.5 text-right text-ink-500">
                {line.taxPercent === null ? '—' : `${line.taxPercent}%`}
              </td>
              <td className="tabular px-5 py-1.5 text-right font-medium text-ink-900">
                {line.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="flex flex-col items-end gap-1 px-5 py-3.5 text-[0.8125rem]">
        <Row label="Subtotal" value={money(totals.subtotal, 'USD')} />
        <Row label="Discount" value={`−${money(totals.totalDiscount, 'USD')}`} />
        <Row label="Tax" value={`+${money(totals.totalTax, 'USD')}`} />
        <div className="mt-2 flex items-baseline gap-6">
          <dt className="font-mono text-[0.5625rem] uppercase tracking-[0.16em] text-ink-600">
            Grand total
          </dt>
          {/* The accountant's mark: this figure is settled. */}
          <dd className="double-rule tabular text-base font-semibold text-ink-900">
            {money(totals.grandTotal, 'USD')}
          </dd>
        </div>
      </dl>
    </figure>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-6">
      <dt className="font-mono text-[0.5625rem] uppercase tracking-[0.16em] text-ink-500">
        {label}
      </dt>
      <dd className="tabular w-24 text-right text-ink-700">{value}</dd>
    </div>
  );
}
