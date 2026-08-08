# LedgerLine

A multi-rate pricing calculator for quotes, proposals and billing documents.
Line items carry their own discount and tax treatment; the server computes every
figure in exact integer arithmetic; finalizing a document freezes it permanently.

**Live:** _<add deployed URL here>_
**Demo account:** `demo@ledgerline.app` / `demo-password-2026`

Built for the CrossVal take-home assignment.

---

## Contents

- [Quick start](#quick-start)
- [Calculation and rounding policy](#calculation-and-rounding-policy)
- [Worked example](#worked-example)
- [Finalize and immutability rules](#finalize-and-immutability-rules)
- [Architecture](#architecture)
- [Data model](#data-model)
- [API](#api)
- [Testing](#testing)
- [Assumptions](#assumptions)
- [Tradeoffs](#tradeoffs)
- [What I would do before production](#what-i-would-do-before-production)

---

## Quick start

**Prerequisites:** Node 20.9+ and npm 10+. No MongoDB installation required —
see step 2.

```bash
git clone https://github.com/neeraj-gs/Multi-Rate-Pricing-Calculator.git
cd Multi-Rate-Pricing-Calculator
npm install
```

**1. Configure the environment**

```bash
cp .env.example .env.local
```

Then set `AUTH_SECRET` to at least 32 random characters:

```bash
openssl rand -base64 32
```

**2. Start a database**

If you already have MongoDB or an Atlas cluster, point `MONGODB_URI` at it and
skip ahead. Otherwise, in a separate terminal:

```bash
npm run db:local
```

That starts a real `mongod` on port 27018 with a persistent data directory,
using the binary `mongodb-memory-server` already ships for the test suite. It
prints the connection string to paste into `.env.local`. Nothing to install.

**3. Seed and run**

```bash
npm run seed     # demo account + 35 documents, including the brief's sample
npm run dev      # http://localhost:3000
```

**4. Verify**

```bash
npm run verify   # typecheck, then 98 tests, then a production build
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Vitest — 98 tests |
| `npm run test:coverage` | Coverage over the calculation module |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:local` | Local MongoDB, no install needed |
| `npm run seed` | Reset and reseed the demo account |

---

## Calculation and rounding policy

### Money is never a floating-point number

Binary floating point cannot represent most decimal fractions. `0.1 + 0.2` is
`0.30000000000000004`, and `1.005 * 100` is `100.49999999999999` — which rounds
*down* to `1.00` instead of `1.01`. On a document with hundreds of lines those
errors compound into totals that do not tie out.

So:

- Every amount is stored and computed as an **integer count of minor units** —
  cents for USD and AED, fils for KWD, whole yen for JPY.
- Decimal input is parsed by **inspecting the digits of the string**, never by
  `parseFloat`-then-multiply. No price ever passes through IEEE-754.
- Intermediate products use **`BigInt`**, so a multiply-then-divide stays exact
  even when the intermediate exceeds `Number.MAX_SAFE_INTEGER`.
- Extra precision is **rejected, not truncated**. Sending `10.999` for a USD
  price returns a `400` naming the field, because silently dropping a digit from
  a price is exactly the class of bug this design exists to prevent.

Percentages are stored as integers too — hundredths of a percent, so `12.5%` is
`1250`. Quantities are thousandths, so `2.5` is `2500`.

### Order of operations, per line

```
1.  subtotal          = round(quantity × unitPrice)
2.  discountAmount    = round(subtotal × discountPercent)   ← or the fixed amount
3.  discountedAmount  = subtotal − discountAmount
4.  taxAmount         = round(discountedAmount × taxPercent)
5.  lineTotal         = discountedAmount + taxAmount
```

Discount is always applied **before** tax, and tax is charged on the
**discounted** amount — never on the gross subtotal.

### Rounding policy

> **Half-up (ties away from zero), applied once per line at each step above, to
> the currency's minor unit.**

That is 2 decimal places for USD/AED/EUR, **3 for KWD/BHD/OMR**, and **0 for
JPY**. The precision comes from the currency, not from a hardcoded `2`.

**Document totals are plain sums of values that are already rounded.** Nothing
is rounded a second time. That single choice is what guarantees:

```
subtotal − totalDiscount + totalTax === grandTotal
```

holds *exactly*, for every document. The invariant is asserted inside the engine
itself — not merely in a test — so a violation throws rather than returning a
plausible-looking wrong number.

The alternative (rounding the document total independently of its lines) can
produce a grand total that differs by a cent from the sum of the lines printed
directly above it. That is the single most common complaint about billing
software, and it is avoidable.

### Rounding is per line, deliberately

Three identical lines of `0.10` at 5% tax each round `0.005` **up** to `0.01`,
so the document tax is `0.03`. Summing the raw values first and rounding once
would give `0.02`. Per-line rounding is chosen because the line amounts are what
the customer sees on the document, and they must add up to the total printed
underneath them.

---

## Worked example

The brief's sample document, in USD:

| Line | Qty | Unit price | Discount | Tax |
| --- | ---: | ---: | --- | ---: |
| Widget A | 2 | 100.00 | 10% | 5% |
| Widget B | 1 | 50.00 | — | 5% |
| Service fee | 1 | 200.00 | $20 fixed | — |

Step by step:

**Widget A**
```
subtotal   = 2 × 100.00                      = 200.00
discount   = 200.00 × 10%                    =  20.00
discounted = 200.00 − 20.00                  = 180.00
tax        = 180.00 × 5%                     =   9.00   ← 5% of 180, not of 200
total      = 180.00 + 9.00                   = 189.00
```

**Widget B**
```
subtotal   = 1 × 50.00                       =  50.00
discount   = none                            =   0.00
tax        = 50.00 × 5%                      =   2.50
total      = 50.00 + 2.50                    =  52.50
```

**Service fee**
```
subtotal   = 1 × 200.00                      = 200.00
discount   = fixed                           =  20.00
discounted = 200.00 − 20.00                  = 180.00
tax        = none                            =   0.00
total                                        = 180.00
```

**Document**

| Field | Amount | Derivation |
| --- | ---: | --- |
| Subtotal | **450.00** | 200 + 50 + 200 |
| Total discount | **40.00** | 20 + 0 + 20 |
| Total tax | **11.50** | 9.00 + 2.50 + 0 |
| Grand total | **421.50** | 189.00 + 52.50 + 180.00 |

And the identity holds: `450.00 − 40.00 + 11.50 = 421.50`.

You can check this three ways without signing in:

- The **landing page** imports `calculateDocument` and renders whatever it
  returns — it is not a screenshot.
- `npm test` runs these exact figures as an assertion.
- ```bash
  curl -X POST http://localhost:3000/api/pricing/preview \
    -H 'Content-Type: application/json' \
    -d '{"currency":"USD","lines":[
      {"description":"Widget A","quantity":2,"unitPrice":"100.00",
       "discount":{"type":"percent","value":10},"taxPercent":5},
      {"description":"Widget B","quantity":1,"unitPrice":"50.00","taxPercent":5},
      {"description":"Service fee","quantity":1,"unitPrice":"200.00",
       "discount":{"type":"fixed","value":"20.00"}}]}'
  ```

### The brief's four rules

| Rule | How it is enforced |
| --- | --- |
| 1. Discount before tax | The engine's fixed order of operations. Asserted in tests against the tax-first figure. |
| 2. Tax on the discounted amount | Widget A is taxed on `180.00` → `9.00`. A test asserts it is *not* `10.00`. |
| 3. Percent **or** fixed, not both | A discount is a tagged union `{ type, value }`, so "both at once" is **unrepresentable**, not merely forbidden. The schema is `.strict()`, so the older `{ discountPercent, discountFixed }` shape is rejected with a clear message rather than silently ignored. |
| 4. Fixed discount ≤ line subtotal | **Rejected** with `422 UNPROCESSABLE`, naming both figures. See below. |

### Why reject rather than clamp

A fixed discount larger than its line subtotal is almost always a typo or a
currency mix-up. Clamping it would produce a line that looks correct while being
wrong, and the person who made the mistake would never find out. Financial
software should stop and ask.

The engine exposes `{ overDiscount: 'clamp' }` for callers that genuinely prefer
a lossy bulk import to a failed one, but the API never uses it.

---

## Finalize and immutability rules

| Status | Behaviour |
| --- | --- |
| `draft` | Fully editable. Add, edit, reorder and remove lines; totals recompute on every change. |
| `finalized` | **Permanently read-only.** Every write is rejected. |

**Finalizing** (`POST /api/documents/:id/finalize`) validates first, then
recalculates once, then freezes. It refuses if the document has no line items,
no customer name, no issue date, or any line with a non-positive quantity or a
negative price. (The brief lists this as a stretch goal.)

Once finalized, these all return **`409 DOCUMENT_FINALIZED`** with a specific
message:

- `PATCH /api/documents/:id` — any metadata change
- `PATCH /api/documents/:id` with `lines` — replacing line items
- `POST /api/documents/:id/lines` — adding a line
- `PATCH` / `DELETE .../lines/:lineId` — editing or removing a line
- `DELETE /api/documents/:id` — deletion
- `POST .../finalize` again — already finalized

The rule lives in **one place** — `assertEditable` in
`src/lib/documents/service.ts`, which every mutating path calls. It is not
re-implemented per route, because a check that must be remembered on each new
endpoint is a check that will eventually be missed. The UI hides the Save and
Finalize controls on a finalized document, but that is presentation: if it
rendered them anyway, every request would still come back 409.

**Finalized documents cannot be deleted.** An issued document is a record of
something that happened, and a report covering last quarter must add up the same
way tomorrow as it did today.

### Duplicate — the way to amend an issued document (stretch goal, implemented)

`POST /api/documents/:id/duplicate` copies **any** document, finalized or not,
into a new draft:

- The copy is independently editable; the original stays frozen.
- Amounts are **recomputed from the source's inputs**, not copied, so a
  duplicate is never a vessel for stale figures.
- `duplicatedFromId` links the copy back to its original, and the editor shows
  that link.

This is the sanctioned escape hatch from immutability: "I need to change the
quote I sent last week" resolves to a *new* document, and the history stays
legible.

### Other stretch goals

- **Printable view** — `PrintableDocument` renders the parchment sheet; the
  `@media print` rules turn it into clean paper and drop the app chrome. Also
  used for public share links.
- **Share links** — `POST /api/documents/:id/share` mints a 256-bit token. Only
  its SHA-256 hash is stored, so a database leak cannot be turned back into
  working links. Links expire and can be revoked.

---

## Architecture

**Stack:** Next.js 15 (App Router) · TypeScript (strict) · MongoDB with Mongoose
· Zod · JWT sessions · Tailwind CSS v4 · react-three-fiber · Vitest.

Chosen to match how CrossVal builds: one shared TypeScript codebase carrying a
feature from schema to screen, with MongoDB as the store.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser                                                             │
│  Landing (RSC + 3D hero) · Editor · Reports · Printable view         │
└───────────────┬──────────────────────────────────────────────────────┘
                │  httpOnly session cookie · JSON
┌───────────────▼──────────────────────────────────────────────────────┐
│  middleware.ts — edge session check on page navigation (UX only)     │
└───────────────┬──────────────────────────────────────────────────────┘
┌───────────────▼──────────────────────────────────────────────────────┐
│  defineRoute — the one wrapper every endpoint goes through           │
│  connect · auth · rate limit · Zod · idempotency · errors · logging  │
└───────────────┬──────────────────────────────────────────────────────┘
┌───────────────▼──────────────────────────────────────────────────────┐
│  documents/service.ts — the only module that writes stored amounts   │
│  assertEditable · assertRevision · audit                             │
└───────┬──────────────────────────────────┬───────────────────────────┘
        │                                  │
┌───────▼─────────────────────┐  ┌─────────▼────────────────────────────┐
│  lib/pricing — pure, no I/O │  │  MongoDB                             │
│  THE source of every number │  │  users · documents · counters        │
│  integers · BigInt · half-up│  │  auditlogs · idempotencykeys · share │
└─────────────────────────────┘  └──────────────────────────────────────┘
```

### The two rules the whole design protects

**1. There is exactly one implementation of the maths.** The API, the seed
script, the report path, the landing page and the live editor preview all call
`calculateDocument`. There is no second implementation anywhere — that is what
keeps a document's stored totals, its printed PDF and its row in the summary
report from ever disagreeing.

**2. Stored amounts are only ever written by that engine.** No route assembles a
total by hand.

### Server-side totals with a live editor

The brief requires the server to be the source of truth. The obvious way to
honour that is to show totals only after a save, which makes the editor feel
dead. The obvious way to make it feel alive is to add the lines up in
JavaScript, which breaks the requirement and — worse — shows the user a number
that quietly disagrees with what gets stored.

This takes the third path: a debounced call to a **stateless
`POST /api/pricing/preview`** that runs the *same* `calculateDocument` the write
path runs. The client never does arithmetic; it just asks faster. The totals
panel displays the round-trip time, which is the visible evidence of it.

### Cross-cutting concerns live in one wrapper

`defineRoute` handles connection, authentication, rate limiting, validation,
idempotency, error shaping and structured logging, so an endpoint contains only
its own logic and none of those can be *forgotten* on a new route. `auth`
defaults to required — opting out is explicit and visible.

---

## Data model

### Line items are embedded in their document

Lines are only ever read as part of their document, only ever written as part of
their document, and are naturally bounded (200 max). Embedding gives:

- **One round trip** to render a document — no `$lookup`, no N+1.
- **Atomic writes.** Recalculating totals and rewriting lines is a single
  document update, so a crash can never leave stored totals disagreeing with the
  lines above them. A separate collection would need a multi-document
  transaction on every save.
- **A natural immutability boundary.** Freezing a finalized document is one
  guarded update, not a cascade.

The tradeoff is the 16 MB ceiling and rewriting the array on every edit; the
line cap bounds both. If a customer ever needs thousands of lines, the migration
is a `documentLines` collection keyed by `documentId`, with totals still on the
parent.

### Computed amounts are stored

Each line carries its own `subtotalMinor`, `discountAmountMinor`,
`taxAmountMinor` and `totalMinor`, and the parent stores the rollup. Storing
derived data is normally a smell; here it buys two things worth more than the
redundancy:

1. **Reports aggregate in the database** — a date-range summary is one indexed
   `$match` plus a `$group`, instead of loading every document into Node to
   re-add it up.
2. **A finalized document is a snapshot.** If rounding or tax rules ever change,
   an already-issued quote keeps the figures the customer accepted.

### Indexes

Every query in the app is scoped by `userId`, so it leads every index — tenant
isolation and selectivity from the same field.

| Index | Serves |
| --- | --- |
| `{ userId, issueDate: -1, _id: -1 }` | Default list view **and** the summary report range scan; `_id` makes pagination stable |
| `{ userId, status, issueDate: -1 }` | The Drafts / Finalized filter |
| `{ userId, number }` **unique** | Per-user document numbers, and lookup by number |
| `{ userId, updatedAt: -1 }` | "Recently edited" |
| `{ userId, 'customer.name', issueDate: -1 }` | Grouping by customer |
| `users.email` **unique** | The sole authority on "is this address taken" |
| `idempotencykeys.{userId, key}` **unique** | The claim lock itself |
| `idempotencykeys.createdAt` **TTL 24h** | Self-cleaning, no cron |
| `sharelinks.expiresAt` **TTL** | Expired links swept automatically |

**Document numbering** uses an atomic `$inc` on a `counters` document. Counting
existing documents is the obvious approach and is wrong: two concurrent requests
both read the same count and mint the same number, and deleting a draft makes
the sequence go backwards. A test creates ten documents concurrently and asserts
ten distinct numbers.

---

## API

Full reference at **`/api-docs`**; machine-readable OpenAPI 3.1 at
**`/api/openapi`**.

### Money on the wire

No monetary value is ever transmitted as a JSON number. Each amount appears
twice — a formatted decimal string for display, and the exact integer under
`amounts`:

```json
{ "total": "189.00", "amounts": { "totalMinor": 18900 } }
```

Inputs accept a string or a number; strings are lossless and preferred.

### Error envelope

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "lines.0.quantity: Quantity must be at least 1.",
    "details": [
      { "path": "lines.0.quantity", "message": "Quantity must be at least 1." }
    ],
    "requestId": "req_01HV..."
  }
}
```

`code` is stable and safe to branch on. `details[].path` names the field, so a
form attaches each message to the input that caused it — the difference between
"something was wrong" and a red underline in the right place.

Validation runs in **two layers**: Zod checks shape before any business logic;
the pricing engine checks numeric truth (precision, currency, discount-versus-
subtotal), because those rules depend on computed values and would have to be
duplicated in a static schema — and a duplicated rule eventually disagrees with
itself. Both surface through the same envelope.

**Observed responses** (all verified against the running app):

| Input | Response |
| --- | --- |
| `quantity: -2` | `400` — `lines.0.quantity: Value must not be negative.` |
| `quantity: 0.5` | `400` — `lines.0.quantity: Quantity must be at least 1.` |
| `unitPrice: "-5.00"` | `400` — `Value must not be negative.` |
| `discount: {percent, 150}` | `400` — `A percentage discount cannot exceed 100%.` |
| `discount: {fixed, "80.00"}` on a 50.00 line | `422` — `Fixed discount of 80.00 exceeds the line subtotal of 50.00.` |
| `unitPrice: "10.999"` (USD) | `400` — `Value supports at most 2 decimal places, received "10.999".` |
| `currency: "XBT"` | `400` — lists the supported codes |
| `{discountPercent, discountFixed}` | `400` — `Unrecognized key(s) in object` |

### Endpoints

| | |
| --- | --- |
| `POST /api/auth/signup` · `login` · `logout` · `GET/PATCH /api/auth/me` | Session |
| `GET/POST /api/documents` | List (filter, search, sort, paginate) · create |
| `GET/PATCH/DELETE /api/documents/:id` | Read · edit draft · delete draft |
| `POST /api/documents/:id/finalize` | Issue, freezing permanently |
| `POST /api/documents/:id/duplicate` | Copy into a new draft |
| `POST /api/documents/:id/share` | Public read-only link |
| `POST /api/documents/:id/lines` · `PATCH/DELETE .../lines/:lineId` | Line CRUD; each returns the recalculated document |
| `GET /api/reports/summary` · `/export` | Summary over a date range · CSV |
| `POST /api/pricing/preview` | Calculate without persisting |
| `GET /api/documents/:id/audit` · `/api/audit` | Audit trail |
| `GET /api/health` · `/api/openapi` | Liveness · spec |

Line endpoints return the **whole document**, not just the line — adding a line
changes every document-level total, so returning the line alone would force the
client to recompute totals locally.

### Beyond the brief

- **Idempotency keys** on create, finalize and duplicate. The claim is a single
  insert against a unique index, so two concurrent retries cannot both win.
- **Optimistic concurrency** — clients echo the `revision` they read; a stale
  write is a `409 REVISION_MISMATCH` the UI can explain, not a silent overwrite.
  Two tabs on one draft is how people actually work.
- **Append-only audit trail**, including *rejected* edits to finalized
  documents — repeated attempts to change an issued quote are exactly what a
  finance team wants to see.
- **Multi-currency with correct minor units** — KWD to 3 places, JPY to 0.
- **CSV export** with a formula-injection guard (a cell starting `=`, `+`, `-`
  or `@` executes when opened in Excel).
- Command palette (⌘K), search, structured JSON request logging with correlation
  ids, security headers, health check.

---

## Security

- **Passwords** — bcrypt, cost factor 12. The hash carries `select: false`, so
  it is never loaded unless a sign-in explicitly asks for it.
- **Account enumeration** — a login for an unknown email burns the same bcrypt
  time as a real one and returns the identical message, closing the timing and
  wording oracle.
- **Brute force** — an account locks for 15 minutes after 8 consecutive
  failures. That counter lives in MongoDB, so it survives container churn; the
  in-process IP rate limiter cannot make that promise (see the tradeoffs).
- **Sessions** — JWT in an `httpOnly`, `sameSite=lax`, `secure` cookie, so an
  XSS hole yields nothing directly stealable and form-post CSRF is closed off.
  The algorithm is pinned, so `alg: none` is never accepted. A `tokenVersion`
  claim gives revocation without a session table.
- **Tenant isolation** — `userId` is part of the *query*, never an
  afterwards check. Another user's document is a `404`, not a `403`: confirming
  it exists would itself leak.
- **Share tokens** — 256 bits, stored only as a SHA-256 hash.
- **Search input** — regex metacharacters are escaped before reaching `$regex`;
  otherwise `a+++++++b` is a CPU-pinning denial of service through a search box.
- Request bodies capped; security headers set in `next.config.mjs`.

---

## Testing

```bash
npm test              # 98 tests
npm run test:coverage # coverage over the calculation module
```

**66 unit tests on the calculation module** — the highest-value surface, as the
brief notes. They cover the worked example verbatim, float-drift regressions
(including the `1.005` case, which the test demonstrates failing under naive
`Math.round`), half-up ties in both directions, per-line versus per-document
rounding, all four brief rules, three currencies with different minor units,
determinism and input immutability, and a 400-line randomised document asserted
against the totals identity.

**32 integration tests against a real MongoDB** (`mongodb-memory-server`), not a
mocked driver — several assertions are about the database itself: the unique
index that makes numbering safe under concurrency, and the aggregation pipeline
behind the report. A mock would only prove the code calls the functions the test
author expected. They cover:

- every write path to a finalized document rejected, with the stored figures
  byte-identical afterwards
- duplicate producing an independently editable draft while the original stays
  frozen
- cross-user isolation on read, edit, delete, finalize and duplicate
- report totals matching the documents in range, boundary dates included, and
  currencies kept separate
- concurrent creation yielding distinct document numbers

---

## Assumptions

Documented as the brief asks, where it was ambiguous:

1. **Quantity ≥ 1**, as specified, with up to 3 decimal places above that floor
   — so `7.25` hours is a valid line. The engine independently rejects
   quantity ≤ 0, which is unreachable through the API by design: defence in
   depth for a shared module also used by the seed script.
2. **A fixed discount above its line subtotal is rejected**, not clamped
   (reasoning above). Exactly equal to the subtotal is allowed, giving a zero
   line.
3. **Percentages** allow 2 decimal places (`12.5%`); a *discount* percentage is
   capped at 100%, while tax is not (some jurisdictions exceed it).
4. **Issue date is a calendar date**, normalised to UTC midnight. A quote issued
   on 31 January in Dubai must land in January's report for a reviewer in
   London; a wall-clock timestamp would move documents between periods depending
   on who is looking.
5. **Report ranges are inclusive at both ends.** An exclusive upper bound is the
   classic source of "the last day of the month is missing from my report".
6. **Report sums are grouped by currency and never combined.** Adding AED to USD
   produces a number that means nothing.
7. **Currency is immutable after creation.** Changing it would reinterpret every
   stored minor-unit amount — 1000 fils is not 1000 cents. Duplicate into the
   new currency and re-enter prices deliberately.
8. **Finalized documents cannot be deleted**, so past-period reports stay
   stable.
9. **Line items are limited to 200** per document, keeping the embedded array
   and the 16 MB document ceiling comfortably bounded.
10. **Tax is a single per-line percentage.** No compound tax, withholding, or
    reverse charge — the brief states no tax knowledge is required.

---

## Tradeoffs

**Rate limiting is per-process.** On Vercel this counts per warm container, not
per deployment, so an attacker spreading requests across containers gets a
proportionally higher effective limit. It is still worth having — it costs
nothing and absorbs the runaway retry loops that cause most real incidents — but
the attack that actually matters, credential stuffing, is defended durably
instead by the MongoDB-backed account lockout. `src/lib/api/rate-limit.ts` is
the seam: swapping in Upstash Redis changes nothing else.

**Audit writes never block the user's action.** A failed audit write is logged
but does not roll back the change, because losing a customer's edit because the
log was briefly unwritable is the worse outcome. Under a compliance mandate this
inverts — the write joins the same transaction — and that is a decision to
revisit, not an oversight.

**Search uses escaped `$regex`, not a text index.** Correct and safe at this
scale, but it cannot use an index for a leading wildcard. Atlas Search is the
production answer.

**No multi-document transactions.** Embedding lines makes every document write
atomic on its own, so they are not needed today. Adding a general ledger would
change that.

**Storing computed amounts is denormalisation**, accepted knowingly for the two
reasons above, and made safe by the single-writer rule.

---

## What I would do before production

Roughly in order of what I would reach for first:

1. **Distributed rate limiting** (Upstash/Vercel KV) behind the existing
   interface, plus a WAF rule on the auth endpoints.
2. **Email verification and password reset.** Sign-up currently trusts the
   address. `tokenVersion` is already in place to invalidate sessions on reset.
3. **Observability** — ship the structured logs to a real sink, add traces
   around the pricing and aggregation paths, and alert on the totals-identity
   assertion firing, which should never happen and would be a genuine incident.
4. **PDF generation** server-side (React-PDF or a headless browser) rather than
   relying on the browser's print dialog, so the customer-facing artefact is
   byte-identical every time and can be attached to an email.
5. **Organisations and roles.** Today an account is a tenant. Real finance teams
   need shared workspaces with viewer/editor/approver roles — the `userId`-first
   index design anticipates this becoming `orgId`.
6. **Immutable numbering audit.** Document numbers are gapless per user; a
   compliance regime would want a tamper-evident chain (each finalized document
   hashing the previous one).
7. **Currency exchange rates**, so a multi-currency book can be reported in a
   single presentation currency with the rate and its date recorded on the
   document — never re-derived later.
8. **Load testing the report path** with realistic volumes, and adding a
   materialised monthly rollup if `$group` over a year of documents stops being
   fast enough.
9. **E2E tests in CI** (Playwright) over the finalize and duplicate flows, plus a
   CI pipeline running `npm run verify` on every PR.
10. **Accessibility audit with real assistive tech.** Focus management, labels
    and contrast were built in, but nothing substitutes for testing with a
    screen reader.
11. **Soft delete with retention** for drafts, instead of a hard `deleteOne`.
12. **Backups and restore rehearsal** — an untested backup is not a backup.

---

## Project layout

```
src/
├── lib/
│   ├── pricing/          ← the calculation engine. Pure, zero dependencies.
│   │   ├── money.ts        integer parsing, BigInt mul/div, half-up rounding
│   │   ├── calculate.ts    line + document totals, the totals identity
│   │   └── *.test.ts       66 unit tests
│   ├── db/               Mongoose models, indexes, cached connection
│   ├── auth/             bcrypt, JWT sessions
│   ├── api/              route wrapper, error envelope, rate limit, audit
│   ├── validation/       Zod schemas
│   ├── documents/        service (the only writer), queries, serialisation
│   └── reports/          aggregation pipelines, CSV
├── app/
│   ├── page.tsx          landing, with the 3D hero
│   ├── (auth)/           sign in / sign up
│   ├── (app)/            dashboard, documents, reports, activity, settings
│   ├── share/[token]/    public read-only document
│   └── api/              REST endpoints
├── components/           design system, landing, editor, reports
└── middleware.ts         edge session check on navigation
tests/                    integration tests against a real MongoDB
scripts/                  seed, local database
```
