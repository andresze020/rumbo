-- ============================================================
-- App Finanzas — fix_opening_balance_signed_amount.sql
-- Sprint 2.3: Opening balance sign handling
-- Target: Supabase / PostgreSQL
-- ============================================================

create or replace function public.create_opening_balance(
  p_household_id uuid,
  p_account_id uuid,
  p_opening_balance_amount numeric,
  p_opening_balance_date date,
  p_exchange_rate_to_base numeric default 1,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction_id uuid;
  v_account_currency varchar(3);
  v_account_class text;
  v_account_archived boolean;
  v_account_deleted_at timestamptz;
  v_signed_entry_amount numeric(18,4);
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if not public.is_household_admin(p_household_id) then
    raise exception 'Not authorized to create opening balances for this household';
  end if;

  if p_account_id is null then
    raise exception 'account_id is required';
  end if;

  if p_opening_balance_amount is null then
    raise exception 'opening_balance_amount is required';
  end if;

  if p_opening_balance_amount = 0 then
    raise exception 'Opening balance amount cannot be 0. Leave it unset for a zero balance.';
  end if;

  if p_opening_balance_date is null then
    raise exception 'opening_balance_date is required';
  end if;

  if p_exchange_rate_to_base is null or p_exchange_rate_to_base <= 0 then
    raise exception 'exchange_rate_to_base must be greater than 0';
  end if;

  select
    a.currency_code,
    a.account_class,
    a.is_archived,
    a.deleted_at
  into
    v_account_currency,
    v_account_class,
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

  if exists (
    select 1
    from public.transactions t
    join public.transaction_entries te
      on te.transaction_id = t.id
      and te.household_id = t.household_id
    where t.household_id = p_household_id
      and t.transaction_type = 'opening_balance'
      and t.deleted_at is null
      and t.status in ('pending', 'posted')
      and te.account_id = p_account_id
  ) then
    raise exception 'Opening balance already exists for this account';
  end if;

  if v_account_class = 'asset' then
    v_signed_entry_amount := p_opening_balance_amount;
  elsif v_account_class = 'liability' then
    v_signed_entry_amount := -abs(p_opening_balance_amount);
  else
    raise exception 'account_class must be asset or liability';
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
    'opening_balance',
    p_opening_balance_date,
    'Opening balance',
    nullif(trim(coalesce(p_notes, '')), ''),
    'posted',
    'manual',
    auth.uid()
  )
  returning id into v_transaction_id;

  -- transaction_entries has no entry_date column; the date is stored on transactions.transaction_date.
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
    'adjustment'
  );

  return v_transaction_id;
end;
$$;

grant execute on function public.create_opening_balance(
  uuid,
  uuid,
  numeric,
  date,
  numeric,
  text
) to authenticated;
