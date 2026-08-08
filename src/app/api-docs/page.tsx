import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft, ExternalLink } from 'lucide-react';

import { Mark } from '@/components/brand';

export const metadata: Metadata = { title: 'API reference' };

/**
 * A hand-written API reference.
 *
 * The machine-readable OpenAPI document lives at `/api/openapi`; this page is
 * the version a person reads before writing their first request. It leads with
 * the two things a client actually has to understand — how money is
 * transmitted, and what happens when a document is finalized — rather than an
 * alphabetical list of endpoints.
 */

const ENDPOINTS: Array<{
  method: string;
  path: string;
  summary: string;
  note?: string;
}> = [
  { method: 'POST', path: '/api/auth/signup', summary: 'Create an account and start a session' },
  { method: 'POST', path: '/api/auth/login', summary: 'Sign in', note: 'Locks the account for 15 minutes after 8 consecutive failures' },
  { method: 'POST', path: '/api/auth/logout', summary: 'Sign out' },
  { method: 'GET', path: '/api/auth/me', summary: 'Current user and preferences' },
  { method: 'PATCH', path: '/api/auth/me', summary: 'Update profile and defaults' },

  { method: 'GET', path: '/api/documents', summary: 'List documents', note: 'status, q, from, to, page, limit, sort' },
  { method: 'POST', path: '/api/documents', summary: 'Create a draft', note: 'Honours Idempotency-Key' },
  { method: 'GET', path: '/api/documents/{id}', summary: 'One document with its line items' },
  { method: 'PATCH', path: '/api/documents/{id}', summary: 'Edit a draft', note: '409 DOCUMENT_FINALIZED once issued' },
  { method: 'DELETE', path: '/api/documents/{id}', summary: 'Delete a draft', note: 'Finalized documents are permanent' },
  { method: 'POST', path: '/api/documents/{id}/finalize', summary: 'Issue a document, freezing it' },
  { method: 'POST', path: '/api/documents/{id}/duplicate', summary: 'Copy any document into a new draft' },
  { method: 'POST', path: '/api/documents/{id}/share', summary: 'Mint a public read-only link' },
  { method: 'GET', path: '/api/documents/{id}/audit', summary: 'Activity for one document' },

  { method: 'POST', path: '/api/documents/{id}/lines', summary: 'Add a line', note: 'Returns the recalculated document' },
  { method: 'PATCH', path: '/api/documents/{id}/lines/{lineId}', summary: 'Edit a line' },
  { method: 'DELETE', path: '/api/documents/{id}/lines/{lineId}', summary: 'Remove a line' },

  { method: 'GET', path: '/api/reports/summary', summary: 'Totals over an issue-date range', note: 'Both bounds inclusive, grouped by currency' },
  { method: 'GET', path: '/api/reports/export', summary: 'CSV of the documents behind a summary' },

  { method: 'POST', path: '/api/pricing/preview', summary: 'Calculate without persisting' },
  { method: 'GET', path: '/api/customers', summary: 'Distinct customers' },
  { method: 'GET', path: '/api/audit', summary: 'Account-wide audit trail' },
  { method: 'GET', path: '/api/health', summary: 'Liveness and database reachability' },
];

const METHOD_TONE: Record<string, string> = {
  GET: 'text-verdigris-300 border-verdigris-700',
  POST: 'text-brass-400 border-brass-700',
  PATCH: 'text-quill-300 border-ink-600',
  DELETE: 'text-oxblood-300 border-oxblood-700',
};

