-- ============================================================
-- App Finanzas — br_018_budget_rollover.sql
-- BR-018: budget rollover / carryover for sinking-fund-style categories.
-- ------------------------------------------------------------
-- Adds:
--   1. budget_lines.rollover_enabled (boolean, default false) — opt-in per line.
--   2. get_budget_line_carryovers(household, month) — for each category, the
--      accumulated leftover (planned - actual) across ALL prior months that had
--      a rollover-enabled line, so a surplus rolls forward and an overspend
--      carries as a deficit. The `actual` per month is computed identically to
--      get_monthly_budget_details (posted expense allocations, reports-excluded
--      categories dropped).
--
-- The app applies a category's carryover only when the CURRENT month's line is
-- rollover_enabled, so toggling it off simply pauses (does not erase) the
-- accumulated amount.
--
-- ADDITIVE: existing lines default to rollover_enabled = false → current
-- behavior (available = planned) is unchanged until a user opts in.
--
-- Depends on: public.budgets, public.budget_lines, public.transactions,
-- public.transaction_allocations, public.categories,
-- public.is_household_member(uuid).
-- ============================================================

alter table public.budget_lines
  add column if not exists rollover_enabled boolean not null default false;

create or replace function public.get_budget_line_carryovers(
  p_household_id uuid,
  p_budget_month date
)
returns table (
  category_id uuid,
  carryover_amount numeric(18,4)
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_budget_month date;
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if p_budget_month is null then
    raise exception 'budget_month is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read budgets for this household';
  end if;

  v_budget_month := date_trunc('month', p_budget_month)::date;

  return query
  with rollover_lines as (
    select
      bl.category_id,
      b.budget_month,
      (b.budget_month + interval '1 month')::date as next_month,
      bl.planned_amount
    from public.budget_lines bl
    join public.budgets b
      on b.id = bl.budget_id
      and b.household_id = bl.household_id
      and b.deleted_at is null
    where bl.household_id = p_household_id
      and bl.deleted_at is null
      and bl.rollover_enabled = true
      and b.budget_month < v_budget_month
  ),
  monthly as (
    select
      rl.category_id,
      rl.planned_amount,
      coalesce((
        select sum(ta.amount_base_currency)
        from public.transaction_allocations ta
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
        where ta.household_id = p_household_id
          and ta.category_id = rl.category_id
          and ta.allocation_type = 'expense'
          and t.status = 'posted'
          and t.deleted_at is null
          and t.transaction_date >= rl.budget_month
          and t.transaction_date < rl.next_month
          and ac.exclude_from_reports = false
          and coalesce(pc.exclude_from_reports, false) = false
      ), 0)::numeric(18,4) as actual_amount
    from rollover_lines rl
  )
  select
    m.category_id,
    sum(m.planned_amount - m.actual_amount)::numeric(18,4) as carryover_amount
  from monthly m
  group by m.category_id;
end;
$$;

grant execute on function public.get_budget_line_carryovers(uuid, date)
to authenticated;
