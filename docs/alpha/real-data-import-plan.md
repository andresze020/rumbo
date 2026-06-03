# Real Data Import Plan

> Documentation only. This describes **how to use the existing app** to bring in real
> data. It does not change any import logic, schema, or calculations.

## Recommended strategy (summary)

Import in **small, verifiable slices**, newest-first, reconciling after each slice:

1. Create real accounts.
2. Choose a single **cutoff date**.
3. Set **opening balances** at that cutoff date.
4. Import **one recent month** of transactions.
5. **Reconcile** against AndroMoney / current records.
6. Only then import more history, one period at a time.

Reconcile after every step. Never import a second batch until the previous one
balances.

## Why not import the full historical dataset first

Importing years of history in one shot is the highest-risk, hardest-to-debug path:

- **Errors compound and hide.** A mapping mistake (wrong sign, wrong column, wrong
  account) repeats across thousands of rows, and a single wrong opening balance throws
  off every downstream balance. With one month, the error surface is tiny.
- **Reconciliation becomes impossible.** If the net worth is off by $213.47 across
  6 years, you cannot find the cause. Across one month with ~30 rows, you can.
- **Duplicates are catastrophic at scale.** A duplicated import over years silently
  doubles activity; over one month it is obvious.
- **Currency/FX assumptions are easier to validate small.** CAD/USD/COP handling and
  exchange rates should be proven on a handful of rows first.
- **Rollback is cheap when small.** Undoing one bad month is manageable; unwinding a
  full-history import is not.

Get the workflow correct on one month, then scale with confidence.

## Step 1 — Create real accounts

