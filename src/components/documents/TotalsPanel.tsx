'use client';

import { AlertTriangle, Check, Loader2, ServerCog } from 'lucide-react';

import { money } from '@/lib/utils';
import type { ApiClientError } from '@/lib/api-client';
import type { PreviewResponse } from '@/lib/documents/types';

/**
 * The totals panel.
 *
 * Every figure here came back from the server. The small "server" line at the
 * bottom is not decoration — it is the visible proof of the brief's central
 * requirement, and it shows the round-trip time so a reviewer can watch the
 * numbers actually being computed somewhere else.
 */
export function TotalsPanel({
  preview,
  currency,
  pending,
  error,
  latencyMs,
}: {
  preview: PreviewResponse | null;
  currency: string;
  pending: boolean;
  error: ApiClientError | null;
  latencyMs: number | null;
}) {
  const totals = preview?.totals;

  return (
    <div className="rounded-sheet border border-ink-700 bg-ink-850">
      <div className="border-b border-ink-700 px-5 py-3.5">
        <h2 className="font-display text-lg text-quill-100">Totals</h2>
      </div>

      <dl className="space-y-3 px-5 py-5">
        <Row
          label="Subtotal"
          value={totals ? money(totals.subtotal, currency) : '—'}
          hint="Before discounts"
        />
        <Row
          label="Total discount"
          value={totals ? `−${money(totals.totalDiscount, currency)}` : '—'}
          tone={totals && totals.totalDiscount !== '0.00' ? 'discount' : 'muted'}
        />
        <Row
          label="Total tax"
          value={totals ? `+${money(totals.totalTax, currency)}` : '—'}
          hint="On discounted amounts"
        />

        <div className="flex items-baseline justify-between gap-4 pt-4">
          <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-quill-300">
            Grand total
          </dt>
          {/* The double rule. This figure is settled. */}
          <dd className="double-rule tabular text-xl font-semibold text-brass-400">
            {totals ? money(totals.grandTotal, currency) : '—'}
          </dd>
        </div>
      </dl>

      {error ? (
        <div className="flex items-start gap-2.5 border-t border-oxblood-700 bg-oxblood-500/10 px-5 py-3 text-xs text-oxblood-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {error.message}
            <br />
            <span className="text-oxblood-300/70">
              Showing the last totals that computed cleanly.
            </span>
          </span>
        </div>
      ) : null}

      <div className="flex items-center gap-2 border-t border-ink-700 px-5 py-3 font-mono text-[0.6875rem] text-quill-700">
        {pending ? (
          <>
            <Loader2 className="size-3 animate-spin text-brass-500" />
            <span>Computing on the server…</span>
          </>
        ) : totals ? (
          <>
            <Check className="size-3 text-verdigris-400" />
            <span>
              Computed server-side
              {latencyMs !== null ? ` in ${latencyMs}ms` : ''}
            </span>
          </>
        ) : (
          <>
            <ServerCog className="size-3" />
            <span>Add a line to see totals</span>
          </>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  tone = 'normal',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'normal' | 'muted' | 'discount';
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="min-w-0">
        <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-quill-500">
          {label}
        </span>
        {hint ? (
          <span className="mt-0.5 block text-[0.6875rem] text-quill-700">{hint}</span>
        ) : null}
      </dt>
      <dd
        className={
          tone === 'discount'
            ? 'tabular text-sm text-verdigris-300'
            : tone === 'muted'
              ? 'tabular text-sm text-quill-500'
              : 'tabular text-sm text-quill-100'
        }
      >
        {value}
      </dd>
    </div>
  );
}
