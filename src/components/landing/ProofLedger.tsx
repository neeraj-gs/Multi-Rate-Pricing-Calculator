import { calculateDocument } from '@/lib/pricing';
import { money } from '@/lib/utils';

/**
 * The brief's sample document, computed on the server by the production
 * engine at request time.
 *
 * Not a screenshot, not a table of hand-typed figures: this component imports
 * `calculateDocument` — the same function the API calls — and renders whatever
 * it returns. If the engine ever stopped producing 421.50, this page would say
 * so.
 *
 * Presented as an instrument readout rather than a facsimile of paper. In this
 * product a light surface means one specific thing — *this will be printed* —
 * and the actual printable page lives in the app, not on a marketing section.
 * What belongs here is the working: each step, in colour, with the derivation
 * beside the totals.
 */

const SAMPLE = [
  {
    description: 'Widget A',
    quantity: 2,
    unitPrice: '100.00',
    discount: { type: 'percent' as const, value: 10 },
    taxPercent: 5,
  },
  { description: 'Widget B', quantity: 1, unitPrice: '50.00', taxPercent: 5 },
  {
    description: 'Service fee',
    quantity: 1,
    unitPrice: '200.00',
    discount: { type: 'fixed' as const, value: '20.00' },
  },
];

export function ProofLedger() {
  const { lines, totals } = calculateDocument({ currency: 'USD', lines: SAMPLE });

  return (
    <div className="mx-auto max-w-4xl overflow-hidden rounded-sheet border border-ink-700 bg-ink-950 shadow-lift">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-800 bg-ink-900 px-6 py-3.5">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-brass-400">QT-0001</span>
          <span className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-quill-700">
            Acme Trading LLC
          </span>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[0.625rem] text-quill-700">
          <span aria-hidden className="size-1.5 rounded-full bg-verdigris-400" />
          computed server-side · USD · half-up to 2 dp
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-800 text-left font-mono text-[0.5625rem] uppercase tracking-[0.14em] text-quill-700">
              <th className="w-12 py-3 pl-6 pr-3 font-medium">#</th>
              <th className="py-3 font-medium">Description</th>
              <th className="w-14 px-2 py-3 text-right font-medium">Qty</th>
              <th className="w-24 px-2 py-3 text-right font-medium">Unit</th>
              <th className="w-32 px-2 py-3 text-right font-medium">Discount</th>
              <th className="w-28 px-2 py-3 text-right font-medium">Tax</th>
              <th className="w-28 py-3 pr-6 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.description} className="border-b border-ink-800/70">
                <td className="py-3 pl-6 pr-3 font-mono text-[0.6875rem] text-quill-700">
                  {String(index + 1).padStart(2, '0')}
                </td>
                <td className="py-3 text-quill-100">{line.description}</td>
                <td className="tabular px-2 py-3 text-right text-quill-300">
                  {line.quantity}
                </td>
                <td className="tabular px-2 py-3 text-right text-quill-300">
                  {line.unitPrice}
                </td>
                <td className="tabular px-2 py-3 text-right">
                  {line.discountType === null ? (
                    <span className="text-quill-700">—</span>
                  ) : (
                    <>
                      <span className="text-quill-700">
                        {line.discountType === 'percent'
                          ? `${line.discountValue}%`
                          : `$${line.discountValue}`}
                      </span>{' '}
                      <span className="text-verdigris-400">−{line.discountAmount}</span>
                    </>
                  )}
                </td>
                <td className="tabular px-2 py-3 text-right">
                  {line.taxPercent === null ? (
                    <span className="text-quill-700">—</span>
                  ) : (
                    <>
                      <span className="text-quill-700">{line.taxPercent}%</span>{' '}
                      <span className="text-steel-400">+{line.taxAmount}</span>
                    </>
                  )}
                </td>
                <td className="tabular py-3 pr-6 text-right font-medium text-quill-100">
                  {line.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals, with the derivation printed alongside rather than white space */}
      <div className="grid gap-8 bg-ink-900/60 px-6 py-6 sm:grid-cols-[1fr_auto]">
        <div className="self-end font-mono text-[0.6875rem] leading-relaxed text-quill-700">
          <p className="text-quill-300">450.00 − 40.00 + 11.50 = 421.50</p>
          <p className="mt-1 text-quill-300">189.00 + 52.50 + 180.00 = 421.50</p>
          <p className="mt-2 max-w-xs">
            The same figure two ways — by construction, because document totals
            are sums of already-rounded lines.
          </p>
        </div>

        <dl className="w-full space-y-2 sm:w-64">
          <Row label="Subtotal" value={money(totals.subtotal, 'USD')} />
          <Row
            label="Total discount"
            value={`−${money(totals.totalDiscount, 'USD')}`}
            tone="verdigris"
          />
          <Row
            label="Total tax"
            value={`+${money(totals.totalTax, 'USD')}`}
            tone="steel"
          />
          <div className="flex items-baseline justify-between pt-3">
            <dt className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-quill-500">
              Grand total
            </dt>
            {/* The double rule: this figure is settled. */}
            <dd className="double-rule tabular text-lg font-semibold text-brass-400">
              {money(totals.grandTotal, 'USD')}
            </dd>
          </div>
        </dl>
      </div>
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
    <div className="flex items-baseline justify-between gap-6">
      <dt className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-quill-700">
        {label}
      </dt>
      <dd
        className={`tabular text-sm ${
          tone === 'verdigris'
            ? 'text-verdigris-300'
            : tone === 'steel'
              ? 'text-steel-300'
              : 'text-quill-300'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
