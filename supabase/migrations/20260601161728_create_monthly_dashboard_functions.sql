-- ============================================================
-- App Finanzas — create_monthly_dashboard_functions.sql
-- Sprint 2.3: Monthly dashboard read RPCs
-- Target: Supabase / PostgreSQL
-- ============================================================

-- Monthly dashboard metrics are based on transaction_allocations.
-- Account balances remain based on transaction_entries.
-- Transfers and opening balances are excluded from monthly income/expense
-- metrics because they do not create transaction_allocations.

create or replace function public.get_monthly_dashboard_summary(
  p_household_id uuid,
  p_month date
)
returns table (
  household_id uuid,
  month_start date,
  month_end date,
  base_currency varchar(3),
  monthly_income numeric(18,4),
  monthly_expenses numeric(18,4),
  monthly_savings numeric(18,4),
  savings_rate numeric(9,6),
  income_transaction_count bigint,
  expense_transaction_count bigint
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_month_start date;
  v_month_end date;
  v_next_month date;
  v_base_currency varchar(3);
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if p_month is null then
    raise exception 'month is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read dashboard metrics for this household';
  end if;

  select h.base_currency
  into v_base_currency
  from public.households h
  where h.id = p_household_id
    and h.deleted_at is null;

  if v_base_currency is null then
    raise exception 'household not found';
  end if;

  v_month_start := date_trunc('month', p_month)::date;
  v_next_month := (v_month_start + interval '1 month')::date;
  v_month_end := (v_next_month - interval '1 day')::date;

  return query
  with monthly_allocations as (
    select
      t.id as transaction_id,
      ta.allocation_type,
      ta.amount_base_currency
    from public.transactions t
    join public.transaction_allocations ta
      on ta.transaction_id = t.id
      and ta.household_id = t.household_id
    where t.household_id = p_household_id
      and t.status = 'posted'
      and t.deleted_at is null
      and t.transaction_date >= v_month_start
      and t.transaction_date < v_next_month
      and ta.household_id = p_household_id
      and ta.allocation_type in ('income', 'expense')
  ),
  totals as (
    select
      coalesce(sum(ma.amount_base_currency) filter (
        where ma.allocation_type = 'income'
      ), 0)::numeric(18,4) as income_total,
      coalesce(sum(ma.amount_base_currency) filter (
        where ma.allocation_type = 'expense'
      ), 0)::numeric(18,4) as expense_total,
      count(distinct ma.transaction_id) filter (
        where ma.allocation_type = 'income'
      ) as income_count,
      count(distinct ma.transaction_id) filter (
        where ma.allocation_type = 'expense'
      ) as expense_count
    from monthly_allocations ma
  )
  select
    p_household_id as household_id,
    v_month_start as month_start,
    v_month_end as month_end,
    v_base_currency as base_currency,
    totals.income_total as monthly_income,
    totals.expense_total as monthly_expenses,
    (totals.income_total - totals.expense_total)::numeric(18,4) as monthly_savings,
    case
      when totals.income_total > 0 then
        ((totals.income_total - totals.expense_total) / totals.income_total)::numeric(9,6)
      else null
    end as savings_rate,
    totals.income_count as income_transaction_count,
    totals.expense_count as expense_transaction_count
  from totals;
end;
$$;

grant execute on function public.get_monthly_dashboard_summary(uuid, date)
to authenticated;

create or replace function public.get_monthly_expenses_by_category(
  p_household_id uuid,
  p_month date
)
returns table (
  category_id uuid,
  category_name text,
  parent_category_id uuid,
  amount_base_currency numeric(18,4),
  transaction_count bigint
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_month_start date;
  v_next_month date;
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if p_month is null then
    raise exception 'month is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read dashboard metrics for this household';
  end if;

  v_month_start := date_trunc('month', p_month)::date;
  v_next_month := (v_month_start + interval '1 month')::date;

  return query
  select
    c.id as category_id,
    c.name as category_name,
    c.parent_category_id,
    sum(ta.amount_base_currency)::numeric(18,4) as amount_base_currency,
    count(distinct t.id) as transaction_count
  from public.transactions t
  join public.transaction_allocations ta
    on ta.transaction_id = t.id
    and ta.household_id = t.household_id
  join public.categories c
    on c.id = ta.category_id
    and c.household_id = ta.household_id
  where t.household_id = p_household_id
    and t.status = 'posted'
    and t.deleted_at is null
    and t.transaction_date >= v_month_start
    and t.transaction_date < v_next_month
    and ta.household_id = p_household_id
    and ta.allocation_type = 'expense'
  group by
    c.id,
    c.name,
    c.parent_category_id
  order by
    sum(ta.amount_base_currency) desc,
    c.name asc;
end;
$$;

grant execute on function public.get_monthly_expenses_by_category(uuid, date)
to authenticated;
