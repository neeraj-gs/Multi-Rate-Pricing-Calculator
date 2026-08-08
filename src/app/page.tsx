import Link from 'next/link';
import {
  ArrowRight,
  FileLock2,
  GitCompareArrows,
  Landmark,
  Repeat2,
  ScrollText,
  ShieldCheck,
  Sigma,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ProofLedger } from '@/components/landing/ProofLedger';
import { SceneMount } from '@/components/landing/SceneMount';

export default function LandingPage() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-ink-900">
      <Header />

      <main id="main">
        <Hero />
        <Proof />
        <Rules />
        <Lifecycle />
        <Engineering />
        <Closing />
      </main>

      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function Wordmark() {
  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <span className="flex size-7 items-center justify-center rounded-sheet border border-brass-700 bg-brass-500/10">
        <Sigma className="size-3.5 text-brass-400" />
      </span>
      <span className="font-display text-lg tracking-tight text-quill-100">
        Ledger<span className="text-brass-400">Line</span>
      </span>
    </Link>
  );
}

function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-ink-800/80 bg-ink-900/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Wordmark />
        <nav className="flex items-center gap-1 sm:gap-2">
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
    <section className="relative isolate min-h-[92svh] overflow-hidden pt-16">
      <div className="ink-grid absolute inset-0 opacity-[0.55]" aria-hidden />
      <div className="absolute inset-y-0 right-0 w-full lg:w-[58%]">
        <SceneMount />
      </div>

      <div className="relative mx-auto flex min-h-[92svh] max-w-6xl items-center px-6">
        <div className="max-w-xl py-24 animate-rise">
          <p className="eyebrow">Quotes · Proposals · Billing</p>

          <h1 className="mt-6 font-display text-[clamp(2.75rem,6.5vw,4.5rem)] leading-[0.98] tracking-[-0.02em] text-quill-100">
            Every line adds up.
            <br />
            <span className="text-brass-400">Twice underlined.</span>
          </h1>

          <p className="mt-7 max-w-md text-pretty text-lg leading-relaxed text-quill-300">
            Per-line discounts and tax rates, computed on the server in exact
            integer arithmetic. Subtotal minus discount plus tax equals the grand
            total — not approximately, exactly.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild variant="primary" size="lg">
              <Link href="/signup">
                Build a quote
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="#proof">See the maths</Link>
            </Button>
          </div>

          <dl className="mt-14 grid max-w-md grid-cols-3 gap-6 border-t border-ink-700 pt-6">
            <Stat value="0" label="Floats in the money path" />
            <Stat value="98" label="Tests on the engine" />
            <Stat value="2dp" label="Half-up, per line" />
          </dl>
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="tabular text-2xl font-semibold text-quill-100">{value}</dt>
      <dd className="mt-1 text-xs leading-snug text-quill-500">{label}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function Proof() {
  return (
    <section id="proof" className="relative border-t border-ink-800 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Worked example</p>
          <h2 className="mt-4 text-balance font-display text-4xl leading-tight text-quill-100 sm:text-5xl">
            The same engine that runs the app rendered this
          </h2>
          <p className="mt-5 text-pretty text-quill-300">
            Not a screenshot. This page imports the calculation module and prints
            whatever it returns. Widget A is taxed on 180.00 after its 10%
            discount — never on the gross 200.00.
          </p>
        </div>

        <div className="mt-14">
          <ProofLedger />
        </div>

        <p className="mx-auto mt-6 max-w-2xl text-center font-mono text-xs leading-relaxed text-quill-700">
          450.00 − 40.00 + 11.50 = 421.50 · and the sum of the three line totals
          is 421.50 · these are the same number by construction, not by luck
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------- */

const RULES = [
  {
    icon: GitCompareArrows,
    title: 'Discount before tax, always',
    body: 'Tax is charged on the discounted line amount. Getting this backwards overstates tax on every discounted line, which is the kind of error a customer notices before you do.',
  },
  {
    icon: Sigma,
    title: 'Integers, not floats',
    body: 'Every amount is an integer count of minor units. Decimal input is parsed by inspecting the digits, so no price is ever handed to IEEE-754 and handed back slightly different.',
  },
  {
    icon: ScrollText,
    title: 'Rounded once, per line',
    body: 'Half-up to the currency’s minor unit at each step. Document totals are sums of already-rounded lines, so the grand total can never disagree with the lines above it.',
  },
  {
    icon: Landmark,
    title: 'Currencies that are not two-decimal',
    body: 'Kuwaiti dinar rounds to three places, yen to none. The precision comes from the currency, not from a hardcoded 2 — so MENA books are right by default.',
  },
];

function Rules() {
  return (
    <section className="border-t border-ink-800 bg-ink-850/40 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <p className="eyebrow">The rules</p>
          <h2 className="mt-4 text-balance font-display text-4xl leading-tight text-quill-100 sm:text-5xl">
            Four decisions that keep the numbers honest
          </h2>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-sheet border border-ink-700 bg-ink-700 sm:grid-cols-2">
          {RULES.map((rule) => (
            <div key={rule.title} className="bg-ink-900 p-7">
              <rule.icon className="size-5 text-brass-500" />
              <h3 className="mt-5 font-display text-xl text-quill-100">{rule.title}</h3>
              <p className="mt-3 text-pretty text-sm leading-relaxed text-quill-500">
                {rule.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------- */

function Lifecycle() {
  return (
    <section className="border-t border-ink-800 py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-16 px-6 lg:grid-cols-2">
        <div>
          <p className="eyebrow">Lifecycle</p>
          <h2 className="mt-4 text-balance font-display text-4xl leading-tight text-quill-100 sm:text-5xl">
            Issued means issued
          </h2>
          <p className="mt-6 text-pretty leading-relaxed text-quill-300">
            A draft is yours to change. The moment you finalize it, the document
            stops moving — the API refuses every edit, every line change, and
            deletion outright, because a report covering last quarter has to add
            up the same way tomorrow as it did today.
          </p>
          <p className="mt-4 text-pretty leading-relaxed text-quill-500">
            Need to change something you already sent? Duplicate it. The original
            stays exactly as the customer received it, and the copy is a fresh
            draft that remembers where it came from.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Pill icon={FileLock2}>409 on every write</Pill>
            <Pill icon={Repeat2}>Duplicate to amend</Pill>
            <Pill icon={ShieldCheck}>Append-only audit trail</Pill>
          </div>
        </div>

        {/* The state machine, drawn rather than described. */}
        <div className="rounded-sheet border border-ink-700 bg-ink-850 p-8">
          <div className="space-y-4">
            <StateRow
              state="draft"
              tone="muted"
              caption="Add, edit and remove lines. Totals recompute on every change."
            />
            <div className="flex items-center gap-3 pl-4">
              <div className="h-8 w-px bg-ink-600" />
              <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-brass-500">
                POST /finalize
              </span>
            </div>
            <StateRow
              state="finalized"
              tone="accent"
              caption="Read-only, permanently. Figures are recalculated once, then frozen."
            />
            <div className="flex items-center gap-3 pl-4">
              <div className="h-8 w-px bg-ink-600" />
              <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-verdigris-400">
                POST /duplicate
              </span>
            </div>
            <StateRow
              state="new draft"
              tone="muted"
              caption="A fresh document, linked to its original."
            />
          </div>
        </div>
      </div>
    </section>
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
      <Icon className="size-3.5 text-brass-500" />
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------------- */

const ENGINEERING = [
  ['Idempotency keys', 'A retried create returns the original document instead of a second one.'],
  ['Optimistic concurrency', 'Two tabs on one draft is a 409 you can recover from, not a silent overwrite.'],
  ['Aggregated reports', 'Summaries are a MongoDB $group over stored integers, grouped by currency.'],
  ['Hashed share links', '256-bit tokens, stored only as a hash, expiring on a schedule you set.'],
  ['Field-level errors', 'Every rejection names the path that caused it, down to lines.0.discount.value.'],
  ['Structured logs', 'One JSON line per request with a correlation id, and no customer data in it.'],
];

function Engineering() {
  return (
    <section className="border-t border-ink-800 bg-ink-850/40 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <p className="eyebrow">Under the surface</p>
          <h2 className="mt-4 text-balance font-display text-4xl leading-tight text-quill-100 sm:text-5xl">
            The parts nobody demos
          </h2>
        </div>

        <dl className="mt-14 grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {ENGINEERING.map(([title, body]) => (
            <div key={title} className="border-t border-ink-700 pt-5">
              <dt className="font-mono text-xs uppercase tracking-[0.14em] text-brass-500">
                {title}
              </dt>
              <dd className="mt-2.5 text-pretty text-sm leading-relaxed text-quill-500">
                {body}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------- */

function Closing() {
  return (
    <section className="relative overflow-hidden border-t border-ink-800 py-28">
      <div className="ink-grid absolute inset-0 opacity-40" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_50%,rgba(205,163,73,0.12),transparent_70%)]" />

      <div className="relative mx-auto max-w-2xl px-6 text-center">
        <h2 className="text-balance font-display text-4xl leading-tight text-quill-100 sm:text-5xl">
          Send a quote you would sign yourself
        </h2>
        <p className="mt-5 text-pretty text-quill-300">
          Free to start. No card. Your first document takes about a minute.
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
        <p className="font-mono text-xs text-quill-700">
          Built for the CrossVal take-home · Next.js · MongoDB · TypeScript
        </p>
        <nav className="flex gap-5 text-xs text-quill-500">
          <Link href="/api-docs" className="transition-colors hover:text-brass-400">
            API reference
          </Link>
          <Link href="/api/health" className="transition-colors hover:text-brass-400">
            Status
          </Link>
        </nav>
      </div>
    </footer>
  );
}
