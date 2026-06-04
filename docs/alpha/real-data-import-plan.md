# Real Data Import Plan

> Documentation only. This describes **how to use the existing app** to bring in real data. It does not replace reconciliation. Updated after Sprints 12.4 and 12.5.

## Recommended strategy

Import or enter data in **small, verifiable slices**, newest-first, reconciling after each slice:

1. Create real accounts.
2. Choose a single **cutoff date**.
3. Set **opening balances** at that cutoff date.
4. Import or enter **one recent month** of transactions.
5. **Reconcile** against AndroMoney / current records.
6. Only then import more history, one period at a time.

Reconcile after every step. Never import a second batch until the previous one balances.

## Sprint 12.4/12.5 implementation notes that affect import/setup

- Mobile opening balance input now supports typed negative values (`BF-002`, fixed in `v0.12.4`).
- Liability balances are still stored as signed ledger values, but displayed as absolute owed amounts for clarity (`BF-003`, fixed in `v0.12.4`).
- Multi-currency forms now use a user-facing **base→account** exchange-rate convention, e.g. `1 CAD = X COP` (`BF-001`, fixed in `v0.12.5`).
- Transaction, opening-balance, and debt creation forms now auto-fetch FX rates through `src/lib/fx.ts` and allow manual refresh/fallback (`BF-001`, fixed in `v0.12.5`).
- Debt opening balances now pass `p_exchange_rate_to_base` to `create_debt_with_account`; they no longer default to exchange rate = 1 for non-base-currency debts (`BF-001 debt data`, fixed in `v0.12.5`).

## Why not import the full historical dataset first

Importing years of history in one shot is high-risk:

- Errors compound and hide.
- Reconciliation becomes difficult.
- Duplicates are catastrophic at scale.
- Currency/FX assumptions are easier to validate on a small sample.
- Rollback/recovery is much easier with one small period.

Get the workflow correct on one period, then scale with confidence.

## Step 1 — Create real accounts

Create every account you actively use, with correct type, class, currency, and net-worth inclusion.

Use this checklist:

- [ ] Listed every real active account.
- [ ] Correct account type.
- [ ] Correct account class: asset vs liability.
- [ ] Correct account currency.
- [ ] Correct `include_in_net_worth` flag.
- [ ] Institution/last four added where useful.
- [ ] Color/icon added where useful.
- [ ] Cutoff date chosen and recorded.
- [ ] Opening balance + opening balance date set for every account.
- [ ] With no imported activity after the cutoff, each posted balance matches the intended opening balance.

## Step 2 — Choose a cutoff date

Pick **one** cutoff date that separates “opening balance/history before” from “transactions after.”

Recommendations:

- Use a month start if possible.
- Prefer a date with reliable statements/snapshots for every account.
- Do not set today's balance as opening balance and then import transactions before today unless you deliberately reset the cutoff logic.

## Step 3 — Set opening balances at cutoff

For each account:

- Asset accounts: enter the balance held.
- Liability accounts: enter the amount owed as the UI instructs; the app displays it as “owed” while the ledger remains signed internally.
- Non-base-currency accounts: use the fetched base→account rate or manually enter the rate if fetch fails.

### FX convention after Sprint 12.5

User-facing input:

```text
1 {household_base_currency} = X {account_currency}
```

Example:

```text
1 CAD = 2690 COP
```

Server-side behavior:

```text
exchange_rate_to_base = 1 / rate_base_to_account
amount_base_currency = amount_account_currency × exchange_rate_to_base
```

Do not manually invert the rate in the UI. Enter the intuitive base→account value shown by the form.

## Step 4 — Import one recent month first

Import the **single most recent full month** after the cutoff:

- Use a CSV scoped to one month, and ideally one account for the first test.
- Required mappings: date, amount, description.
- Map account if present, otherwise use a default target account.
- Confirm amount sign convention in preview.
- Confirm date parsing.
- Review valid/invalid/duplicate counts.
- Record the import batch id if shown.

## Step 5 — Reconcile before continuing

Use [reconciliation-checklist.md](./reconciliation-checklist.md).

Minimum checks:

- Account posted balances.
- Liability owed balances.
- Non-base-currency base conversion.
- Debt balances.
- Dashboard income/expenses/savings.
- Budget actuals.
- Net worth.
- CSV row counts.

If anything is off, stop and fix inputs before importing more.

## Step 6 — Only then import more history

Once the first period reconciles cleanly:

- Import one earlier period at a time.
- Reconcile after each batch.
- Stop importing old history when the value no longer justifies the effort.

## Notes for specific account types

### Credit cards

- Class = liability.
- Opening balance = amount owed at cutoff.
- Purchases increase amount owed; payments decrease it.
- Credit-card payments should be transfers/debt payments, not operating expenses.

### Debts

- Linked to a liability account.
- Opening balance = outstanding amount owed at cutoff.
- After Sprint 12.5, non-base-currency debt opening balances should convert correctly using the provided exchange rate.
- Validate debt base-currency value in net worth after creation.

### Cash

- Class = asset.
- Negative Cash balance is currently possible but may be confusing (`BF-005`, open).
- Do not assume the app auto-converts Cash to liability. If the negative value represents money owed, prefer creating a debt/liability account.

### Investments

- Class = asset.
- For Alpha, treat balance as manually recorded market/cash value; this MVP does not track holdings or live prices.

### Currency notes — CAD / USD / COP

- Each account has one currency.
- Household has one base currency.
- Account-currency balances display in account currency; consolidated reports use base currency.
- After Sprint 12.5, enter rates in base→account direction.
- Cross-currency transfers remain outside the MVP unless explicitly implemented later.

## Rollback / recovery notes if import goes wrong

- Stop; do not import more on top of a bad batch.
- Identify the batch.
- Use app-supported flows only; do not hand-edit DB records.
- Re-check opening balances and FX rates.
- Fix source CSV/mapping and re-import the corrected period.
- Log the issue in [bug-friction-log.md](./bug-friction-log.md).

## Related documents

- [sprint-12-alpha-plan.md](./sprint-12-alpha-plan.md)
- [reconciliation-checklist.md](./reconciliation-checklist.md)
- [bug-friction-log.md](./bug-friction-log.md)
