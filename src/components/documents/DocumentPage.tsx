import { currencySymbol, formatDate } from '@/lib/utils';
import type { ApiDocument } from '@/lib/documents/types';

/**
 * The document itself — one presentational page, rendered identically by
 * three callers:
 *
 *   1. the editor's live preview, from unsaved draft state,
 *   2. the public share link, from the stored record,
 *   3. the PDF route, from the stored record.
 *
 * Same component, same markup, so what you watch while typing is what the
 * customer receives and what the PDF contains. This is the same rule the
 * pricing engine follows — one implementation, no second version to drift.
 *
 * ## Why this one surface is light
 *
 * White here does not mean "light UI". It means *this is a page that will be
 * printed*. The application around it is dark; the only thing that ever turns
 * to paper is a document, and it looks like paper so the distinction needs no
 * explanation. Everything else in the product — forms, tables, panels — is
 * dark, so a page reads as a page.
 */

export interface DocumentPageLine {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  /** `"10%"` or `"$20.00"`, already formatted. */
  discountLabel: string | null;
  discountAmount: string;
  taxPercent: string | null;
  taxAmount: string;
  total: string;
}

export interface DocumentPageProps {
  number: string;
  status: 'draft' | 'finalized';
  title: string;
  customer: { name: string; email: string; address: string };
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  notes: string;
  lines: DocumentPageLine[];
  totals: {
    subtotal: string;
    totalDiscount: string;
    totalTax: string;
    grandTotal: string;
  } | null;
  finalizedAt?: string | null;
  issuer?: { name: string; company: string };
}

