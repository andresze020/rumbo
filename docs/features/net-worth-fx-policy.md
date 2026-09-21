# Net Worth FX Policy

## Status

**Implemented.**
Migration `20260614000100_br_004_exclude_archived_as_of_balances.sql` updates
historical/as-of account balances to exclude archived accounts. No net-new table
is introduced.

> **Superseded 2026-08-17 — this doc describes the policy before
> `20260817120000_balance_fx_revaluation.sql`.** That migration (applied) draws
> a stock/flow distinction: an **account balance at a date** is now revalued at
> the rate in effect on that date, falling back to the historical per-entry sum
> only when the household has no usable rate for the pair. **Flows** (income,
> expense, budget lines) still keep the rate of their own transaction date, so
> reports and budgets read exactly as before. The migration header is the
> authoritative description. The sections below are kept as the record of the
> earlier policy and of the BR-004 archived-account rule, which still holds.
> Rewriting this doc against the deployed behavior is a deliverable of RUM-002
> ([performance-ux-backlog.md](../performance-ux-backlog.md)).

Net worth uses each ledger entry's stored historical `exchange_rate_to_base`.
Foreign-currency balances are not revalued with month-end market rates yet.

---

## Context

Net worth is a trust-critical number. In a multi-currency household, the app must
be explicit about whether balances are shown using historical transaction rates
or revalued market rates.

The current policy is intentionally conservative:

- Ledger entries keep their stored historical FX rate.
- Net worth sums the stored base-currency amounts from those entries.
- The UI tells users that month-end FX revaluation is not implemented yet.
- Archived accounts are excluded from current and historical net-worth totals.

This avoids implying market revaluation precision that the app does not yet
perform.

---

## Architecture

### Stored Historical FX

`transaction_entries.amount_base_currency` is calculated when the ledger entry is
created and remains the source of truth for balance and net-worth summaries.

For CSV import, BR-001 now resolves that stored rate through
`get_exchange_rate(...)`. Manual transactions and transfers still use the
submitted rate captured at entry time.

### Archived Accounts

The as-of RPC:

```sql
public.get_account_balances(p_household_id uuid, p_as_of_date date)
```

now filters:

```sql
a.is_archived = false
```

That brings historical net-worth behavior in line with current account summaries:
archived accounts remain available on the Accounts page history view, but they do
not affect Net Worth totals.

### User-Facing Copy

`src/app/dashboard/net-worth/page.tsx` shows an informational callout:

```text
Net worth uses each ledger entry's stored historical exchange rate. It does not
revalue foreign-currency balances with month-end market rates yet.
```

---

## Verification

1. Create or use a non-base-currency account with posted entries.
2. Open `/dashboard/net-worth` and confirm the FX policy callout is visible.
3. Archive an included account that has historical posted entries.
4. Confirm `/dashboard/net-worth?month=YYYY-MM` no longer includes that archived
   account in assets, liabilities, or monthly evolution.
5. Confirm the Accounts page can still show the archived account when
   `showArchived=true`.
