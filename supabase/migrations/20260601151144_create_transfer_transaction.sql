-- ============================================================
-- App Finanzas — create_transfer_transaction.sql
-- Sprint 2.3: Same-currency transfer RPC
-- Target: Supabase / PostgreSQL
-- ============================================================

create or replace function public.create_transfer_transaction(
  p_household_id uuid,
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
  v_transaction_id uuid;
  v_from_currency varchar(3);
  v_to_currency varchar(3);
  v_from_archived boolean;
  v_to_archived boolean;
  v_from_deleted_at timestamptz;
  v_to_deleted_at timestamptz;
  v_amount numeric(18,4);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if not public.is_household_editor(p_household_id) then
    raise exception 'Not authorized to create transfers for this household';
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
    a.currency_code,
    a.is_archived,
    a.deleted_at
  into
    v_from_currency,
    v_from_archived,
    v_from_deleted_at
  from public.accounts a
  where a.id = p_from_account_id
    and a.household_id = p_household_id;

  if v_from_currency is null then
    raise exception 'from account not found for household';
  end if;

  if v_from_archived or v_from_deleted_at is not null then
    raise exception 'from account is not active';
  end if;

  select
    a.currency_code,
    a.is_archived,
    a.deleted_at
  into
    v_to_currency,
    v_to_archived,
    v_to_deleted_at
  from public.accounts a
  where a.id = p_to_account_id
    and a.household_id = p_household_id;

  if v_to_currency is null then
    raise exception 'to account not found for household';
  end if;

  if v_to_archived or v_to_deleted_at is not null then
    raise exception 'to account is not active';
  end if;

  -- Cross-currency transfers are intentionally deferred for the MVP.
  if v_from_currency <> v_to_currency then
    raise exception 'Transfers between different currencies are not supported yet.';
  end if;

  v_amount := abs(p_amount)::numeric(18,4);

  insert into public.transactions (
    household_id,
    transaction_type,
    transaction_date,
    description,
    notes,
    status,
    source,
    created_by
  )
  values (
    p_household_id,
    'transfer',
    p_transaction_date,
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    p_status,
    'manual',
    auth.uid()
  )
  returning id into v_transaction_id;

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
      p_household_id,
      v_transaction_id,
      p_from_account_id,
      -v_amount,
      v_from_currency,
      1,
      -v_amount,
      'movement',
      'Transfer out'
    ),
    (
      p_household_id,
      v_transaction_id,
      p_to_account_id,
      v_amount,
      v_to_currency,
      1,
      v_amount,
      'movement',
      'Transfer in'
    );

  return v_transaction_id;
end;
$$;

grant execute on function public.create_transfer_transaction(
  uuid,
  uuid,
  uuid,
  numeric,
  date,
  text,
  text,
  text
) to authenticated;