export function DocumentPage({
  number,
  status,
  title,
  customer,
  issueDate,
  dueDate,
  currency,
  notes,
  lines,
  totals,
  finalizedAt,
  issuer,
}: DocumentPageProps) {
  return (
    <article className="document-page flex min-h-full flex-col bg-white px-10 py-12 text-[#12161f] sm:px-14 sm:py-16">
      {/* Masthead */}
      {/* `items-start` with a shrink-proof meta column, not `flex-wrap`: a long
          title used to push the document number onto its own line under it. */}
      <header className="flex items-start justify-between gap-8 border-b-2 border-[#12161f] pb-6">
        <div className="min-w-0">
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.28em] text-[#6b7280]">
            {issuer?.company || 'LedgerLine'}
          </p>
          <h1 className="mt-3 text-balance font-display text-[1.75rem] leading-tight text-[#12161f]">
            {title || 'Untitled document'}
          </h1>
        </div>

        <div className="shrink-0 text-right">
          <p className="whitespace-nowrap font-display text-[0.9375rem] uppercase tracking-[0.18em] text-[#12161f]">
            {status === 'finalized' ? 'Quotation' : 'Draft quotation'}
          </p>
          <p className="tabular mt-1 text-sm text-[#4b5563]">{number}</p>
        </div>
      </header>

      {/* Parties and dates */}
      <section className="grid gap-8 border-b border-[#d8dbe0] py-7 sm:grid-cols-[1.6fr_1fr]">
        <div>
          <p className="font-mono text-[0.5625rem] uppercase tracking-[0.2em] text-[#6b7280]">
            Billed to
          </p>
          <p className="mt-2 font-display text-base text-[#12161f]">
            {customer.name || '—'}
          </p>
          {customer.email ? (
            <p className="text-sm text-[#4b5563]">{customer.email}</p>
          ) : null}
          {customer.address ? (
            <p className="mt-1 max-w-xs text-sm leading-relaxed text-[#4b5563]">
              {customer.address}
            </p>
          ) : null}
        </div>

        <dl className="space-y-3 text-right">
          <div>
            <dt className="font-mono text-[0.5625rem] uppercase tracking-[0.2em] text-[#6b7280]">
              Issued
            </dt>
            <dd className="tabular text-sm text-[#12161f]">{formatDate(issueDate)}</dd>
          </div>
          <div>
            <dt className="font-mono text-[0.5625rem] uppercase tracking-[0.2em] text-[#6b7280]">
              Due
            </dt>
            <dd className="tabular text-sm text-[#12161f]">
              {dueDate ? formatDate(dueDate) : '—'}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[0.5625rem] uppercase tracking-[0.2em] text-[#6b7280]">
              Currency
            </dt>
            <dd className="tabular text-sm text-[#12161f]">{currency}</dd>
          </div>
        </dl>
      </section>

      {/* Line items */}
      <section className="py-7">
        {lines.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#9ca3af]">
            No line items yet. They will appear here as you add them.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#12161f] text-left font-mono text-[0.5625rem] uppercase tracking-[0.16em] text-[#6b7280]">
                  <th className="w-8 pb-2.5 pr-3 font-medium">#</th>
                  <th className="pb-2.5 font-medium">Description</th>
                  <th className="w-14 px-2 pb-2.5 text-right font-medium">Qty</th>
                  <th className="w-24 px-2 pb-2.5 text-right font-medium">Unit</th>
                  <th className="w-24 px-2 pb-2.5 text-right font-medium">Discount</th>
                  <th className="w-20 px-2 pb-2.5 text-right font-medium">Tax</th>
                  <th className="w-28 pb-2.5 pl-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={line.id} className="border-b border-[#e5e7eb]">
                    <td className="py-3 pr-3 font-mono text-[0.6875rem] text-[#9ca3af]">
                      {String(index + 1).padStart(2, '0')}
                    </td>
                    <td className="py-3 text-[#12161f]">
                      {line.description || (
                        <span className="text-[#9ca3af]">Untitled line</span>
                      )}
                    </td>
                    <td className="tabular px-2 py-3 text-right text-[#374151]">
                      {line.quantity}
                    </td>
                    <td className="tabular px-2 py-3 text-right text-[#374151]">
                      {line.unitPrice}
                    </td>
                    <td className="tabular px-2 py-3 text-right">
                      {line.discountLabel ? (
                        <>
                          <span className="text-[#9ca3af]">{line.discountLabel}</span>{' '}
                          <span className="text-[#374151]">−{line.discountAmount}</span>
                        </>
                      ) : (
                        <span className="text-[#d1d5db]">—</span>
                      )}
                    </td>
                    <td className="tabular px-2 py-3 text-right">
                      {line.taxPercent ? (
                        <>
                          <span className="text-[#9ca3af]">{line.taxPercent}%</span>{' '}
                          <span className="text-[#374151]">+{line.taxAmount}</span>
                        </>
                      ) : (
                        <span className="text-[#d1d5db]">—</span>
                      )}
                    </td>
                    <td className="tabular py-3 pl-2 text-right font-medium text-[#12161f]">
                      {line.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Totals */}
      {totals ? (
        <section className="flex justify-end border-t border-[#d8dbe0] pt-6">
          <dl className="w-full max-w-[17rem] space-y-2.5">
            <Row label="Subtotal" value={totals.subtotal} currency={currency} />
            <Row
              label="Total discount"
              value={`−${totals.totalDiscount}`}
              currency={currency}
            />
            <Row label="Total tax" value={`+${totals.totalTax}`} currency={currency} />

            <div className="flex items-baseline justify-between gap-6 pt-3">
              <dt className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-[#12161f]">
                Grand total
              </dt>
              {/* The accountant's double rule: this figure is settled. */}
              <dd className="double-rule tabular text-lg font-semibold text-[#12161f]">
                {currency} {totals.grandTotal}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {/* Notes */}
      {notes.trim() ? (
        <section className="mt-8 border-t border-[#d8dbe0] pt-6">
          <p className="font-mono text-[0.5625rem] uppercase tracking-[0.2em] text-[#6b7280]">
            Notes
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#374151]">
            {notes}
          </p>
        </section>
      ) : null}

      {/* Footer sits at the bottom of the page, not under the content. */}
      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#d8dbe0] pt-5 font-mono text-[0.5625rem] uppercase tracking-[0.14em] text-[#9ca3af]">
        <span>
          {status === 'finalized'
            ? `Finalized ${formatDate(finalizedAt ?? null)} · figures are final`
            : 'Draft · figures may still change'}
        </span>
        <span>All amounts in {currency}</span>
      </footer>
    </article>
  );
}

function Row({
  label,
  value,
  currency,
}: {
  label: string;
  value: string;
  currency: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt className="font-mono text-[0.5625rem] uppercase tracking-[0.18em] text-[#6b7280]">
        {label}
      </dt>
      <dd className="tabular text-sm text-[#374151]">
        <span className="mr-1.5 text-[#9ca3af]">{currency}</span>
        {value}
      </dd>
    </div>
  );
}

/** Adapts a stored document to the page's props. */
export function documentPageProps(
  document: ApiDocument,
  issuer?: { name: string; company: string },
): DocumentPageProps {
  // A fixed discount is stored as a bare amount. The editor's live preview
  // prefixes the currency symbol, so this has to as well — otherwise the same
  // line reads "$20.00" while you type and "20.00" once saved.
  const symbol = currencySymbol(document.currency);

  return {
    number: document.number,
    status: document.status,
    title: document.title,
    customer: document.customer,
    issueDate: document.issueDate,
    dueDate: document.dueDate,
    currency: document.currency,
    notes: document.notes,
    finalizedAt: document.finalizedAt,
    issuer,
    lines: document.lines.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountLabel: line.discount
        ? line.discount.type === 'percent'
          ? `${line.discount.value}%`
          : `${symbol}${line.discount.value}`
        : null,
      discountAmount: line.discountAmount,
      taxPercent: line.taxPercent,
      taxAmount: line.taxAmount,
      total: line.total,
    })),
    totals: {
      subtotal: document.totals.subtotal,
      totalDiscount: document.totals.totalDiscount,
      totalTax: document.totals.totalTax,
      grandTotal: document.totals.grandTotal,
    },
  };
}
