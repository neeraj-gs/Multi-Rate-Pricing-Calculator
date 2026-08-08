import { calculateDocument } from '@/lib/pricing';
import { money } from '@/lib/utils';

/**
 * The brief's sample document, computed on the server by the production
 * engine at request time.
 *
 * Not a screenshot, not a table of hand-typed figures: this component imports
 * `calculateDocument` — the same function the API calls — and renders whatever
 * it returns. If the engine ever stopped producing 421.50, this page would say
 * so. A landing page that claims correctness should be willing to demonstrate
 * it live.
 *
 * Laid out as an actual quotation rather than a bare table: a document header,
 * a ruled body, and a totals block with the derivation printed beside it, so
 * the space to the left of the totals carries the arithmetic instead of sitting
 * empty.
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
    <div className="sheet mx-auto max-w-4xl overflow-hidden">
      {/* Document header */}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-parchment-300 px-7 py-5">
        <div>
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.2em] text-ink-500">
            Quotation
          </p>
          <h3 className="mt-1.5 font-display text-xl text-ink-900">
            Acme Trading LLC
          </h3>
          <p className="mt-0.5 text-xs text-ink-500">
            Office 1204, Boulevard Plaza Tower 1, Dubai
          </p>
        </div>

        <dl className="text-right">
          <div>
            <dt className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-500">
              Number
            </dt>
            <dd className="tabular text-sm text-ink-800">QT-0001</dd>
          </div>
          <div className="mt-2">
            <dt className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-500">
              Currency
            </dt>
            <dd className="tabular text-sm text-ink-800">USD · 2 dp</dd>
          </div>
        </dl>
      </header>

      {/* Lines */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-parchment-300 text-left font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-500">
              <th className="w-12 py-2.5 pl-7 pr-3 font-medium">#</th>
              <th className="py-2.5 font-medium">Description</th>
              <th className="w-14 px-2 py-2.5 text-right font-medium">Qty</th>
              <th className="w-24 px-2 py-2.5 text-right font-medium">Unit</th>
              <th className="w-32 px-2 py-2.5 text-right font-medium">Discount</th>
              <th className="w-28 px-2 py-2.5 text-right font-medium">Tax</th>
              <th className="w-28 py-2.5 pr-7 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr
                key={line.description}
                className="border-b border-parchment-300/60 text-ink-800"
              >
                <td className="py-2.5 pl-7 pr-3 font-mono text-[0.6875rem] text-ink-500">
                  {String(index + 1).padStart(2, '0')}
                </td>
                <td className="py-2.5">{line.description}</td>
                <td className="tabular px-2 py-2.5 text-right">{line.quantity}</td>
                <td className="tabular px-2 py-2.5 text-right">{line.unitPrice}</td>
                <td className="tabular px-2 py-2.5 text-right">
                  {line.discountType === null ? (
                    <span className="text-parchment-400">—</span>
                  ) : (
                    <>
                      <span className="text-ink-500">
                        {line.discountType === 'percent'
                          ? `${line.discountValue}%`
                          : `$${line.discountValue}`}
                      </span>{' '}
                      <span className="text-verdigris-700">
                        −{line.discountAmount}
                      </span>
                    </>
                  )}
                </td>
                <td className="tabular px-2 py-3 text-right">
                  {line.taxPercent === null ? (
                    <span className="text-parchment-400">—</span>
                  ) : (
                    <>
                      <span className="text-ink-500">{line.taxPercent}%</span>{' '}
                      <span className="text-ink-700">+{line.taxAmount}</span>
                    </>
                  )}
                </td>
                <td className="tabular py-3 pr-7 text-right font-medium text-ink-900">
                  {line.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals, with the derivation printed alongside rather than white space */}
      <div className="grid gap-8 px-7 py-6 sm:grid-cols-[1fr_auto]">
        <div className="self-end font-mono text-[0.6875rem] leading-relaxed text-ink-500">
          <p>
            <span className="text-ink-700">450.00 − 40.00 + 11.50 = 421.50</span>
          </p>
          <p className="mt-1">
            189.00 + 52.50 + 180.00 ={' '}
            <span className="text-ink-700">421.50</span>
          </p>
          <p className="mt-2 max-w-xs text-parchment-400">
            The same figure two ways — by construction, because document totals
            are sums of already-rounded lines.
          </p>
        </div>

        <dl className="w-full space-y-2 sm:w-64">
          <Row label="Subtotal" value={money(totals.subtotal, 'USD')} />
          <Row
            label="Total discount"
            value={`−${money(totals.totalDiscount, 'USD')}`}
          />
          <Row label="Total tax" value={`+${money(totals.totalTax, 'USD')}`} />
          <div className="flex items-baseline justify-between pt-3">
            <dt className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-ink-600">
              Grand total
            </dt>
            {/* The double rule: this figure is settled. */}
            <dd className="double-rule tabular text-lg font-semibold text-ink-900">
              {money(totals.grandTotal, 'USD')}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-500">
        {label}
      </dt>
      <dd className="tabular text-sm text-ink-800">{value}</dd>
    </div>
  );
}
