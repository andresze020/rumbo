-- ============================================================
-- App Finanzas — BR-045: optional time-of-day on transactions
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- `transactions.transaction_date` is a `date`, so two entries on the same day
-- have no chronological order beyond the order they happened to be inserted in.
-- This adds an OPTIONAL wall-clock time beside it.
--
-- Deliberate scope (per the BR-045 row): the time is descriptive metadata for
-- ordering and display only. It is NOT part of any financial predicate — every
-- monthly RPC, budget, report and closure keeps filtering on `transaction_date`
-- alone, so a timed transaction lands in exactly the same period as it does
-- today. Sort-order *configurability* is deferred.
--
-- Why `time` and not `timestamptz`: a household records "the 8am coffee", a
-- wall-clock fact about its own day. Promoting the column to `timestamptz`
-- would re-interpret all 40k+ existing date-only rows against a timezone the
-- database does not know, and would make `transaction_date >= x` comparisons
-- timezone-dependent. A separate nullable `time` leaves the date column — and
-- therefore every existing query — bit-for-bit unchanged.
--
-- NULL means "no time recorded", which is every pre-existing row and every row
-- created by a user who leaves the (opt-in) field off.
-- ============================================================

alter table public.transactions
  add column if not exists transaction_time time;

comment on column public.transactions.transaction_time is
  'BR-045: optional wall-clock time of day, in the household''s own local sense. '
  'NULL = not recorded. Display/ordering only — never used in a period predicate, '
  'which always keys on transaction_date.';

-- ------------------------------------------------------------
-- search_household_transactions: return the time and order by it
-- ------------------------------------------------------------
-- The parameter list is unchanged, but the RETURNS TABLE gains a column, and
-- Postgres cannot change a function's return type in place ("cannot change
-- return type of existing function") — so this DROPs the exact current
-- signature first and recreates it. Nothing else about the function moves.
--
-- Ordering: `transaction_time desc nulls last` is inserted *between* the
-- existing date and created_at keys. For a day whose rows all have no time —
-- i.e. every row that exists before this migration — every comparison on the
-- new key ties, so the list falls straight through to `created_at desc` and the
-- order is byte-identical to today's. On a mixed day, timed rows sort newest
-- first and untimed rows follow in insertion order.

drop function if exists public.search_household_transactions(
  uuid, date, date, text[], text[], text, text, uuid[], uuid[], uuid[], uuid[], integer, integer
);

create or replace function public.search_household_transactions(
  p_household_id uuid,
  p_date_from date default null,
  p_date_to date default null,
  p_types text[] default null,
  p_statuses text[] default null,
  p_review text default null,
  p_search text default null,
  p_payee_ids uuid[] default null,
  p_account_ids uuid[] default null,
  p_category_ids uuid[] default null,
  p_tag_ids uuid[] default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  transaction_date date,
  transaction_time time,
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
$$;

grant execute on function public.search_household_transactions(
  uuid, date, date, text[], text[], text, text, uuid[], uuid[], uuid[], uuid[], integer, integer
) to authenticated;

-- ------------------------------------------------------------
-- Writing the time
-- ------------------------------------------------------------
-- Deliberately NOT a new parameter on create_manual_transaction. Adding one
-- there would create a 13-argument overload alongside the existing 12-argument
-- function, and a named-argument call from PostgREST would become ambiguous
-- (the trap that forced the DROP above and in 20260729120000). The app instead
-- writes the time with a plain UPDATE on the row the RPC just returned, exactly
-- as BR-023 attaches tags through set_transaction_tags after the fact.
--
-- `transactions_update_editor` already covers that UPDATE, so no new policy is
-- needed and the write stays inside RLS.
