-- ============================================================
-- App Finanzas — br_043_budget_comparison_split.sql
-- BR-043: budget "vs last month" comparison + cash/card expense split.
-- ------------------------------------------------------------
-- Two read-only functions. No schema change, no new table, nothing written:
--
--   1. get_budget_previous_actuals(household, month)
--      Last month's actual expense per category, restricted to the categories
--      that have a line in THIS month's budget — so the comparison is
--      like-for-like instead of measuring against a different category set.
--      Every budgeted category comes back, with 0 when it had no prior-month
--      spend, so a first-ever budget degrades to "no comparison" rather than to
--      a half-populated one.
--
--   2. get_budget_payment_split(household, month)
--      This month's budget actuals grouped by how they were paid: cash-like
--      accounts, cards/debt, or anything else. The three buckets are exhaustive
--      and always returned, so they sum back to the budget's total spent.
--
-- Both reproduce the actuals definition in get_monthly_budget_details exactly
-- (posted expense allocations; reports-excluded categories and categories whose
-- parent is reports-excluded are dropped). Any divergence would surface as a
-- budget summary that disagrees with its own lines, so the predicate is copied
-- rather than paraphrased.
--
-- Attribution note for the split: an allocation has no account of its own — the
-- account lives on the transaction's entries. The paying account is taken as the
-- entry with the most negative amount (the account the money actually left),
-- which is the single entry of a plain expense and the right one for a split
-- transaction, where several allocations share one paying entry. A transaction
-- with no negative entry lands in `other` rather than being dropped, so the
-- totals still reconcile.
--
-- Depends on: public.budgets, public.budget_lines, public.transactions,
-- public.transaction_entries, public.transaction_allocations, public.accounts,
-- public.categories, public.is_household_member(uuid).
-- ============================================================

-- ── 1. Last month's actuals for this month's budgeted categories ────────────
create or replace function public.get_budget_previous_actuals(
  p_household_id uuid,
  p_budget_month date
)
returns table (
  category_id uuid,
  actual_amount numeric(18,4),
  transaction_count bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_budget_month date;
  v_previous_month date;
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
  v_previous_month := (v_budget_month - interval '1 month')::date;

  return query
  with budgeted_categories as (
    select distinct bl.category_id
    from public.budget_lines bl
    join public.budgets b
      on b.id = bl.budget_id
      and b.household_id = bl.household_id
      and b.deleted_at is null
    where bl.household_id = p_household_id
      and bl.deleted_at is null
      and bl.category_id is not null
      and b.budget_month = v_budget_month
  ),
  previous as (
    select
      ta.category_id,
      sum(ta.amount_base_currency) as actual_amount,
      count(distinct t.id) as transaction_count
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
      and ta.allocation_type = 'expense'
      and t.status = 'posted'
      and t.deleted_at is null
      and t.transaction_date >= v_previous_month
      and t.transaction_date < v_budget_month
      and ac.exclude_from_reports = false
      and coalesce(pc.exclude_from_reports, false) = false
    group by ta.category_id
  )
  select
    bc.category_id,
    coalesce(p.actual_amount, 0)::numeric(18,4) as actual_amount,
    coalesce(p.transaction_count, 0)::bigint as transaction_count
  from budgeted_categories bc
  left join previous p
    on p.category_id = bc.category_id;
end;
$$;

grant execute on function public.get_budget_previous_actuals(uuid, date)
to authenticated;

-- ── 2. This month's budget actuals split by payment method ──────────────────
create or replace function public.get_budget_payment_split(
  p_household_id uuid,
  p_budget_month date
)
returns table (
  payment_group text,
  actual_amount numeric(18,4),
  transaction_count bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_budget_month date;
  v_next_month date;
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
  v_next_month := (v_budget_month + interval '1 month')::date;

  return query
  with budgeted_categories as (
    select distinct bl.category_id
    from public.budget_lines bl
    join public.budgets b
      on b.id = bl.budget_id
      and b.household_id = bl.household_id
      and b.deleted_at is null
    where bl.household_id = p_household_id
      and bl.deleted_at is null
      and bl.category_id is not null
      and b.budget_month = v_budget_month
  ),
  actuals as (
    select
      ta.transaction_id,
      ta.amount_base_currency
    from public.transaction_allocations ta
    join budgeted_categories bc
      on bc.category_id = ta.category_id
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
      and ta.allocation_type = 'expense'
      and t.status = 'posted'
      and t.deleted_at is null
      and t.transaction_date >= v_budget_month
      and t.transaction_date < v_next_month
      and ac.exclude_from_reports = false
      and coalesce(pc.exclude_from_reports, false) = false
  ),
  attributed as (
    select
      a.transaction_id,
      a.amount_base_currency,
      case
        when acc.account_type in ('cash', 'checking', 'savings') then 'cash'
        when acc.account_type in ('credit_card', 'debt') then 'card'
        else 'other'
      end as payment_group
    from actuals a
    left join lateral (
      select te.account_id
      from public.transaction_entries te
      where te.transaction_id = a.transaction_id
        and te.household_id = p_household_id
        and te.amount_account_currency < 0
      order by te.amount_account_currency asc
      limit 1
    ) paying on true
    left join public.accounts acc
      on acc.id = paying.account_id
      and acc.household_id = p_household_id
  )
  select
    bucket.payment_group,
    coalesce(sum(attr.amount_base_currency), 0)::numeric(18,4) as actual_amount,
    count(distinct attr.transaction_id)::bigint as transaction_count
  from (values ('cash'), ('card'), ('other')) as bucket(payment_group)
  left join attributed attr
    on attr.payment_group = bucket.payment_group
  group by bucket.payment_group;
end;
$$;

grant execute on function public.get_budget_payment_split(uuid, date)
to authenticated;
