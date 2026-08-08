import { formatDate, money } from '@/lib/utils';
import type { ApiDocument } from '@/lib/documents/types';

/**
 * The document as a customer sees it.
 *
 * Used by the public share link and by the browser's print dialog. On paper the
 * parchment becomes white and the ink chrome disappears entirely — see the
 * `@media print` block in `globals.css`.
 *
 * Every figure comes from the stored record. Nothing here recomputes anything,
 * so what the customer receives is exactly what was finalized.
 */
export function PrintableDocument({
  document,
  issuer,
}: {
  document: ApiDocument;
  issuer?: { name: string; company: string };
}) {
  const currency = document.currency;

  return (
    <article className="sheet mx-auto max-w-3xl p-10 sm:p-14">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-parchment-300 pb-8">
        <div>
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-ink-500">
            {document.status === 'finalized' ? 'Quotation' : 'Draft quotation'}
          </p>
          <h1 className="mt-2 font-display text-3xl text-ink-900">{document.title}</h1>
          <p className="mt-1 font-mono text-sm text-ink-600">{document.number}</p>
        </div>

        <dl className="text-right text-sm">
          {issuer?.company ? (
            <div className="mb-3">
              <dd className="font-display text-lg text-ink-900">{issuer.company}</dd>
              {issuer.name ? <dd className="text-ink-500">{issuer.name}</dd> : null}
            </div>
          ) : null}
          <div>
            <dt className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-500">
              Issued
            </dt>
            <dd className="tabular text-ink-800">{formatDate(document.issueDate)}</dd>
          </div>
          {document.dueDate ? (
            <div className="mt-2">
              <dt className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-500">
                Due
              </dt>
              <dd className="tabular text-ink-800">{formatDate(document.dueDate)}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      <section className="py-8">
        <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-500">
          Billed to
        </p>
        <p className="mt-2 font-display text-xl text-ink-900">
          {document.customer.name}
        </p>
        {document.customer.email ? (
          <p className="text-sm text-ink-600">{document.customer.email}</p>
        ) : null}
        {document.customer.address ? (
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-600">
            {document.customer.address}
          </p>
        ) : null}
      </section>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] border-collapse text-sm">
          <thead>
            <tr className="border-y border-parchment-300 text-left font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-500">
              <th className="py-3 pr-3 font-medium">Description</th>
              <th className="w-16 px-2 py-3 text-right font-medium">Qty</th>
              <th className="w-24 px-2 py-3 text-right font-medium">Unit</th>
              <th className="w-24 px-2 py-3 text-right font-medium">Discount</th>
              <th className="w-20 px-2 py-3 text-right font-medium">Tax</th>
              <th className="w-28 py-3 pl-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {document.lines.map((line, index) => (
              <tr key={line.id} className="border-b border-parchment-300/60 text-ink-800">
                <td className="py-3 pr-3">
                  <span className="mr-3 font-mono text-xs text-ink-500">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {line.description}
                </td>
                <td className="tabular px-2 py-3 text-right">{line.quantity}</td>
                <td className="tabular px-2 py-3 text-right">{line.unitPrice}</td>
                <td className="tabular px-2 py-3 text-right">
                  {line.discount ? `−${line.discountAmount}` : '—'}
                </td>
                <td className="tabular px-2 py-3 text-right">
                  {line.taxPercent ? `${line.taxPercent}%` : '—'}
                </td>
                <td className="tabular py-3 pl-2 text-right font-medium">{line.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex justify-end">
        <dl className="w-full max-w-xs space-y-2.5 text-sm">
          <TotalRow label="Subtotal" value={money(document.totals.subtotal, currency)} />
          <TotalRow
            label="Total discount"
            value={`−${money(document.totals.totalDiscount, currency)}`}
          />
          <TotalRow
            label="Total tax"
            value={`+${money(document.totals.totalTax, currency)}`}
          />
          <div className="flex items-baseline justify-between pt-3">
            <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-700">
              Grand total
            </dt>
            {/* The accountant's mark. */}
            <dd className="double-rule tabular text-xl font-semibold text-ink-900">
              {money(document.totals.grandTotal, currency)}
            </dd>
          </div>
        </dl>
      </div>

      {document.notes ? (
        <section className="mt-10 border-t border-parchment-300 pt-6">
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-500">
            Notes
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
            {document.notes}
          </p>
        </section>
      ) : null}

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-parchment-300 pt-5 font-mono text-[0.625rem] text-ink-500">
        <span>
          {document.status === 'finalized'
            ? `Finalized ${formatDate(document.finalizedAt)} · figures are final`
            : 'Draft — figures may still change'}
        </span>
        <span>All amounts in {currency}</span>
      </footer>
    </article>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-500">
        {label}
      </dt>
      <dd className="tabular text-ink-800">{value}</dd>
    </div>
  );
}
