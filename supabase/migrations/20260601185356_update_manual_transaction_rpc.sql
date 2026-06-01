-- ============================================================
-- App Finanzas — update_manual_transaction_rpc.sql
-- Sprint 5.2: Safe manual income/expense transaction editing
-- Target: Supabase / PostgreSQL
-- ============================================================

create or replace function public.update_manual_transaction(
  p_transaction_id uuid,
  p_account_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_transaction_date date,
  p_description text default null,
  p_merchant_name text default null,
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
  v_account_currency varchar(3);
  v_category_type text;
  v_entry_count integer;
  v_allocation_count integer;
  v_entry_id uuid;
  v_allocation_id uuid;
  v_entry_exchange_rate numeric(18,8);
  v_allocation_exchange_rate numeric(18,8);
  v_amount numeric(18,4);
  v_signed_entry_amount numeric(18,4);
  v_allocation_type text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_transaction_id is null then
    raise exception 'transaction_id is required';
  end if;

  if p_account_id is null then
    raise exception 'account_id is required';
  end if;

  if p_category_id is null then
    raise exception 'category_id is required';
  end if;

  if p_transaction_date is null then
    raise exception 'transaction_date is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than 0';
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

  if v_transaction.deleted_at is not null
    or v_transaction.status in ('voided', 'deleted_soft') then
    raise exception 'Voided or deleted transactions cannot be edited';
  end if;

  if v_transaction.source <> 'manual'
    or v_transaction.transaction_type not in ('income', 'expense') then
    raise exception 'Only manual income and expense transactions can be edited in this version. Void and recreate this transaction instead.';
  end if;

  if not public.is_household_editor(v_transaction.household_id) then
    raise exception 'Not authorized to edit transactions for this household';
  end if;

  select a.currency_code
  into v_account_currency
  from public.accounts a
  where a.id = p_account_id
    and a.household_id = v_transaction.household_id
    and a.deleted_at is null
    and a.is_archived = false;

  if v_account_currency is null then
    raise exception 'account not found or is not active';
  end if;

  select c.category_type
  into v_category_type
  from public.categories c
  where c.id = p_category_id
    and c.household_id = v_transaction.household_id
    and c.deleted_at is null
    and c.is_archived = false;

  if v_category_type is null then
    raise exception 'category not found or is not active';
  end if;

  if v_transaction.transaction_type = 'income'
    and v_category_type <> 'income' then
    raise exception 'income transactions require an income category';
  end if;

  if v_transaction.transaction_type = 'expense'
    and v_category_type <> 'expense' then
    raise exception 'expense transactions require an expense category';
  end if;

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

  if v_entry_count <> 1 or v_allocation_count <> 1 then
    raise exception 'manual transaction edit requires exactly one ledger entry and one allocation';
  end if;

  select te.id, te.exchange_rate_to_base
  into v_entry_id, v_entry_exchange_rate
  from public.transaction_entries te
  where te.transaction_id = p_transaction_id
    and te.household_id = v_transaction.household_id;

  select ta.id, ta.exchange_rate_to_base
  into v_allocation_id, v_allocation_exchange_rate
  from public.transaction_allocations ta
  where ta.transaction_id = p_transaction_id
    and ta.household_id = v_transaction.household_id;

  v_amount := abs(p_amount)::numeric(18,4);
  v_entry_exchange_rate := coalesce(v_entry_exchange_rate, 1);
  v_allocation_exchange_rate := coalesce(v_allocation_exchange_rate, v_entry_exchange_rate, 1);

  if v_transaction.transaction_type = 'income' then
    v_signed_entry_amount := v_amount;
    v_allocation_type := 'income';
  else
    v_signed_entry_amount := -v_amount;
    v_allocation_type := 'expense';
  end if;

  update public.transactions
  set
    transaction_date = p_transaction_date,
    description = nullif(trim(coalesce(p_description, '')), ''),
    -- The current schema does not have transactions.merchant_name.
    -- p_merchant_name is kept in the signature for app compatibility.
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    status = p_status,
    updated_by = auth.uid()
  where id = p_transaction_id
    and household_id = v_transaction.household_id;

  update public.transaction_entries
  set
    account_id = p_account_id,
    currency_code = v_account_currency,
    amount_account_currency = v_signed_entry_amount,
    exchange_rate_to_base = v_entry_exchange_rate,
    amount_base_currency = (v_signed_entry_amount * v_entry_exchange_rate)::numeric(18,4),
    entry_type = 'movement'
  where id = v_entry_id
    and household_id = v_transaction.household_id;

  update public.transaction_allocations
  set
    category_id = p_category_id,
    allocation_type = v_allocation_type,
    amount_original_currency = v_amount,
    currency_code = v_account_currency,
    exchange_rate_to_base = v_allocation_exchange_rate,
    amount_base_currency = (v_amount * v_allocation_exchange_rate)::numeric(18,4)
  where id = v_allocation_id
    and household_id = v_transaction.household_id;

  return p_transaction_id;
end;
$$;

grant execute on function public.update_manual_transaction(
  uuid,
  uuid,
  uuid,
  numeric,
  date,
  text,
  text,
  text,
  text
) to authenticated;
