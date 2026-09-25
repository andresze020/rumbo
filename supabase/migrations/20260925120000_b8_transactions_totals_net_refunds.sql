-- ============================================================
-- Rumbo — B-8: the Transactions list's "Expenses" total nets refunds
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- Before: `search_household_transactions` summed only expense-type entries
-- into total_expense_base, so a BR-040 refund never reduced the Transactions
-- page's "Expenses" figure, while the Dashboard (allocation-based) nets it.
-- For the same month the two screens disagreed by exactly the refunds — found
-- by the RUM-010b release gate (docs/release-checklist.md, "Known issues").
--
-- After: refund entries (positive, BR-040) are included and the total is
-- -Σ(expense + refund entries) in base currency — expenses minus refunds. It is
-- signed: a filtered set holding only refunds shows a negative expense.
--
-- Unchanged, deliberately: income, counts, pending, the filters, the rows
-- returned, ordering, security (still SECURITY INVOKER + the auth.uid() check,
-- so RLS applies) and the grant. The list's totals still include pending rows
-- and follow the list's own filters; that is its documented scope.
--
-- Pure function replacement, no schema change. Rollback: re-run the
-- search_household_transactions definition from
-- 20260730120000_br_045_transaction_time.sql.
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_household_transactions(p_household_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_types text[] DEFAULT NULL::text[], p_statuses text[] DEFAULT NULL::text[], p_review text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_payee_ids uuid[] DEFAULT NULL::uuid[], p_account_ids uuid[] DEFAULT NULL::uuid[], p_category_ids uuid[] DEFAULT NULL::uuid[], p_tag_ids uuid[] DEFAULT NULL::uuid[], p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, transaction_date date, transaction_time time without time zone, created_at timestamp with time zone, transaction_type text, status text, review_status text, description text, merchant_name text, notes text, source text, void_reason text, total_count bigint, total_income_base numeric, total_expense_base numeric, total_pending bigint, total_imported bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      t.transaction_time,
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
      and (
        p_types is null
        or array_length(p_types, 1) is null
        or t.transaction_type = any (p_types)
      )
      and (
        p_statuses is null
        or array_length(p_statuses, 1) is null
        or t.status = any (p_statuses)
      )
      and (p_review is null or t.review_status = p_review)
      and (
        p_payee_ids is null
        or array_length(p_payee_ids, 1) is null
        or t.payee_id = any (p_payee_ids)
      )
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
      -- B-8: a refund (BR-040, positive entry) reduces expenses, exactly as
      -- the Dashboard nets it through its negative expense allocation. Signed
      -- on purpose: a filter showing only refunds reads as a negative
      -- expense, not as a positive one.
      coalesce(-sum(
        case
          when f.transaction_type in ('expense', 'refund') and f.status <> 'voided'
            then te.amount_base_currency
          else 0
        end
      ), 0)::numeric as total_expense_base,
      (count(*) filter (where f.status = 'pending'))::bigint as total_pending,
      (count(*) filter (where f.source = 'csv_import'))::bigint as total_imported
    from filtered f
    left join public.transaction_entries te
      on te.transaction_id = f.id
      and f.transaction_type in ('income', 'expense', 'refund')
  )
  select
    f.id,
    f.transaction_date,
    f.transaction_time,
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
  order by
    f.transaction_date desc,
    f.transaction_time desc nulls last,
    f.created_at desc
  limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

grant execute on function public.search_household_transactions(
  uuid, date, date, text[], text[], text, text, uuid[], uuid[], uuid[], uuid[], integer, integer
) to authenticated;
