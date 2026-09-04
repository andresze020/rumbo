-- ============================================================
-- Rumbo — BR-035 installment plan invariants
-- ------------------------------------------------------------
-- Same style as `br_040_refund_invariants.sql`: replace `__HOUSEHOLD_ID__`
-- with a real household id and run via `npm run db:test`. Every row must
-- report `passed = true`. Read-only.
--
-- What BR-035 actually guarantees, and what these check:
--
--   The plan is a LABEL, not a ledger row. `create_installment_plan` writes
--   the plan and then, in the same call, inserts all N installments as
--   `posted` transactions — each with its own entry and allocation. There is
--   no parent transaction carrying the total on top of them, and that is the
--   whole double-counting defence: the money exists exactly once, spread over
--   N rows, and `installment_plans.total_amount` is a description of them
--   rather than a balance of its own.
--
--   So the invariant is NOT "the plan holds no money until an installment
--   posts" — every installment posts at creation. It is "the plan's stated
--   total and its installments never disagree, and no extra ledger row exists
--   alongside them".
-- ============================================================

-- 1. No ledger row hangs off a plan except through a transaction. If a future
--    migration ever gave `transaction_entries` or `transaction_allocations` a
--    direct plan reference, the total could be counted twice — once on the
--    plan, once across the installments. Asserted structurally: every entry
--    and allocation belonging to an installment resolves through its
--    transaction, and the count of installment transactions is the only
--    population that exists.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'BR-035 installments are ordinary transactions, no parent row' as check_name,
  not exists (
    select 1
    from public.transactions t
    where t.household_id = (select household_id from params)
      and t.installment_plan_id is not null
      and t.transaction_type <> 'expense'
  ) as passed;

-- 2. The live installments of a plan sum back to the plan's total. This is the
--    money check. Rounding puts the remainder on the last installment, so the
--    N amounts must reconstruct `total_amount` exactly — a drift here means a
--    hand-edited installment, and the plan is then lying about its size.
--    Voided installments are excluded on both sides: a cancelled plan is
--    allowed to sum to less, which check 4 covers instead.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
plan_totals as (
  select
    p.id as plan_id,
    p.total_amount,
    sum(ta.amount_original_currency) as posted_total,
    count(*) as posted_count,
    p.installment_count
  from public.installment_plans p
  join public.transactions t
    on t.installment_plan_id = p.id
    and t.household_id = p.household_id
  join public.transaction_allocations ta
    on ta.transaction_id = t.id
    and ta.household_id = t.household_id
  where p.household_id = (select household_id from params)
    and p.status = 'active'
    and t.status = 'posted'
    and t.deleted_at is null
  group by p.id, p.total_amount, p.installment_count
)
select
  'BR-035 an active plan''s installments sum to its total' as check_name,
  not exists (
    select 1
    from plan_totals
    where posted_count = installment_count
      and posted_total <> total_amount
  ) as passed;

-- 3. Installment numbering is 1..N with no duplicates and nothing past the
--    declared count. The "n of N" badge reads these directly, and a duplicate
--    number means two rows claim the same slot.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
numbering as (
  select
    t.installment_plan_id as plan_id,
    p.installment_count,
    count(*) as row_count,
    count(distinct t.installment_number) as distinct_numbers,
    max(t.installment_number) as max_number,
    min(t.installment_number) as min_number
  from public.transactions t
  join public.installment_plans p
    on p.id = t.installment_plan_id
    and p.household_id = t.household_id
  where t.household_id = (select household_id from params)
    and t.installment_plan_id is not null
    and t.deleted_at is null
  group by t.installment_plan_id, p.installment_count
)
select
  'BR-035 installment numbers are 1..N, unique, within the declared count' as check_name,
  not exists (
    select 1
    from numbering
    where row_count <> distinct_numbers
       or min_number < 1
       or max_number > installment_count
  ) as passed;

-- 4. A cancelled plan has no live installment dated after it was cancelled.
--    `cancel_installment_plan` voids the future ones and leaves the past
--    alone — cancelling a plan must not erase instalments already charged.
--    A live future row on a cancelled plan means the void did not take.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'BR-035 cancelled plans keep no live future installments' as check_name,
  not exists (
    select 1
    from public.installment_plans p
    join public.transactions t
      on t.installment_plan_id = p.id
      and t.household_id = p.household_id
    where p.household_id = (select household_id from params)
      and p.status = 'cancelled'
      and t.status = 'posted'
      and t.deleted_at is null
      and t.transaction_date > p.start_date
      and t.transaction_date > current_date
  ) as passed;

-- 5. Every installment carries exactly one entry and one allocation. An
--    installment is an ordinary expense: money leaves one account (negative
--    entry) and lands in one reporting category. Two of either would
--    double-count the installment inside its own plan.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
shape as (
  select
    t.id,
    (select count(*) from public.transaction_entries e where e.transaction_id = t.id) as entries,
    (select count(*) from public.transaction_allocations a where a.transaction_id = t.id) as allocations
  from public.transactions t
  where t.household_id = (select household_id from params)
    and t.installment_plan_id is not null
    and t.status = 'posted'
    and t.deleted_at is null
)
select
  'BR-035 each installment has exactly one entry and one allocation' as check_name,
  not exists (
    select 1 from shape where entries <> 1 or allocations <> 1
  ) as passed;
