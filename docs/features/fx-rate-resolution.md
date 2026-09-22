# FX Rate Resolution (transaction-entry forms)

## Status

**Implemented as of RUM-003 (2026-09-22).**

## Context

This document covers a different layer than
[`net-worth-fx-policy.md`](./net-worth-fx-policy.md): that one describes how
*account balances* are revalued for display (server-side, via
`get_exchange_rate_as_of`). This one describes how a *transaction entry's*
own historical rate is looked up and suggested to the user, client-side, in
`src/lib/fx.ts` — consumed by every form that records a foreign-currency
amount: new/edit transaction, transfer edit, new debt, balance adjustment,
opening balance.

RUM-003 found that `fetchFxRate` silently substituted today's rate
(`'latest'`) whenever the CDN provider (`@fawazahmed0/currency-api`) had no
file for the requested historical date — with no logging anywhere, and
exposed to callers only as a soft `isLatest: boolean`. Worse: all five forms
using it rendered the exact same note in that case —
*"No rate available for future dates — using latest market rate."* — **even
when the date was not future at all**, i.e. even on a genuine historical
data gap. The message was actively wrong for the one case it most needed to
be right about.

## The fix

`FxResult`'s success variants now carry a `source` instead of `isLatest`:

- `'requested'` — the rate is for the exact date asked for.
- `'future'` — the date is after today; using `'latest'` is expected, not a
  failure.
- `'fallback'` — the date was valid (today or earlier) but had no rate on
  file, so `'latest'` was substituted. This is the case that used to be
  silent.

Every result also carries `requestedDate`, so a fallback note can say what
was actually asked for, not just what was returned.

A `'fallback'` or a total failure now logs via `console.error` (currency
pair + requested date, no PII) — the practical ceiling of "traceable"
without new telemetry infra, which RUM-001 already scoped as a separate,
future item (B-5, server-side observability).

`describeFxNote(result)` (exported from `fx.ts`) is the single place that
turns a result into user-facing copy, replacing five independent
copy-pasted (and, for the fallback case, wrong) strings in
`transaction-form.tsx`, `transfer-edit-form.tsx`, `debt-create-form.tsx`,
`balance-adjustment-form.tsx`, and `opening-balance-form.tsx`.

## What "reproducible" means here

Once a rate is saved into `transaction_entries.exchange_rate_to_base`, it is
frozen — reproducibility was never at risk for a saved record. The actual
risk this ticket closes is a **suggestion** risk: a user re-opening a form
could be shown today's rate silently mislabeled as if the historical lookup
had simply worked, and trust it without noticing. `source: 'fallback'` makes
that visible and asks the user to verify before saving, instead of hiding it
behind a future-dates message that didn't apply.

## Rounding: no decimal type needed

Folded in here because both are about numeric trust in these same forms.
RUM-003 evaluated whether Rumbo needs a JS arbitrary-precision decimal
library (`decimal.js`/`big.js`) and found no evidence it does:

- Every money- or rate-bearing column in the schema is already Postgres
  `numeric(18,4)` (amounts) or `numeric(18,8)` (rates) — never
  `float`/`double precision`. Aggregation in SQL is already exact.
- Every JS-side sum in this codebase is over a small, bounded number of
  household-scale amounts — well within what an IEEE-754 double represents
  exactly.
- The one real gap found was duplication, not imprecision: `roundToCents`
  existed twice — once in `calc.ts` (the keypad expression evaluator, an
  unrelated file it happened to also export from) and once, privately and
  slightly differently (missing a `Number.EPSILON` guard), in
  `installments/shared.ts`. Both now import the single copy in
  `src/lib/money.ts`.

No decimal library was added. If a future ticket finds a concrete rounding
discrepancy this doesn't cover, that's new evidence to revisit this
decision against — not a reason to pre-emptively adopt one now.

## Verification

1. In a transaction/transfer/debt/balance-adjustment/opening-balance form,
   pick a foreign-currency account and a date in the future. Confirm the
   note explains the future-date case, not a data gap.
2. Pick a past date. If the provider has a file for it, confirm the note
   states the exact date with no fallback language. (Forcing the
   `'fallback'` branch requires a date the provider genuinely lacks, or a
   mocked/offline provider — covered instead by `src/lib/fx.test.ts`'s
   `source: 'fallback'` case.)
3. `src/lib/fx.test.ts` covers all four `FxResult` branches plus
   `fetchDirectRate`'s same-currency short-circuit and reverse-pair
   inversion.
