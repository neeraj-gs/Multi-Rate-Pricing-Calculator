import Link from 'next/link';
import { ArrowRight, FileLock2, Repeat2, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ProofLedger } from '@/components/landing/ProofLedger';
import { Pipeline } from '@/components/landing/Pipeline';
import { HowYouUseIt, WhatItIs } from '@/components/landing/HowItWorks';
import { Mark, Wordmark } from '@/components/brand';
import { SceneMount } from '@/components/landing/SceneMount';

export default function LandingPage() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-ink-900">
      <Header />

      <main id="main">
        <Hero />
        <Section id="what">
          <WhatItIs />
        </Section>
        <Section id="how" tone="raised">
          <HowYouUseIt />
        </Section>
        <Proof />
        <Maths />
        <Lifecycle />
        <Engineering />
        <Closing />
      </main>

      <Footer />
    </div>
  );
}

/**
 * One section rhythm for the whole page.
 *
 * Every section used to set its own padding, which is how the gap between the
 * hero and the block after it ended up taller than the block itself.
 */
function Section({
  id,
  tone = 'base',
  children,
}: {
  id?: string;
  tone?: 'base' | 'raised';
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={`border-t border-ink-800 py-20 sm:py-28 ${
        tone === 'raised' ? 'bg-ink-850/40' : ''
      }`}
    >
      <div className="mx-auto max-w-6xl px-6">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------------- */

function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-ink-800/70 bg-ink-900/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="#how">How it works</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/api-docs">API</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild variant="primary" size="sm">
            <Link href="/signup">Start free</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="relative isolate flex min-h-[94svh] items-center overflow-hidden pt-16">
      {/* Full-bleed, so the geometry is the page rather than a panel on it. */}
      <div className="absolute inset-0">
        <SceneMount />
      </div>

      {/* Scrim: enough ground under the type to stay legible over the metal. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink-900 via-ink-900/92 to-ink-900/10 lg:via-ink-900/80 lg:to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink-900 to-transparent"
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 py-20">
        <div className="max-w-3xl animate-rise">
          <p className="eyebrow">Quotes · Proposals · Pro-forma invoices</p>

          {/* The break is authored, so the two halves of the claim stay
              together — but the size is capped so line one never wraps on its
              own and turns two lines into three. */}
          <h1 className="mt-7 font-display text-[clamp(2.5rem,5.4vw,4.25rem)] text-quill-100">
            Pricing that closes
            <br />
            with no gap.
          </h1>

          <p className="mt-8 max-w-lg text-pretty text-lg leading-relaxed text-quill-300">
            Every line carries its own discount and tax rate. Tessera computes
            them on the server in exact integer arithmetic, so subtotal minus
            discount plus tax equals the grand total — not approximately,
            exactly.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button asChild variant="primary" size="lg">
              <Link href="/signup">
                Build a quote
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="#how">See how it works</Link>
            </Button>
          </div>

          <div className="mt-14 max-w-lg">
            <div className="fade-rule" />
            <dl className="mt-6 grid grid-cols-3 gap-6">
              <Stat value="0" label="Floats in the money path" />
              <Stat value="74" label="Tests on the engine" />
              <Stat value="2dp" label="Half-up, per line" />
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="tabular text-2xl font-semibold text-quill-100">{value}</dt>
      <dd className="mt-1.5 text-xs leading-snug text-quill-500">{label}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function Proof() {
  return (
    <Section id="proof">
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow">Worked example</p>
        <h2 className="mt-4 text-balance font-display text-[clamp(1.75rem,3.6vw,3rem)] text-quill-100">
          The engine that runs the app rendered this
        </h2>
        <p className="mt-5 text-pretty leading-relaxed text-quill-300">
          Not a screenshot. This page imports the calculation module and prints
          whatever it returns — so if the maths ever changed, the page would say
          so before you did.
        </p>
      </div>

      <div className="mt-14">
        <ProofLedger />
      </div>

      <p className="mx-auto mt-7 max-w-2xl text-center font-mono text-xs leading-relaxed text-quill-700">
        450.00 − 40.00 + 11.50 = 421.50 · and the three line totals sum to
        421.50 · the same number by construction, not by luck
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------------- */

function Maths() {
  return (
    <Section tone="raised">
      <div className="max-w-2xl">
        <p className="eyebrow">The order of operations</p>
        <h2 className="mt-4 text-balance font-display text-[clamp(1.75rem,3.6vw,3rem)] text-quill-100">
          Where a cent goes missing
        </h2>
        <p className="mt-5 text-pretty leading-relaxed text-quill-300">
          Two decisions decide whether a document ties out: what order the
          discount and the tax are applied in, and when you round. Here is one
          line of the worked example, all the way through.
        </p>
      </div>

      <div className="mt-14">
        <Pipeline />
      </div>

      <div className="mt-16 grid gap-10 border-t border-ink-700 pt-12 lg:grid-cols-3">
        <Detail
          heading="Integers, never floats"
          body={
            <>
              <code className="tabular text-oxblood-300">
                Math.round(1.005 * 100)
              </code>{' '}
              returns 100, not 101 — because 1.005 × 100 is 100.49999999999999
              in binary floating point. Every amount here is an integer count of
              minor units, and decimal input is parsed by inspecting its digits,
              so no price is ever handed to IEEE-754.
            </>
          }
        />
        <Detail
          heading="Rounded per line, once"
          body={
            <>
              Half-up at each step, to the currency&rsquo;s minor unit. Document
              totals are plain sums of already-rounded lines, which is what makes
              the grand total agree with the lines printed above it — the
              alternative is a total that is a cent off from its own rows.
            </>
          }
        />
        <Detail
          heading="Precision comes from the currency"
          body={
            <>
              Kuwaiti dinar rounds to three decimal places, yen to none. The
              scale is read from the currency rather than hardcoded to 2, so a
              KWD quote is right by default instead of wrong by construction.
            </>
          }
        />
      </div>
    </Section>
  );
}

function Detail({ heading, body }: { heading: string; body: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-brass-400">
        {heading}
      </h3>
      <p className="mt-3 text-pretty text-sm leading-relaxed text-quill-500">{body}</p>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function Lifecycle() {
  return (
    <Section>
      <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div>
          <p className="eyebrow">Lifecycle</p>
          <h2 className="mt-4 text-balance font-display text-[clamp(1.75rem,3.6vw,3rem)] text-quill-100">
            Issued means issued
          </h2>
          <p className="mt-6 text-pretty leading-relaxed text-quill-300">
            A draft is yours to change. The moment you finalize it the document
            stops moving — the API refuses every edit, every line change, and
            deletion outright, because a report covering last quarter has to add
            up the same way tomorrow as it did today.
          </p>
          <p className="mt-4 text-pretty leading-relaxed text-quill-500">
            Need to change something you already sent? Duplicate it. The original
            stays exactly as the customer received it, and the copy is a fresh
            draft that remembers where it came from.
          </p>

          <div className="mt-8 flex flex-wrap gap-2.5">
            <Pill icon={FileLock2}>409 on every write</Pill>
            <Pill icon={Repeat2}>Duplicate to amend</Pill>
            <Pill icon={ShieldCheck}>Append-only audit trail</Pill>
          </div>
        </div>

        <div className="rounded-sheet border border-ink-700 bg-ink-850 p-8">
          <div className="space-y-4">
            <StateRow
              state="draft"
              tone="muted"
              caption="Add, edit and remove lines. Totals recompute on every change."
            />
            <Transition label="POST /finalize" tone="brass" />
            <StateRow
              state="finalized"
              tone="accent"
              caption="Read-only, permanently. Figures are recalculated once, then frozen."
            />
            <Transition label="POST /duplicate" tone="verdigris" />
            <StateRow
              state="new draft"
              tone="muted"
              caption="A fresh document, linked back to its original."
            />
          </div>
        </div>
      </div>
    </Section>
  );
}

function Transition({
  label,
  tone,
}: {
  label: string;
  tone: 'brass' | 'verdigris';
}) {
  return (
    <div className="flex items-center gap-3 pl-4">
      <div className="h-8 w-px bg-ink-600" />
      <span
        className={`font-mono text-[0.6875rem] uppercase tracking-[0.14em] ${
          tone === 'brass' ? 'text-brass-400' : 'text-verdigris-400'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function StateRow({
  state,
  caption,
  tone,
}: {
  state: string;
  caption: string;
  tone: 'muted' | 'accent';
}) {
  return (
    <div
      className={`rounded-sheet border px-4 py-3 ${
        tone === 'accent'
          ? 'border-brass-700 bg-brass-500/[0.07]'
          : 'border-ink-600 bg-ink-800'
      }`}
    >
      <p
        className={`font-mono text-xs uppercase tracking-[0.16em] ${
          tone === 'accent' ? 'text-brass-400' : 'text-quill-300'
        }`}
      >
        {state}
      </p>
      <p className="mt-1.5 text-sm leading-snug text-quill-500">{caption}</p>
    </div>
  );
}

function Pill({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs text-quill-300">
      <Icon className="size-3.5 text-brass-400" />
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------------- */

const ENGINEERING: Array<[string, string]> = [
  ['Idempotency keys', 'A retried create returns the original document instead of a second one.'],
  ['Optimistic concurrency', 'Two tabs on one draft is a 409 you can recover from, not a silent overwrite.'],
  ['Aggregated reports', 'Summaries are one indexed $group over stored integers, grouped by currency.'],
  ['Hashed share links', '256-bit tokens, stored only as a hash, expiring on a schedule you set.'],
  ['Field-level errors', 'Every rejection names the path that caused it, down to lines.0.discount.value.'],
  ['Structured logs', 'One JSON line per request with a correlation id, and no customer data in it.'],
];

function Engineering() {
  return (
    <Section tone="raised">
      <div className="max-w-2xl">
        <p className="eyebrow">Under the surface</p>
        <h2 className="mt-4 text-balance font-display text-[clamp(1.75rem,3.6vw,3rem)] text-quill-100">
          The parts nobody demos
        </h2>
      </div>

      <dl className="mt-14 grid gap-x-12 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
        {ENGINEERING.map(([title, body]) => (
          <div key={title} className="border-t border-ink-700 pt-5">
            <dt className="font-mono text-xs uppercase tracking-[0.14em] text-brass-400">
              {title}
            </dt>
            <dd className="mt-2.5 text-pretty text-sm leading-relaxed text-quill-500">
              {body}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/* ------------------------------------------------------------------------- */

function Closing() {
  return (
    <section className="relative overflow-hidden border-t border-ink-800 py-28">
      <div className="tessellate absolute inset-0 opacity-40" aria-hidden />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_50%,rgba(217,155,50,0.14),transparent_70%)]"
      />

      <div className="relative mx-auto max-w-2xl px-6 text-center">
        <span className="mx-auto mb-8 flex size-10 items-center justify-center text-brass-400">
          <Mark />
        </span>
        <h2 className="text-balance font-display text-[clamp(1.75rem,3.6vw,3rem)] text-quill-100">
          Send a quote you would sign yourself
        </h2>
        <p className="mt-5 text-pretty text-quill-300">
          Free to start, no card. Your first document takes about a minute.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Button asChild variant="primary" size="lg">
            <Link href="/signup">
              Create an account
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-ink-800 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-6 sm:flex-row">
        <Wordmark />
        <p className="text-center font-mono text-xs text-quill-700">
          Built for the CrossVal take-home · Next.js · MongoDB · TypeScript
        </p>
        <nav className="flex gap-5 text-xs text-quill-500">
          <Link href="/api-docs" className="transition-colors hover:text-brass-300">
            API reference
          </Link>
          <Link href="/api/health" className="transition-colors hover:text-brass-300">
            Status
          </Link>
        </nav>
      </div>
    </footer>
  );
}
