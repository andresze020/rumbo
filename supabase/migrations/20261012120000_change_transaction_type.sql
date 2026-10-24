-- ============================================================
-- Rumbo — change_transaction_type: switch a recorded transaction between
-- expense / income / transfer atomically
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- Switching type changes the ledger SHAPE (income/expense = 1 entry + 1
-- allocation; transfer = 2 entries + an optional cost allocation), so it is not
-- an in-place edit. The original is VOIDED (never deleted; its ledger rows stay
-- for traceability and drop out of every report through status = 'voided') and
-- a replacement is created — both inside this single function call, hence one
-- database transaction: either both happen or neither does.
--
-- Nothing is re-implemented here. The replacement goes through the existing
-- create_manual_transaction / create_transfer_transaction and the original
-- through void_transaction / set_transaction_tags, so every household, role,
-- private-account (S22), currency and category rule keeps a single source of
-- truth. This function only adds the guards that gate the ORIGINAL, copied from
-- the update RPCs: anything editable today is retypeable, nothing more.
--
-- SECURITY INVOKER + search_path = public, like every RPC it calls: RLS applies
-- to the caller throughout, and a private transaction that is not the caller's
-- is simply "transaction not found".
--
-- Not carried over from the original (the caller passes the final values, the
-- edit form already holds them): tags (only when p_tag_ids is given),
-- transaction_time (only when p_transaction_time is given), payee on a
-- transfer, attachments/links. The original keeps its own.
--
-- New function, no existing signature changes: no DROP needed.
-- ============================================================