export default function ApiDocsPage() {
  return (
    <div className="min-h-dvh bg-ink-900">
      <header className="border-b border-ink-800">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-sheet border border-brass-700 bg-brass-500/10 p-1 text-brass-400">
              <Mark />
            </span>
            <span className="font-display text-lg text-quill-100">
              LedgerLine
            </span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-quill-500 hover:text-brass-300"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-4xl px-6 py-14">
        <p className="eyebrow">Reference</p>
        <h1 className="mt-3 font-display text-4xl text-quill-100">API</h1>
        <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-quill-300">
          A REST API over quotes and their line items. Authentication is an
          httpOnly session cookie set by <Code>/api/auth/login</Code>. The
          machine-readable OpenAPI 3.1 document is at{' '}
          <Link href="/api/openapi" className="text-brass-400 hover:underline">
            /api/openapi
          </Link>
          .
        </p>

        <Section title="Money on the wire">
          <p>
            No monetary value is ever transmitted as a JSON number. Each amount
            appears twice: a formatted decimal string for display, and an exact
            integer count of minor units under <Code>amounts</Code> for
            comparison.
          </p>
          <Pre>{`"total": "189.00",
"amounts": { "totalMinor": 18900 }`}</Pre>
          <p>
            Inputs accept a string or a number. Strings are lossless and
            preferred — <Code>&quot;19.99&quot;</Code> survives a round trip that{' '}
            <Code>19.99</Code> may not. More precision than the currency supports
            is rejected, never truncated.
          </p>
        </Section>

        <Section title="How a line is priced">
          <Pre>{`subtotal         = round(quantity x unitPrice)
discountAmount   = round(subtotal x discountPercent)   // or the fixed amount
discountedAmount = subtotal - discountAmount
taxAmount        = round(discountedAmount x taxPercent)
lineTotal        = discountedAmount + taxAmount`}</Pre>
          <p>
            Rounding is half-up, applied at each step, to the currency&rsquo;s
            minor unit — 2 places for AED and USD, 3 for KWD, none for JPY.
            Document totals are sums of already-rounded lines, which is what
            makes <Code>subtotal − totalDiscount + totalTax === grandTotal</Code>{' '}
            hold exactly.
          </p>
          <p>
            A discount is a tagged union — <Code>{`{ type, value }`}</Code> —
            so &ldquo;percent and fixed at once&rdquo; cannot be expressed. A
            fixed discount larger than its line subtotal is rejected with{' '}
            <Code>422</Code> rather than silently clamped.
          </p>
        </Section>

        <Section title="Lifecycle">
          <p>
            A <Code>draft</Code> is fully editable. Finalizing recalculates it
            once, then freezes it: every subsequent write — metadata, lines,
            deletion — returns <Code>409 DOCUMENT_FINALIZED</Code>. To change
            something you already sent, duplicate it into a new draft.
          </p>
        </Section>

        <Section title="Errors">
          <p>
            One envelope everywhere. <Code>code</Code> is stable and safe to
            branch on; <Code>details[].path</Code> names the field so a form can
            attach the message to the right input.
          </p>
          <Pre>{`{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "lines.0.quantity: Quantity must be at least 1.",
    "details": [
      { "path": "lines.0.quantity", "message": "Quantity must be at least 1." }
    ],
    "requestId": "req_01HV..."
  }
}`}</Pre>
        </Section>

        <Section title="Idempotency">
          <p>
            Send an <Code>Idempotency-Key</Code> header on{' '}
            <Code>POST /api/documents</Code>, <Code>/finalize</Code> and{' '}
            <Code>/duplicate</Code>. A retry with the same key returns the
            original response instead of acting twice; the same key with a
            different body is rejected with{' '}
            <Code>409 IDEMPOTENCY_KEY_REUSED</Code>.
          </p>
        </Section>

        <Section title="Endpoints">
          <div className="overflow-hidden rounded-sheet border border-ink-700">
            {ENDPOINTS.map((endpoint, index) => (
              <div
                key={`${endpoint.method}-${endpoint.path}`}
                className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 ${
                  index > 0 ? 'border-t border-ink-800' : ''
                }`}
              >
                <span
                  className={`w-16 shrink-0 rounded border px-1.5 py-0.5 text-center font-mono text-[0.625rem] ${
                    METHOD_TONE[endpoint.method]
                  }`}
                >
                  {endpoint.method}
                </span>
                <code className="font-mono text-xs text-quill-100">{endpoint.path}</code>
                <span className="text-sm text-quill-500">{endpoint.summary}</span>
                {endpoint.note ? (
                  <span className="w-full pl-20 font-mono text-[0.6875rem] text-quill-700">
                    {endpoint.note}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Try it">
          <Pre>{`# Sign in and keep the session cookie
curl -c jar.txt -X POST http://localhost:3000/api/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"demo@ledgerline.app","password":"demo-password-2026"}'

# Price the brief's sample document without storing anything
curl -b jar.txt -X POST http://localhost:3000/api/pricing/preview \\
  -H 'Content-Type: application/json' \\
  -d '{
    "currency": "USD",
    "lines": [
      {"description":"Widget A","quantity":2,"unitPrice":"100.00",
       "discount":{"type":"percent","value":10},"taxPercent":5},
      {"description":"Widget B","quantity":1,"unitPrice":"50.00","taxPercent":5},
      {"description":"Service fee","quantity":1,"unitPrice":"200.00",
       "discount":{"type":"fixed","value":"20.00"}}
    ]
  }'
# -> grandTotal "421.50"`}</Pre>
        </Section>

        <Link
          href="/api/openapi"
          className="mt-12 inline-flex items-center gap-2 text-sm text-brass-400 hover:underline"
        >
          OpenAPI 3.1 document
          <ExternalLink className="size-3.5" />
        </Link>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="font-display text-2xl text-quill-100">{title}</h2>
      <div className="mt-4 space-y-4 text-pretty leading-relaxed text-quill-300">
        {children}
      </div>
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-ink-700 bg-ink-850 px-1.5 py-0.5 font-mono text-[0.8125rem] text-brass-300">
      {children}
    </code>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-sheet border border-ink-700 bg-ink-950 p-4 font-mono text-[0.8125rem] leading-relaxed text-quill-300">
      {children}
    </pre>
  );
}