Create every account you actively use, with correct type, class, and currency. See the
[Account setup checklist](#account-setup-checklist) below.

Do this **before** any import so the CSV can map to real accounts (or a default target
account).

## Step 2 — Choose a cutoff date

Pick **one** cutoff date that becomes the boundary between "opening balance" (history
before) and "imported transactions" (activity after). Recommendations:

- Use a **month start** (e.g. the 1st) for a clean monthly boundary.
- Prefer a date where you have a **reliable statement/snapshot** of every account
  balance (bank/credit-card statement close, or an AndroMoney snapshot).
- The cutoff should be recent enough that the first imported month is the month right
  after it.

Write the chosen cutoff date down; it is referenced by opening balances and
reconciliation.

## Step 3 — Set opening balances at the cutoff date

For each account, set the opening balance **as of the cutoff date**:

- Use the account's actual balance from the statement/snapshot at that date.
- For **asset** accounts (cash, checking, savings, investment), enter the positive
  balance held.
- For **liability** accounts (credit cards, debts), enter what you owe. The app stores
  liabilities as negative internally and displays them as positive amounts owed; enter
  the owed amount as the page instructs.
- Set the **opening balance date** to the cutoff date, not today.
- For non-base-currency accounts, set the **exchange rate to base** appropriately for
  the cutoff date (see [currency notes](#currency-notes-cad--usd--cop)).

After this step, with no transactions yet imported, each account's posted balance
should equal its opening balance. Verify that before importing anything.

## Step 4 — Import one recent month first

Import the **single most recent full month** after the cutoff:

- Export/prepare a CSV from AndroMoney (or your bank) for that one month only.
- Use the in-app CSV import: upload → map columns → preview/validate → confirm.
- Required mappings: **date, amount, description**. Map **account** if present,
  otherwise choose a **default target account**.
- Review the preview counts (valid / invalid / duplicate) before confirming. Only
  valid rows post; invalid and duplicate rows are logged, not posted.
- Note the import **batch id** shown after import (useful for reference and rollback).

See the [CSV import checklist](#csv-import-checklist) below.

## Step 5 — Reconcile balances against AndroMoney / current records

Before importing anything else, reconcile the imported month using
[reconciliation-checklist.md](./reconciliation-checklist.md):

- Each account's posted balance = opening balance ± that month's posted activity.
- Compare against AndroMoney/bank end-of-month balances within tolerance.
- Check dashboard income/expenses/savings for the month.
- Check budgets actuals, debts, and net worth.

If anything is off, fix the **input** (re-map, correct opening balance, remove a bad
batch) — do not change app logic. Re-reconcile until it matches.

## Step 6 — Only then import more history

Once the first month reconciles cleanly:

- Import **one earlier period at a time** (month by month, or quarter by quarter).
- Reconcile after each batch.
- Keep each CSV scoped to a single account or a single period to keep errors findable.
- Stop importing history at the point where older data is no longer worth the effort.

## Account setup checklist

- [ ] Listed every real account currently in use (cash, checking, savings, credit
      cards, debts, investments).
- [ ] Each account has the correct **type**.
- [ ] Each account has the correct **class** (asset vs. liability).
- [ ] Each account has the correct **currency** (CAD / USD / COP / other).
- [ ] `include_in_net_worth` set correctly per account.
- [ ] Institution name / last four added where helpful for identification.
- [ ] (Optional) color/icon set for quick visual identification.
- [ ] Cutoff date chosen and recorded.
- [ ] Opening balance + opening balance date set for every account at the cutoff.
- [ ] With zero transactions imported, every posted balance equals its opening balance.

## CSV import checklist

- [ ] CSV scoped to **one month** (and ideally one account) for the first import.
- [ ] File has a header row and at least one data row.
- [ ] Encoding is UTF-8; delimiters/decimal separators look correct in preview.
- [ ] Required columns mapped: **date, amount, description**.
- [ ] Account mapped, **or** a default target account selected.
- [ ] Currency mapped/consistent with the target account.
- [ ] Amount **sign convention** verified (expenses negative / income positive, or as
      your CSV encodes it) on a few preview rows.
- [ ] Dates parse correctly (check year/month/day order in preview).
- [ ] Preview counts reviewed: valid vs. invalid vs. duplicate.
- [ ] Spot-checked a few valid rows for correct account, amount, and date.
- [ ] Import confirmed; **batch id recorded**.
- [ ] Post-import balance reconciled before importing anything else.

## Rollback / recovery notes if an import goes wrong

The app is the only thing that should mutate data; do **not** hand-edit the database.
If an import is wrong:

- **Stop.** Do not import more on top of a bad batch — it makes diagnosis harder.
- **Identify the batch.** Use the recorded import batch id and the transaction
  filters (source = CSV import, the month in question) to find affected rows.
- **Reverse via the app's existing flows only.** Use the supported actions (e.g.
  voiding transactions) rather than any destructive/DB-level operation. Do not run SQL,
  migrations, or Supabase write commands.
- **Re-verify opening balances.** A surprising number of "import" errors are actually
  a wrong opening balance or wrong cutoff date.
- **Fix the source CSV** (mapping, signs, account, dates) and re-import the corrected
  month.
- **Reconcile again** before proceeding.
- If state becomes confusing, the safest reset for Alpha is to correct the inputs and
  re-reconcile — capture what went wrong in
  [bug-friction-log.md](./bug-friction-log.md) so the import UX can be improved later.

## Notes for specific account types

### Credit cards
- Class = **liability**; the opening balance is what you **owe** at the cutoff.
- A purchase increases what you owe; a payment decreases it. Verify the sign
  convention on a few preview rows before bulk import.
- A credit-card **payment** is a transfer from an asset account to the card, not an
  expense. Record it as a transfer / debt payment, not a categorized expense, so it
  does not inflate spending.

### Debts
- Linked to a liability account; opening balance = current outstanding at the cutoff.
- Record **principal payments** through the debt payment flow so paydown and balances
  stay correct; principal payments are not expenses.
- Set `original_principal`, interest, minimum payment, and due day as metadata for
  tracking (these are reference fields, not calculations to reconcile to the cent).

### Cash
- Class = **asset**. Cash is the easiest to drift from reality.
- Set a realistic opening cash balance at the cutoff; expect small tolerance and
  reconcile to your own count, not to a bank statement.

### Investments
- Class = **asset**. For Alpha, treat the account balance as the cash/market value you
  record manually; this MVP does not track holdings/positions or live prices.
- Reconcile to the statement value at the cutoff and month-end; expect market movement
  to explain differences, not bugs.

### Currency notes (CAD / USD / COP)
- Each account has a single currency. Balances display in the account currency and are
  also converted to the household **base currency** for net worth/dashboard.
- Set the **exchange rate to base** when setting opening balances / importing for
  non-base-currency accounts.
- **Cross-currency transfers are not supported** in the MVP — do not try to transfer
  directly between accounts of different currencies; model it the way you already do in
  your current records and log the friction if it matters.
- When reconciling multi-currency net worth, differences are often just FX rate choice;
  confirm the rate before assuming a bug.

## Related documents

- [sprint-12-alpha-plan.md](./sprint-12-alpha-plan.md)
- [reconciliation-checklist.md](./reconciliation-checklist.md)
- [bug-friction-log.md](./bug-friction-log.md)
