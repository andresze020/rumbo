-- ============================================================
-- App Finanzas — 005_account_balances_function.sql
-- Sprint 2.3: Account balances read function
-- Target: Supabase / PostgreSQL
-- ============================================================

create or replace function public.get_account_balances(
  p_household_id uuid
)
returns table (
  account_id uuid,
  account_name text,
  account_type text,
  account_class text,
  currency_code varchar(3),
  include_in_net_worth boolean,
  posted_balance_account_currency numeric(18,4),
  pending_balance_account_currency numeric(18,4),
  projected_balance_account_currency numeric(18,4),
  posted_balance_base_currency numeric(18,4),
  pending_balance_base_currency numeric(18,4),
  projected_balance_base_currency numeric(18,4)
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read balances for this household';
  end if;

  return query
  select
    a.id as account_id,
    a.name as account_name,
    a.account_type,
    a.account_class,
    a.currency_code,
    a.include_in_net_worth,

    coalesce(sum(te.amount_account_currency) filter (
      where t.status = 'posted'
    ), 0)::numeric(18,4) as posted_balance_account_currency,

    coalesce(sum(te.amount_account_currency) filter (
      where t.status = 'pending'
    ), 0)::numeric(18,4) as pending_balance_account_currency,

    coalesce(sum(te.amount_account_currency) filter (
      where t.status in ('posted', 'pending')
    ), 0)::numeric(18,4) as projected_balance_account_currency,

    coalesce(sum(te.amount_base_currency) filter (
      where t.status = 'posted'
    ), 0)::numeric(18,4) as posted_balance_base_currency,

    coalesce(sum(te.amount_base_currency) filter (
      where t.status = 'pending'
    ), 0)::numeric(18,4) as pending_balance_base_currency,

    coalesce(sum(te.amount_base_currency) filter (
      where t.status in ('posted', 'pending')
    ), 0)::numeric(18,4) as projected_balance_base_currency

  from public.accounts a
  left join public.transaction_entries te
    on te.account_id = a.id
    and te.household_id = a.household_id
  left join public.transactions t
    on t.id = te.transaction_id
    and t.household_id = a.household_id
    and t.deleted_at is null
    and t.status in ('posted', 'pending')
  where a.household_id = p_household_id
    and a.deleted_at is null
    and a.is_archived = false
  group by
    a.id,
    a.name,
    a.account_type,
    a.account_class,
    a.currency_code,
    a.include_in_net_worth,
    a.sort_order,
    a.created_at
  order by
    a.sort_order nulls last,
    a.created_at asc;
end;
$$;

grant execute on function public.get_account_balances(uuid) to authenticated;
