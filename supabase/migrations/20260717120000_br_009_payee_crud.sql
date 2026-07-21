-- ============================================================
-- App Finanzas — br_009_payee_crud.sql
-- BR-009 (slice 2): payees maintenance (list / rename / archive / merge).
-- ------------------------------------------------------------
-- Slice 1 wired payee_id into the transaction RPCs. This slice adds the
-- pieces the /dashboard/payees management page needs:
--   1. `payees.is_archived` — archive-over-delete for payees (they can be
--      referenced by historical transactions, so we never physically remove
--      them; matches the "no delete policy" note in the create migration).
--   2. `get_payees_with_stats(household)` — one row per payee with its live
--      transaction count + last-used date, so the list can show usage and
--      surface merge candidates without an N+1 of count queries.
--   3. `merge_payees(household, source, target)` — reassigns every
--      transaction from the source payee to the target (keeping merchant_name
--      in sync with the surviving payee's canonical name), then archives the
--      now-empty source. Used to clean up the near-duplicates the free-text
--      backfill produced (e.g. "Uber" / "uber " / "UBER").
--
-- ADDITIVE + backward-compatible: the new column defaults false, existing
-- RLS policies (member select / editor insert+update) already cover every
-- statement here — both new functions are `security invoker`.
--
-- Depends on: public.payees, public.transactions,
-- public.is_household_member(uuid), public.is_household_editor(uuid).
-- ============================================================

-- ── 1. Archive flag ─────────────────────────────────────────────────────────
alter table public.payees
  add column if not exists is_archived boolean not null default false;

-- Speeds up the common "active payees for this household" listing/lookup.
create index if not exists idx_payees_household_active
  on public.payees(household_id)
  where is_archived = false;

-- ── 2. List with usage stats ────────────────────────────────────────────────
create or replace function public.get_payees_with_stats(p_household_id uuid)
returns table (
  id uuid,
  name text,
  is_archived boolean,
  txn_count bigint,
  last_txn_date date,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.is_archived,
    count(t.id) as txn_count,
    max(t.transaction_date) as last_txn_date,
    p.created_at
  from public.payees p
  left join public.transactions t
    on t.payee_id = p.id
    and t.household_id = p.household_id
    and t.deleted_at is null
  where p.household_id = p_household_id
  group by p.id, p.name, p.is_archived, p.created_at
$$;

grant execute on function public.get_payees_with_stats(uuid) to authenticated;

-- ── 3. Merge one payee into another ─────────────────────────────────────────
create or replace function public.merge_payees(
  p_household_id uuid,
  p_source_id uuid,
  p_target_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_target_name text;
  v_source_exists boolean;
  v_moved integer;
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if not public.is_household_editor(p_household_id) then
    raise exception 'Not authorized to merge payees for this household';
  end if;

  if p_source_id is null or p_target_id is null then
    raise exception 'source and target payees are required';
  end if;

  if p_source_id = p_target_id then
    raise exception 'source and target payees must be different';
  end if;

  -- Both payees must belong to this household. Read the surviving name so we
  -- can keep the denormalized merchant_name in sync with the winner.
  select name
  into v_target_name
  from public.payees
  where id = p_target_id
    and household_id = p_household_id;

  if v_target_name is null then
    raise exception 'target payee not found for household';
  end if;

  select true
  into v_source_exists
  from public.payees
  where id = p_source_id
    and household_id = p_household_id;

  if v_source_exists is null then
    raise exception 'source payee not found for household';
  end if;

  -- Reassign every transaction and mirror the merchant label to the winner.
  update public.transactions
  set
    payee_id = p_target_id,
    merchant_name = v_target_name
  where household_id = p_household_id
    and payee_id = p_source_id;

  get diagnostics v_moved = row_count;

  -- Archive (never physically delete) the drained source payee.
  update public.payees
  set is_archived = true
  where id = p_source_id
    and household_id = p_household_id;

  return v_moved;
end;
$$;

grant execute on function public.merge_payees(uuid, uuid, uuid) to authenticated;
