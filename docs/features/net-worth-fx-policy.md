# Net Worth FX Policy

## Status

**Implemented and current as of RUM-002 (2026-09-21).** This document
previously described the policy *before*
`20260817120000_balance_fx_revaluation.sql` was applied, patched with a
"Superseded" callout rather than rewritten. RUM-002 rewrites it against the
deployed behavior — this is now the authoritative description, not a record
of a past policy plus an exception noted on top.

---

## Context

Net worth is a trust-critical number. In a multi-currency household, the app
must be explicit about whether balances are shown using historical
transaction rates or revalued market rates — and, separately, about exactly
what the net worth formula computes versus what it displays, since those
turned out to be two different questions (see
[performance-ux-backlog.md §3.3](../performance-ux-backlog.md) and RUM-002's
entry in
[performance-ux-execution-status.md](../performance-ux-execution-status.md)
for the discrepancy this caused and how it was resolved).

## FX policy: stocks revalue, flows don't

The policy draws a stock/flow distinction, applied consistently across every
`get_account_balances`-family RPC and the shared
`src/lib/net-worth/valuation.ts` service that now consumes their output:

- **Stocks — account balances at a date.** Revalued at the exchange rate in
  effect on that date. If the household has no usable rate on file for a
  currency pair as of that date, the balance falls back to the historical
  per-entry sum (the rate each movement was actually booked at, blended) —
  never to an error or a zero.
- **Flows — income, expenses, budget lines.** Keep the rate of their own
  transaction date, unchanged by this policy. A March expense reports at
  March's rate whether you view it in March or in September.

This means a foreign-currency account's balance on `/dashboard/net-worth`,
`/dashboard`, and `/dashboard/accounts` can differ slightly month to month
purely from FX movement, even with no new transactions — that's the point:
it's a real, current-market valuation of what you hold, not a frozen
historical sum. Reports and budgets, which read flows, are unaffected and
report exactly as they always have.

### Where this lives

- `public.get_account_balances(p_household_id, p_as_of_date)` and
  `public.get_account_balances_as_of_many(p_household_id, p_as_of_dates,
  p_include_archived)` — both revalue via `get_exchange_rate_as_of`, falling
  back to the stored historical sum when no rate is on file. Migration:
  `supabase/migrations/20260817120000_balance_fx_revaluation.sql`.
- `src/lib/net-worth/valuation.ts` — the one shared assets/liabilities/net
  worth formula (RUM-002). It does not itself convert currency; every row it
  sums is already in base currency by the time it reaches this module, via
  the RPCs above. Population (which accounts, `include_in_net_worth` or not)
  stays the caller's decision — see that module's own header for why.

### Archived accounts

`get_account_balances_as_of_many` excludes archived accounts by default
(`p_include_archived = false`) — this is BR-004, unchanged by the FX policy
above and confirmed still in effect. Archived accounts remain visible on the
Accounts page's own archived view; they never contribute to net worth,
current or historical.

### Investment accounts

No special-casing exists or is needed: `account_class` is a hard
`check (in ('asset', 'liability'))` constraint
(`supabase/migrations/20260601000200_accounts_categories.sql`). An investment
account is `account_class = 'asset'` and is summed exactly like any other
asset account, revalued the same way as a plain cash account in a foreign
currency.

### User-Facing Copy

`src/app/dashboard/net-worth/page.tsx` shows an informational callout
describing this policy in plain language:

```text
Account balances are revalued at the exchange rate in effect on the
selected date, falling back to each entry's own historical rate only
when your household has no rate on file for that currency pair.
```

(This replaces an older callout that claimed the opposite — no revaluation,
ever — which was accurate before the migration above and stale after it.
RUM-002 corrected it; see the execution status doc for the finding.)

### Displayed "Liabilities" is a magnitude, not a net-worth term

Separate from FX, and the actual root cause of the §3.3 discrepancy this
document used to leave unexplained: the "Liabilities" figure shown on
`/dashboard`, `/dashboard/net-worth`, and (per-account) `/dashboard/accounts`
is `max(0, -balance)` — how much is owed, never negative. It is **not** the
term the net worth formula subtracts. The formula is
`netWorth = totalAssets + signedLiabilities`, using the raw signed balance
(negative when owed, positive when the household is in credit on that
liability). A liability with a favorable balance — an overpaid credit card —
correctly adds its credit to net worth while showing `$0` in the displayed
Liabilities figure, because a credit isn't debt; it just isn't the negative
number a naive "Assets − Liabilities" would expect either. Both numbers are
correct; they answer different questions. See
`src/lib/net-worth/valuation.ts`'s module header and its
`getDisplayedLiabilityBalance`/`computeValuation` functions for the
authoritative implementation, and the Liabilities tooltip on
`/dashboard`/`/dashboard/net-worth` for the user-facing explanation.

### "Total balance" (Accounts) vs "Net worth" (Dashboard, Net worth)

These are deliberately different numbers, not a reconciliation bug. Net
worth only counts accounts the household has opted into it
(`include_in_net_worth = true`). Accounts' "Total balance" sums every
account the screen is currently displaying (respecting only the
archived/active toggle), `include_in_net_worth` or not — it answers "what
does this screen show", not "what is my net worth". Both are already
labeled differently in the UI ("Total balance" vs "Net worth"). A household
with no accounts excluded from net worth will see these numbers match; one
with such an account should expect them not to, by design.

---

## Verification

1. Create or use a non-base-currency account with posted entries.
2. Open `/dashboard/net-worth` and confirm the FX policy callout describes
   revaluation (not "does not revalue").
3. Archive an included account that has historical posted entries.
4. Confirm `/dashboard/net-worth?month=YYYY-MM` no longer includes that
   archived account in assets, liabilities, or monthly evolution.
5. Confirm the Accounts page can still show the archived account when
   `showArchived=true`.
6. Give a liability account (e.g. a credit card) a favorable/credit balance.
   Confirm: it still adds to net worth on `/dashboard` and
   `/dashboard/net-worth`; the displayed Liabilities figure does not go
   negative; the Accounts screen shows `$0` owed for it, not the credit
   amount as a false debt (the RUM-002 sign-bug fix).
7. Confirm Net worth and Dashboard report the same net worth, assets, and
   liabilities for the same household/month; confirm Accounts' "Total
   balance" is allowed to differ when an account is excluded from net worth,
   and is clearly labeled as a different figure.
