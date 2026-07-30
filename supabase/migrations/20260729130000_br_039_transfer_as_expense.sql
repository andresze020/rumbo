-- ============================================================
-- App Finanzas — br_039_transfer_as_expense.sql
-- BR-039: per-account "count transfers into this account as expense".
-- ------------------------------------------------------------
-- The question this settles is "am I actually saving?" versus "what did I
-- spend?". A transfer into a savings or investment account is balance-neutral,
-- so it never shows up as expense — which is correct for the ledger and
-- unhelpful for a spending report where the money is, in the household's own
-- terms, gone.
--
-- This is a REPORTING-ONLY flag. Nothing in this migration touches the ledger:
--   * transfers keep two balancing entries and stay balance-neutral,
--   * `transaction_allocations` is untouched, so budgets and every
--     category-driven figure are unaffected,
--   * account balances and net worth are unchanged.
-- The flag is read by /dashboard/reports (and the BR-037 calendar view, which
-- shares the same query) to add the inflow leg of a flagged transfer to the
-- expense side of the report. See src/lib/analysis/report-query.ts.
--
-- Eligibility is constrained the way App B constrains it: only savings,
-- investment and other accounts may carry the flag. On cash, checking, a credit
-- card or a debt account "a transfer is an expense" is simply wrong — money
-- moved between spending accounts was not spent, and a card payment is a debt
-- settlement, not consumption.
--
-- ADDITIVE: the column defaults to false, so every existing account and every
-- existing report is unchanged until someone opts an account in.
--
-- Depends on: public.accounts.
-- ============================================================

alter table public.accounts
  add column if not exists treat_transfers_as_expense boolean not null default false;

comment on column public.accounts.treat_transfers_as_expense is
  'BR-039: reporting-only. When true, transfers INTO this account are counted as expense by the reporting queries. Never affects the ledger, balances, net worth or budgets.';

-- Enforced in the database as well as the UI: the flag is meaningless (and
-- misleading) outside savings/investment/other.
alter table public.accounts
  drop constraint if exists accounts_transfer_as_expense_type_chk;

alter table public.accounts
  add constraint accounts_transfer_as_expense_type_chk
  check (
    treat_transfers_as_expense = false
    or account_type in ('savings', 'investment', 'other')
  );

-- Reports resolve the flagged accounts for a household on every load.
create index if not exists idx_accounts_household_transfer_as_expense
  on public.accounts(household_id)
  where treat_transfers_as_expense = true;
