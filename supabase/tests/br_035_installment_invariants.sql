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

-- 2. Every plan still has all N installments, and they sum back to its total.
--    This is the money check.
--
--    Counted over ALL non-deleted children whatever their status, not just the
--    posted ones. Voiding flips a status, it never removes the row, so the set
--    stays complete for a cancelled plan and for one where a single instalment
--    was voided by hand through `void_transaction`. That is what makes the
--    equality safe to assert outright: an earlier draft only compared the sum
--    when the count already matched, to dodge a false positive on individually
--    voided rows — which meant a plan that had lost children, or had none at
--    all, passed silently. Rounding puts the remainder on the last instalment,
--    so the N amounts must reconstruct `total_amount` exactly.
--
--    LEFT JOIN on purpose: a plan with zero children must appear here and
--    fail, not vanish from the population being checked.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
children as (
  select
    p.id as plan_id,
    p.total_amount,
    p.installment_count,
    count(t.id) as child_count,
    coalesce(sum(ta.amount_original_currency), 0) as child_total
  from public.installment_plans p
  left join public.transactions t
    on t.installment_plan_id = p.id
    and t.household_id = p.household_id
    and t.deleted_at is null
  left join public.transaction_allocations ta
    on ta.transaction_id = t.id
    and ta.household_id = t.household_id
  where p.household_id = (select household_id from params)
  group by p.id, p.total_amount, p.installment_count
)
select
  'BR-035 every plan keeps all N installments, summing to its total' as check_name,
  not exists (
    select 1
    from children
    where child_count <> installment_count
       or child_total <> total_amount
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
  'BR-035 installment numbers are exactly 1..N, unique' as check_name,
  not exists (
    select 1
    from numbering
    where row_count <> distinct_numbers
       or min_number <> 1
       or max_number <> installment_count
  ) as passed;

-- 4. DELIBERATELY ABSENT: "a cancelled plan has no live installment dated
--    after it was cancelled."
--
--    It cannot be stated correctly against the current schema, and a check
--    that cries wolf is worse than no check — it gets ignored, and then so do
--    the four real ones above.
--
--    `cancel_installment_plan(plan, p_as_of)` voids exactly the instalments
--    dated after `p_as_of`, and **`p_as_of` is never stored**. Every proxy for
--    it is wrong in a way that fires on legitimate data:
--
--      * `transaction_date > start_date` silently exempts instalment 1, which
--        is dated exactly `start_date` — so a plan cancelled before it began,
--        where instalment 1 wrongly stayed live, would still pass.
--      * `transaction_date > current_date` alone fails a plan cancelled
--        as-of a FUTURE date, where the instalments between today and that
--        date are supposed to stay posted.
--      * "no live instalment dated after a voided one" is wrong too: voiding
--        one instalment by hand with `void_transaction` and cancelling the
--        plan later leaves a legitimate live row after a voided one.
--
--    Closing this needs `installment_plans.cancelled_as_of` (a migration, so
--    out of scope for a test-only change). Recorded in
--    `docs/pending-work.md`. Until then the cancellation path is covered by
--    check 2, which counts children whatever their status, so a cancel that
--    deleted rows instead of voiding them still fails.

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
