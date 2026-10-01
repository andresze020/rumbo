-- ============================================================
-- Rumbo — BR-043 budget payment split invariants
-- ------------------------------------------------------------
-- Same style as `br_040_refund_invariants.sql`: replace `__HOUSEHOLD_ID__`
-- and every row must report `passed = true`. Calls get_budget_payment_split,
-- which is is_household_member()-gated: under `npm run db:test`, pass
-- `--user=<a member's uuid>`.
--
-- Checked for every month that has a budget.
-- ============================================================

-- 1. The three buckets add up to the budget's own Total spent.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
budget_months as (
  select b.budget_month
  from public.budgets b
  where b.household_id = (select household_id from params)
    and b.deleted_at is null
)
select
  'BR-043 payment split sums to the budget total spent' as check_name,
  not exists (
    select 1
    from budget_months bm
    where abs(
      (select coalesce(sum(s.actual_amount), 0)
       from public.get_budget_payment_split((select household_id from params), bm.budget_month) s)
      -
      (select coalesce(sum(d.actual_amount), 0)
       from public.get_monthly_budget_details((select household_id from params), bm.budget_month) d
       where d.line_id is not null)
    ) > 0.005
  ) as passed;

-- 2. `other` holds only spend from transactions with no entry at all on a cash
--    account or a card. Stated over ALL of a transaction's entries rather than
--    the one the function picks, so it does not re-implement the attribution.
--    A refund credited to a card or checking account must net that bucket, not
--    land in `other` as a negative amount (the 2026-09-30 finding).
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
budget_months as (
  select b.id as budget_id, b.budget_month
  from public.budgets b
  where b.household_id = (select household_id from params)
    and b.deleted_at is null
),
actuals as (
  select bm.budget_month, ta.transaction_id, ta.amount_base_currency
  from budget_months bm
  join public.budget_lines bl
    on bl.budget_id = bm.budget_id
    and bl.deleted_at is null
    and bl.category_id is not null
  join public.transaction_allocations ta
    on ta.household_id = (select household_id from params)
    and ta.category_id = bl.category_id
  join public.transactions t
    on t.id = ta.transaction_id
    and t.household_id = ta.household_id
  join public.categories ac
    on ac.id = ta.category_id
    and ac.household_id = ta.household_id
    and ac.deleted_at is null
  left join public.categories pc
    on pc.id = ac.parent_category_id
    and pc.household_id = ac.household_id
    and pc.deleted_at is null
  where ta.allocation_type = 'expense'
    and t.status = 'posted'
    and t.deleted_at is null
    and t.transaction_date >= bm.budget_month
    and t.transaction_date < (bm.budget_month + interval '1 month')
    and ac.exclude_from_reports = false
    and coalesce(pc.exclude_from_reports, false) = false
),
expected_other as (
  select a.budget_month, sum(a.amount_base_currency) as amount
  from actuals a
  where not exists (
    select 1
    from public.transaction_entries te
    join public.accounts acc
      on acc.id = te.account_id
    where te.transaction_id = a.transaction_id
      and acc.account_type in ('cash', 'checking', 'savings', 'credit_card', 'debt')
  )
  group by a.budget_month
)
select
  'BR-043 "other" holds only spend paid from neither a cash account nor a card' as check_name,
  not exists (
    select 1
    from budget_months bm
    cross join lateral public.get_budget_payment_split(
      (select household_id from params), bm.budget_month
    ) s
    left join expected_other e
      on e.budget_month = bm.budget_month
    where s.payment_group = 'other'
      and abs(s.actual_amount - coalesce(e.amount, 0)) > 0.005
  ) as passed;