create or replace function public.change_transaction_type(
  p_transaction_id uuid,
  p_new_type text,
  p_transaction_date date,
  p_amount numeric,
  p_status text,
  p_description text default null,
  p_notes text default null,
  -- income / expense
  p_account_id uuid default null,
  p_category_id uuid default null,
  p_merchant_name text default null,
  p_payee_name text default null,
  p_exchange_rate_to_base numeric default 1,
  -- transfer
  p_from_account_id uuid default null,
  p_to_account_id uuid default null,
  p_to_amount numeric default null,
  p_cost_base numeric default null,
  p_cost_category_id uuid default null,
  -- extras
  p_transaction_time time default null,
  p_tag_ids uuid[] default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction record;
  v_entry_count integer;
  v_allocation_count integer;
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_transaction_id is null then
    raise exception 'transaction_id is required';
  end if;

  if p_new_type is null or p_new_type not in ('income', 'expense', 'transfer') then
    raise exception 'new_type must be income, expense or transfer';
  end if;

  -- Lock the original so a concurrent edit/void cannot slip in between the
  -- checks below and the void at the end.
  select
    t.id,
    t.household_id,
    t.transaction_type,
    t.status,
    t.source,
    t.deleted_at
  into v_transaction
  from public.transactions t
  where t.id = p_transaction_id
  for update;

  if v_transaction.id is null then
    raise exception 'transaction not found';
  end if;

  if v_transaction.deleted_at is not null
    or v_transaction.status in ('voided', 'deleted_soft') then
    raise exception 'Voided or deleted transactions cannot be edited';
  end if;

  -- Same editability rules as update_manual_transaction (income/expense) and
  -- update_transfer_transaction (transfer).
  if v_transaction.transaction_type = 'transfer' then
    if v_transaction.source <> 'manual' then
      raise exception 'Only manual transfer transactions can be edited in this version.';
    end if;
  elsif v_transaction.transaction_type in ('income', 'expense') then
    if v_transaction.source <> 'manual' then
      raise exception 'Only manual income and expense transactions can be edited in this version. Void and recreate this transaction instead.';
    end if;
  else
    raise exception 'Only manual income and expense transactions can be edited in this version. Void and recreate this transaction instead.';
  end if;

  if v_transaction.transaction_type = p_new_type then
    raise exception 'Use the regular edit when the type does not change';
  end if;

  if not public.is_household_editor(v_transaction.household_id) then
    raise exception 'Not authorized to edit transactions for this household';
  end if;

  -- S22 / PRV-4: a transaction that touches a private account is its owner's
  -- to change. A co-member sees a mixed transfer's shared side but cannot
  -- edit, void or retag it.
  if exists (
    select 1 from public.transactions t
    where t.id = p_transaction_id
      and t.private_owner_id is not null
      and t.private_owner_id <> auth.uid()
  ) then
    raise exception 'Only the member who owns the private account can change this transaction';
  end if;

  -- Ledger shape of the original must be the one the update RPCs can handle.
  select count(*)::integer
  into v_entry_count
  from public.transaction_entries te
  where te.transaction_id = p_transaction_id
    and te.household_id = v_transaction.household_id;

  select count(*)::integer
  into v_allocation_count
  from public.transaction_allocations ta
  where ta.transaction_id = p_transaction_id
    and ta.household_id = v_transaction.household_id;

  if v_transaction.transaction_type = 'transfer' then
    if v_entry_count <> 2 then
      raise exception 'transfer edit requires exactly two ledger entries';
    end if;
  else
    if v_entry_count <> 1 or v_allocation_count <> 1 then
      raise exception 'manual transaction edit requires exactly one ledger entry and one allocation';
    end if;
  end if;

  -- Create the replacement. Their own validation (accounts, categories, FX,
  -- cost, role, private-account rules) runs here; any failure aborts the whole
  -- call and leaves the original untouched.
  if p_new_type = 'transfer' then
    v_new_id := public.create_transfer_transaction(
      v_transaction.household_id,
      p_from_account_id,
      p_to_account_id,
      p_amount,
      p_transaction_date,
      p_description,
      p_notes,
      p_status,
      p_exchange_rate_to_base,
      p_to_amount,
      p_cost_base,
      p_cost_category_id
    );
  else
    v_new_id := public.create_manual_transaction(
      v_transaction.household_id,
      p_new_type,
      p_transaction_date,
      p_account_id,
      p_category_id,
      p_amount,
      p_description,
      p_merchant_name,
      p_notes,
      p_status,
      p_exchange_rate_to_base,
      p_payee_name
    );
  end if;

  if v_new_id is null then
    raise exception 'could not create the replacement transaction';
  end if;

  if p_tag_ids is not null then
    perform public.set_transaction_tags(v_new_id, p_tag_ids);
  end if;

  if p_transaction_time is not null then
    update public.transactions
    set transaction_time = p_transaction_time
    where id = v_new_id
      and household_id = v_transaction.household_id;
  end if;

  -- Void the original through the normal RPC (editor + private-owner checks,
  -- voided_at/voided_by/void_reason, updated_by).
  perform public.void_transaction(p_transaction_id, 'Type changed to ' || p_new_type);

  return v_new_id;
end;
$$;

revoke all on function public.change_transaction_type(
  uuid, text, date, numeric, text, text, text,
  uuid, uuid, text, text, numeric,
  uuid, uuid, numeric, numeric, uuid,
  time, uuid[]
) from public, anon;

grant execute on function public.change_transaction_type(
  uuid, text, date, numeric, text, text, text,
  uuid, uuid, text, text, numeric,
  uuid, uuid, numeric, numeric, uuid,
  time, uuid[]
) to authenticated;

-- ------------------------------------------------------------
-- Rollback (manual; voided originals and their replacements are ordinary
-- transactions and stay as they are). To undo one type change, void the
-- replacement BEFORE unvoid_transaction on the original — unvoiding alone
-- leaves both live and the amount counts twice:
--
-- drop function if exists public.change_transaction_type(
--   uuid, text, date, numeric, text, text, text,
--   uuid, uuid, text, text, numeric,
--   uuid, uuid, numeric, numeric, uuid,
--   time, uuid[]
-- );
-- ------------------------------------------------------------
