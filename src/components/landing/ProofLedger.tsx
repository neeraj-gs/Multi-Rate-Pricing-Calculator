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
    <div className="sheet overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-parchment-300 px-6 py-4">
        <div>
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ink-500">
            Quotation QT-0001
          </p>
          <h3 className="mt-1 font-display text-xl text-ink-900">Acme Trading LLC</h3>
        </div>
        <p className="font-mono text-xs text-ink-500">
          Computed server-side · USD · half-up to 2 dp
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-parchment-300 text-left font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-ink-500">
              <th className="px-6 py-3 font-medium">Description</th>
              <th className="px-3 py-3 text-right font-medium">Qty</th>
              <th className="px-3 py-3 text-right font-medium">Unit</th>
              <th className="px-3 py-3 text-right font-medium">Discount</th>
              <th className="px-3 py-3 text-right font-medium">Tax</th>
              <th className="px-6 py-3 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr
                key={line.description}
                className="border-b border-parchment-300/60 text-ink-800"
              >
                <td className="px-6 py-3">
                  <span className="mr-3 font-mono text-xs text-ink-500">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {line.description}
                </td>
                <td className="tabular px-3 py-3 text-right">{line.quantity}</td>
                <td className="tabular px-3 py-3 text-right">{line.unitPrice}</td>
                <td className="tabular px-3 py-3 text-right">
                  {line.discountType === null ? (
                    <span className="text-ink-500">—</span>
                  ) : (
                    <span>
                      {line.discountType === 'percent'
                        ? `${line.discountValue}%`
                        : `$${line.discountValue}`}
                      <span className="ml-2 text-ink-500">−{line.discountAmount}</span>
                    </span>
                  )}
                </td>
                <td className="tabular px-3 py-3 text-right">
                  {line.taxPercent === null ? (
                    <span className="text-ink-500">—</span>
                  ) : (
                    <span>
                      {line.taxPercent}%
                      <span className="ml-2 text-ink-500">+{line.taxAmount}</span>
                    </span>
                  )}
                </td>
                <td className="tabular px-6 py-3 text-right font-medium">
                  {line.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end px-6 py-5">
        <dl className="w-full max-w-xs space-y-2 text-sm">
          <Row label="Subtotal" value={money(totals.subtotal, 'USD')} />
          <Row label="Total discount" value={`−${money(totals.totalDiscount, 'USD')}`} />
          <Row label="Total tax" value={`+${money(totals.totalTax, 'USD')}`} />
          <div className="flex items-baseline justify-between pt-3">
            <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-600">
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
    <div className="flex items-baseline justify-between">
      <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-500">
        {label}
      </dt>
      <dd className="tabular text-ink-800">{value}</dd>
    </div>
  );
}
