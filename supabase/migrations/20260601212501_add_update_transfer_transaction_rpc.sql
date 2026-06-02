-- ============================================================
-- App Finanzas — add_update_transfer_transaction_rpc.sql
-- Sprint 6: Dedicated safe transfer editing
-- Target: Supabase / PostgreSQL
-- ============================================================

create or replace function public.update_transfer_transaction(
  p_transaction_id uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_transaction_date date,
  p_description text default null,
  p_notes text default null,
  p_status text default 'posted'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction record;
  v_from_currency varchar(3);
  v_to_currency varchar(3);
  v_amount numeric(18,4);
  v_entry_count integer;
  v_allocation_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_transaction_id is null then
    raise exception 'transaction_id is required';
  end if;

  if p_from_account_id is null then
    raise exception 'from_account_id is required';
  end if;

  if p_to_account_id is null then
    raise exception 'to_account_id is required';
  end if;

  if p_from_account_id = p_to_account_id then
    raise exception 'from_account_id and to_account_id must be different';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than 0';
  end if;

  if p_transaction_date is null then
    raise exception 'transaction_date is required';
  end if;

  if p_status is null or p_status not in ('pending', 'posted') then
    raise exception 'status must be pending or posted';
  end if;

  select
    t.id,
    t.household_id,
    t.transaction_type,
    t.status,
    t.source,
    t.deleted_at
  into v_transaction
  from public.transactions t
  where t.id = p_transaction_id;

  if v_transaction.id is null then
    raise exception 'transaction not found';
  end if;

  if v_transaction.transaction_type <> 'transfer' then
    raise exception 'Only transfer transactions can be edited with update_transfer_transaction.';
  end if;

  if v_transaction.source <> 'manual' then
    raise exception 'Only manual transfer transactions can be edited in this version.';
  end if;

  if v_transaction.deleted_at is not null
    or v_transaction.status in ('voided', 'deleted_soft') then
    raise exception 'Voided or deleted transfers cannot be edited';
  end if;

  if not public.is_household_editor(v_transaction.household_id) then
    raise exception 'Not authorized to edit transfers for this household';
  end if;

  select a.currency_code
  into v_from_currency
  from public.accounts a
  where a.id = p_from_account_id
    and a.household_id = v_transaction.household_id
    and a.deleted_at is null
    and a.is_archived = false;

  if v_from_currency is null then
    raise exception 'from account not found or is not active';
  end if;

  select a.currency_code
  into v_to_currency
  from public.accounts a
  where a.id = p_to_account_id
    and a.household_id = v_transaction.household_id
    and a.deleted_at is null
    and a.is_archived = false;

  if v_to_currency is null then
    raise exception 'to account not found or is not active';
  end if;

  if v_from_currency <> v_to_currency then
    raise exception 'Cross-currency transfers are not supported yet.';
  end if;

  select count(*)::integer
  into v_entry_count
  from public.transaction_entries te
  where te.transaction_id = p_transaction_id
    and te.household_id = v_transaction.household_id;

  if v_entry_count <> 2 then
    raise exception 'transfer edit requires exactly two ledger entries';
  end if;

  select count(*)::integer
  into v_allocation_count
  from public.transaction_allocations ta
  where ta.transaction_id = p_transaction_id
    and ta.household_id = v_transaction.household_id;

  if v_allocation_count <> 0 then
    raise exception 'transfer has invalid allocations; void and recreate this transaction';
  end if;

  v_amount := abs(p_amount)::numeric(18,4);

  update public.transactions
  set
    transaction_date = p_transaction_date,
    description = nullif(trim(coalesce(p_description, '')), ''),
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    status = p_status,
    updated_by = auth.uid()
  where id = p_transaction_id
    and household_id = v_transaction.household_id;

  delete from public.transaction_entries te
  where te.transaction_id = p_transaction_id
    and te.household_id = v_transaction.household_id;

  insert into public.transaction_entries (
    household_id,
    transaction_id,
    account_id,
    amount_account_currency,
    currency_code,
    exchange_rate_to_base,
    amount_base_currency,
    entry_type,
    notes
  )
  values
    (
      v_transaction.household_id,
      p_transaction_id,
      p_from_account_id,
      -v_amount,
      v_from_currency,
      1,
      -v_amount,
      'movement',
      'Transfer out'
    ),
    (
      v_transaction.household_id,
      p_transaction_id,
      p_to_account_id,
      v_amount,
      v_to_currency,
      1,
      v_amount,
      'movement',
      'Transfer in'
    );

  return p_transaction_id;
end;
$$;

grant execute on function public.update_transfer_transaction(
  uuid,
  uuid,
  uuid,
  numeric,
  date,
  text,
  text,
  text
) to authenticated;
