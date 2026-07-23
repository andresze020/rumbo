-- ============================================================
-- App Finanzas — BR-008: server-side transaction search + pagination
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- The transactions list previously loaded every row in the date window and
-- filtered by account/category in JS. This RPC pushes ALL filtering (date,
-- type, status, review, free-text search, payee, account, category, tag) and
-- pagination into a single SQL round trip, and returns the full-filtered-set
-- aggregates (count + income/expense base totals + pending/imported counts)
-- as window columns so the header and totals stay accurate across pages.
--
-- Notes
--  * security invoker → RLS on transactions/entries/allocations/tags applies;
--    the explicit household_id filter also lets the household+date index help.
--  * account/category/tag filters are AND-combined via EXISTS (a transaction
--    matches if it has any entry/allocation/tag in the given set — parent
--    categories must be expanded to their children by the caller).
--  * income/expense rows have exactly one ledger entry (enforced by the
--    manual-transaction RPCs), so the totals join never fans out.
-- ============================================================

create or replace function public.search_household_transactions(
  p_household_id uuid,
  p_date_from date default null,
  p_date_to date default null,
  p_type text default null,
  p_status text default null,
  p_review text default null,
  p_search text default null,
  p_payee_id uuid default null,
  p_account_ids uuid[] default null,
  p_category_ids uuid[] default null,
  p_tag_ids uuid[] default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  transaction_date date,
  created_at timestamptz,
  transaction_type text,
  status text,
  review_status text,
  description text,
  merchant_name text,
  notes text,
  source text,
  void_reason text,
  total_count bigint,
  total_income_base numeric,
  total_expense_base numeric,
  total_pending bigint,
  total_imported bigint
)
language plpgsql
security invoker
stable
set search_path = public
as $$
declare
  v_search text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized for this household';
  end if;

  -- Escape LIKE wildcards in the free-text search (mirrors the former app-side
  -- escaping) so a literal % / _ typed by the user is matched, not treated as a
  -- wildcard.
  v_search := case
    when p_search is null or btrim(p_search) = '' then null
    else '%' || replace(replace(btrim(p_search), '%', '\%'), '_', '\_') || '%'
  end;

  return query
  with filtered as (
    select
      t.id,
      t.transaction_date,
      t.created_at,
      t.transaction_type,
      t.status,
      t.review_status,
      t.description,
      t.merchant_name,
      t.notes,
      t.source,
      t.void_reason
    from public.transactions t
    where t.household_id = p_household_id
      and t.deleted_at is null
      and (p_date_from is null or t.transaction_date >= p_date_from)
      and (p_date_to is null or t.transaction_date <= p_date_to)
      and (p_type is null or t.transaction_type = p_type)
      and (p_status is null or t.status = p_status)
      and (p_review is null or t.review_status = p_review)
      and (p_payee_id is null or t.payee_id = p_payee_id)
      and (
        v_search is null
        or t.description ilike v_search escape '\'
        or t.merchant_name ilike v_search escape '\'
        or t.notes ilike v_search escape '\'
      )
      and (
        p_account_ids is null
        or array_length(p_account_ids, 1) is null
        or exists (
          select 1
          from public.transaction_entries te
          where te.transaction_id = t.id
            and te.account_id = any (p_account_ids)
        )
      )
      and (
        p_category_ids is null
        or array_length(p_category_ids, 1) is null
        or exists (
          select 1
          from public.transaction_allocations ta
          where ta.transaction_id = t.id
            and ta.category_id = any (p_category_ids)
        )
      )
      and (
        p_tag_ids is null
        or array_length(p_tag_ids, 1) is null
        or exists (
          select 1
          from public.transaction_tags tt
          where tt.transaction_id = t.id
            and tt.tag_id = any (p_tag_ids)
        )
      )
  ),
  totals as (
    select
      count(*)::bigint as total_count,
      coalesce(sum(
        case
          when f.transaction_type = 'income' and f.status <> 'voided'
            then te.amount_base_currency
          else 0
        end
      ), 0)::numeric as total_income_base,
      coalesce(abs(sum(
        case
          when f.transaction_type = 'expense' and f.status <> 'voided'
            then te.amount_base_currency
          else 0
        end
      )), 0)::numeric as total_expense_base,
      (count(*) filter (where f.status = 'pending'))::bigint as total_pending,
      (count(*) filter (where f.source = 'csv_import'))::bigint as total_imported
    from filtered f
    left join public.transaction_entries te
      on te.transaction_id = f.id
      and f.transaction_type in ('income', 'expense')
  )
  select
    f.id,
    f.transaction_date,
    f.created_at,
    f.transaction_type,
    f.status,
    f.review_status,
    f.description,
    f.merchant_name,
    f.notes,
    f.source,
    f.void_reason,
    tt.total_count,
    tt.total_income_base,
    tt.total_expense_base,
    tt.total_pending,
    tt.total_imported
  from filtered f
  cross join totals tt
  order by f.transaction_date desc, f.created_at desc
  limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

grant execute on function public.search_household_transactions(
  uuid, date, date, text, text, text, text, uuid, uuid[], uuid[], uuid[], integer, integer
) to authenticated;
