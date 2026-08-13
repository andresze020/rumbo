-- ============================================================
-- App Finanzas — BR-040 refund money invariants
-- ------------------------------------------------------------
-- Lightweight checks in the same style as
-- `br_003_006_money_invariants.sql`: replace `__HOUSEHOLD_ID__` with a real
-- household id and run in the Supabase SQL editor. Every row must report
-- `passed = true`.
--
-- BR-040 allows a NEGATIVE `transaction_allocations` amount, which was
-- previously forbidden outright. These checks guard the narrow shape that was
-- deliberately permitted, so the relaxation cannot quietly widen.
-- ============================================================

-- 1. A negative allocation only ever appears as an `expense`. This is the whole
--    scope of the relaxation; income / financial / adjustment kept their strict
--    positivity, and the CHECK enforces it — this catches a future migration
--    loosening it by accident.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'BR-040 negative allocations are expense-only' as check_name,
  not exists (
    select 1
    from public.transaction_allocations ta
    where ta.household_id = (select household_id from params)
      and ta.allocation_type <> 'expense'
      and (ta.amount_original_currency < 0 or ta.amount_base_currency < 0)
  ) as passed;

-- 2. No allocation is zero. The original constraints implied this via `> 0`; the
--    narrowed ones say `<> 0` for expenses, so it is worth asserting directly.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'BR-040 no allocation is zero' as check_name,
  not exists (
    select 1
    from public.transaction_allocations ta
    where ta.household_id = (select household_id from params)
      and (ta.amount_original_currency = 0 or ta.amount_base_currency = 0)
  ) as passed;

-- 3. A refund's entry is positive: money comes back into the account. This is
--    what makes it impossible for a refund to fabricate a negative balance.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'BR-040 refund entries are positive' as check_name,
  not exists (
    select 1
    from public.transaction_entries te
    join public.transactions t
      on t.id = te.transaction_id
      and t.household_id = te.household_id
    where te.household_id = (select household_id from params)
      and t.transaction_type = 'refund'
      and te.amount_account_currency <= 0
  ) as passed;

-- 4. A refund's allocation is negative and in an expense category, so the
--    category nets down rather than up.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'BR-040 refund allocations are negative expenses' as check_name,
  not exists (
    select 1
    from public.transaction_allocations ta
    join public.transactions t
      on t.id = ta.transaction_id
      and t.household_id = ta.household_id
    where ta.household_id = (select household_id from params)
      and t.transaction_type = 'refund'
      and (ta.allocation_type <> 'expense' or ta.amount_base_currency >= 0)
  ) as passed;

-- 5. A linked refund never exceeds the expense it refunds. `create_refund_transaction`
--    enforces this at write time; this catches data arriving by any other route.
--    Sums are per original transaction: the expense is positive, its refunds are
--    negative, so the total must not go below zero.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
originals as (
  select
    t.refunded_transaction_id as original_id,
    sum(ta.amount_base_currency) as refunded_base
  from public.transactions t
  join public.transaction_allocations ta
    on ta.transaction_id = t.id
    and ta.household_id = t.household_id
  where t.household_id = (select household_id from params)
    and t.transaction_type = 'refund'
    and t.refunded_transaction_id is not null
    and t.status = 'posted'
    and t.deleted_at is null
  group by t.refunded_transaction_id
),
expenses as (
  select
    ta.transaction_id as original_id,
    sum(ta.amount_base_currency) as expense_base
  from public.transaction_allocations ta
  join public.transactions t
    on t.id = ta.transaction_id
    and t.household_id = ta.household_id
  where ta.household_id = (select household_id from params)
    and ta.allocation_type = 'expense'
    and t.status = 'posted'
    and t.deleted_at is null
  group by ta.transaction_id
)
select
  'BR-040 refunds never exceed the expense they refund' as check_name,
  not exists (
    select 1
    from originals o
    join expenses e on e.original_id = o.original_id
    where (e.expense_base + o.refunded_base) < 0
  ) as passed;
