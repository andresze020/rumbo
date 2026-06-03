-- ============================================================
-- App Finanzas — sprint_11_3_5_alpha_blocking_fixes.sql
-- Sprint 11.3.5: Alpha blocking fixes
-- Target: Supabase / PostgreSQL
-- ============================================================

alter table public.transactions
  add column if not exists merchant_name text;

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
    merchant_name,
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
    nullif(trim(coalesce(p_merchant_name, '')), ''),
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
    merchant_name = nullif(trim(coalesce(p_merchant_name, '')), ''),
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

create or replace function public.create_debt_payment(
  p_household_id uuid,
  p_debt_id uuid,
  p_source_account_id uuid,
  p_payment_amount numeric,
  p_payment_date date,
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
  v_debt_name text;
  v_debt_account_id uuid;
  v_source_currency varchar(3);
  v_debt_currency varchar(3);
  v_source_class text;
  v_debt_class text;
  v_source_archived boolean;
  v_debt_archived boolean;
  v_source_deleted_at timestamptz;
  v_debt_deleted_at timestamptz;
  v_amount numeric(18,4);
  v_outstanding_amount numeric(18,4);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if not public.is_household_editor(p_household_id) then
    raise exception 'Not authorized to create debt payments for this household';
  end if;

  if p_debt_id is null then
    raise exception 'debt_id is required';
  end if;

  if p_source_account_id is null then
    raise exception 'source_account_id is required';
  end if;

  if p_payment_amount is null or p_payment_amount <= 0 then
    raise exception 'payment_amount must be greater than 0';
  end if;

  if p_payment_date is null then
    raise exception 'payment_date is required';
  end if;

  if p_status is null or p_status not in ('pending', 'posted') then
    raise exception 'status must be pending or posted';
  end if;

  select d.name, d.account_id
  into v_debt_name, v_debt_account_id
  from public.debts d
  where d.id = p_debt_id
    and d.household_id = p_household_id
    and d.status = 'active'
    and d.deleted_at is null;

  if v_debt_account_id is null then
    raise exception 'active debt not found for household';
  end if;

  if p_source_account_id = v_debt_account_id then
    raise exception 'source account and debt account must be different';
  end if;

  select
    a.currency_code,
    a.account_class,
    a.is_archived,
    a.deleted_at
  into
    v_source_currency,
    v_source_class,
    v_source_archived,
    v_source_deleted_at
  from public.accounts a
  where a.id = p_source_account_id
    and a.household_id = p_household_id;

  if v_source_currency is null then
    raise exception 'source account not found for household';
  end if;

  if v_source_class <> 'asset' then
    raise exception 'source account must be an asset account';
  end if;

  if v_source_archived or v_source_deleted_at is not null then
    raise exception 'source account is not active';
  end if;

  select
    a.currency_code,
    a.account_class,
    a.is_archived,
    a.deleted_at
  into
    v_debt_currency,
    v_debt_class,
    v_debt_archived,
    v_debt_deleted_at
  from public.accounts a
  where a.id = v_debt_account_id
    and a.household_id = p_household_id;

  if v_debt_currency is null then
    raise exception 'debt account not found for household';
  end if;

  if v_debt_class <> 'liability' then
    raise exception 'debt account must be a liability account';
  end if;

  if v_debt_archived or v_debt_deleted_at is not null then
    raise exception 'debt account is not active';
  end if;

  if v_source_currency <> v_debt_currency then
    raise exception 'Debt payments between different currencies are not supported yet.';
  end if;

  v_amount := abs(p_payment_amount)::numeric(18,4);

  select greatest(-coalesce(sum(te.amount_account_currency), 0), 0)::numeric(18,4)
  into v_outstanding_amount
  from public.transaction_entries te
  join public.transactions t
    on t.id = te.transaction_id
    and t.household_id = te.household_id
  where te.household_id = p_household_id
    and te.account_id = v_debt_account_id
    and t.deleted_at is null
    and t.status in ('pending', 'posted');

  if v_amount > v_outstanding_amount then
    raise exception 'Payment amount cannot exceed outstanding debt balance.';
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
    'debt_payment',
    p_payment_date,
    coalesce(nullif(trim(coalesce(p_description, '')), ''), 'Debt payment: ' || v_debt_name),
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
      p_source_account_id,
      -v_amount,
      v_source_currency,
      1,
      -v_amount,
      'movement',
      'Debt payment source'
    ),
    (
      p_household_id,
      v_transaction_id,
      v_debt_account_id,
      v_amount,
      v_debt_currency,
      1,
      v_amount,
      'movement',
      'Debt principal payment'
    );

  return v_transaction_id;
end;
$$;

grant execute on function public.create_debt_payment(
  uuid,
  uuid,
  uuid,
  numeric,
  date,
  text,
  text,
  text
) to authenticated;
