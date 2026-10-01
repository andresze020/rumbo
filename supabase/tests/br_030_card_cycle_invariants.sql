-- ============================================================
-- Rumbo — BR-030 card statement cycle invariants
-- ------------------------------------------------------------
-- Same style as `br_040_refund_invariants.sql`: replace `__HOUSEHOLD_ID__`
-- and every row must report `passed = true`. Calls get_card_cycle_summaries,
-- which is is_household_member()-gated: under `npm run db:test`, pass
-- `--user=<a member's uuid>`.
--
-- Evaluated as of today, over every card with a configured cycle. These guard
-- reconciliation, not the refund rule itself; the rule is pinned with literal
-- figures by the "BR-030 a refund after the close…" check in
-- supabase/local/fixture-expectations.sql, over the three "Cycle card"
-- accounts seeded in supabase/local/fixtures.sql.
-- ============================================================

-- 1. The closed statement and the open cycle together are exactly what the
--    card owes. Whenever `payable` > 0 neither figure is floored, so
--    payable + outstanding must equal the card's posted balance as of today,
--    sign-flipped — computed here straight from its entries, without the
--    function's windows. Catches money counted in both figures or in neither
--    (the shape of the 2026-09-30 refund finding).
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'BR-030 payable plus outstanding equals what the card owes' as check_name,
  not exists (
    select 1
    from public.get_card_cycle_summaries((select household_id from params), current_date) c
    where c.payable > 0
      and abs(
        (c.payable + c.outstanding)
        - coalesce(-(
            select sum(te.amount_account_currency)
            from public.transaction_entries te
            join public.transactions t
              on t.id = te.transaction_id
              and t.household_id = te.household_id
            where te.account_id = c.account_id
              and te.household_id = (select household_id from params)
              and t.status = 'posted'
              and t.deleted_at is null
              and t.transaction_date <= current_date
          ), 0)
      ) > 0.005
  ) as passed;

-- 2. `payable` never exceeds the statement it pays, and a card is only overdue
--    when something is still payable.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'BR-030 payable is bounded by the statement and drives overdue' as check_name,
  not exists (
    select 1
    from public.get_card_cycle_summaries((select household_id from params), current_date) c
    where c.payable > c.statement_balance
      or c.payable < 0
      or c.outstanding < 0
      or (c.is_overdue and c.payable = 0)
  ) as passed;
