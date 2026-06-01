-- ============================================================
-- App Finanzas — 004_create_manual_transaction_function.sql
-- Sprint 2.3: Manual transaction RPC
-- Target: Supabase / PostgreSQL
-- ============================================================

create or replace function public.create_manual_transaction(
  p_household_id uuid,
  p_transaction_type text,
  p_transaction_date date,
  p_account_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_description text default null,
  p_merchant_name text default null,
  p_notes text default null,
  p_status text default 'posted',
  p_exchange_rate_to_base numeric default 1
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction_id uuid;
  v_account_currency varchar(3);
  v_account_archived boolean;
  v_account_deleted_at timestamptz;
  v_category_reporting_type text;
  v_category_archived boolean;
  v_category_deleted_at timestamptz;
  v_signed_entry_amount numeric(18,4);
  v_allocation_type text;
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if not public.is_household_editor(p_household_id) then
    raise exception 'Not authorized to create transactions for this household';
  end if;

  if p_transaction_type is null or p_transaction_type not in ('income', 'expense') then
    raise exception 'transaction_type must be income or expense';
  end if;

  if p_transaction_date is null then
    raise exception 'transaction_date is required';
  end if;

  if p_account_id is null then
    raise exception 'account_id is required';
  end if;

  if p_category_id is null then
    raise exception 'category_id is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than 0';
  end if;

  if p_exchange_rate_to_base is null or p_exchange_rate_to_base <= 0 then
    raise exception 'exchange_rate_to_base must be greater than 0';
  end if;

  if p_status is null or p_status not in ('pending', 'posted') then
    raise exception 'status must be pending or posted';
  end if;

  select
    a.currency_code,
    a.is_archived,
    a.deleted_at
  into
    v_account_currency,
    v_account_archived,
    v_account_deleted_at
  from public.accounts a
  where a.id = p_account_id
    and a.household_id = p_household_id;

  if v_account_currency is null then
    raise exception 'account not found for household';
  end if;

  if v_account_archived or v_account_deleted_at is not null then
    raise exception 'account is not active';
  end if;

  select
    c.reporting_type,
    c.is_archived,
    c.deleted_at
  into
    v_category_reporting_type,
    v_category_archived,
    v_category_deleted_at
  from public.categories c
  where c.id = p_category_id
    and c.household_id = p_household_id;

  if v_category_reporting_type is null then
    raise exception 'category not found for household';
  end if;

  if v_category_archived or v_category_deleted_at is not null then
    raise exception 'category is not active';
  end if;

  if p_transaction_type = 'income' and v_category_reporting_type <> 'income' then
    raise exception 'income transactions require an income category';
  end if;

  if p_transaction_type = 'expense' and v_category_reporting_type not in ('expense', 'debt_interest') then
    raise exception 'expense transactions require an expense category';
  end if;

  if p_transaction_type = 'income' then
    v_signed_entry_amount := p_amount;
    v_allocation_type := 'income';
  else
    v_signed_entry_amount := -p_amount;
    v_allocation_type := 'expense';
  end if;

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
    p_transaction_type,
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
    entry_type
  )
  values (
    p_household_id,
    v_transaction_id,
    p_account_id,
    v_signed_entry_amount,
    v_account_currency,
    p_exchange_rate_to_base,
    v_signed_entry_amount * p_exchange_rate_to_base,
    'movement'
  );

  insert into public.transaction_allocations (
    household_id,
    transaction_id,
    category_id,
    allocation_type,
    amount_original_currency,
    currency_code,
    exchange_rate_to_base,
    amount_base_currency
  )
  values (
    p_household_id,
    v_transaction_id,
    p_category_id,
    v_allocation_type,
    p_amount,
    v_account_currency,
    p_exchange_rate_to_base,
    p_amount * p_exchange_rate_to_base
  );

  return v_transaction_id;
end;
$$;

grant execute on function public.create_manual_transaction(
  uuid,
  text,
  date,
  uuid,
  uuid,
  numeric,
  text,
  text,
  text,
  text,
  numeric
) to authenticated;
