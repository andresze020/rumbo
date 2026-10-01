-- ============================================================
-- Rumbo — BR-043: a refund is attributed to the account it credited
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- Before: get_budget_payment_split took the paying account from the entry
-- with the most negative amount, and only from negative entries. A BR-040
-- refund is a negative expense allocation whose only entry is POSITIVE (the
-- money comes back), so it had no paying entry and fell into `other`. Cash and
-- Cards then showed spend gross of the refund while Budgets rendered an
-- "Other accounts" card with a negative amount and share. The buckets still
-- summed to Total spent, so no total check could see it. Reproduced
-- 2026-09-30 (docs/alpha/tier-3-4-authenticated-qa.md, desk audit).
--
-- After: the attributed account is the most negative entry when the
-- transaction has one (unchanged for every expense), otherwise the entry
-- with the largest amount — for a refund, the account the money returned to.
-- A refund credited to a card nets the Cards bucket; one credited to checking
-- nets Cash. `other` keeps only spend from accounts that are neither.
--
-- Unchanged, deliberately: the actuals predicate (still copied verbatim from
-- get_monthly_budget_details), the three always-returned buckets, the signature,
-- SECURITY INVOKER + the is_household_member() guard, and the grant.
--
-- Pure function replacement, same signature, no schema change. Rollback:
-- re-run the get_budget_payment_split definition from
-- 20260729140000_br_043_budget_comparison_split.sql.
-- ============================================================

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
      -- Negative entries first (the account the money left), largest outflow
      -- first; a refund has none, so its own credited account is chosen.
      select te.account_id
      from public.transaction_entries te
      where te.transaction_id = a.transaction_id
        and te.household_id = p_household_id
      order by
        (te.amount_account_currency < 0) desc,
        abs(te.amount_account_currency) desc,
        te.id
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
