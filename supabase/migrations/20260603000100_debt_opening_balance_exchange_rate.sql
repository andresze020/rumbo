-- ============================================================
-- App Finanzas — debt_opening_balance_exchange_rate.sql
-- Sprint 12.5: Add exchange rate support to create_debt_with_account
-- Target: Supabase / PostgreSQL
-- ============================================================

-- Drop old signature before redefining with new parameter.
drop function if exists public.create_debt_with_account(
  uuid, text, uuid, text, varchar, numeric, date,
  numeric, numeric, text, numeric, integer, text, text
);

create or replace function public.create_debt_with_account(
  p_household_id uuid,
  p_name text,
  p_existing_account_id uuid default null,
  p_account_type text default 'debt',
  p_currency_code varchar(3) default null,
  p_opening_balance_amount numeric default null,
  p_opening_balance_date date default current_date,
  p_exchange_rate_to_base numeric default 1,
  p_original_principal numeric default null,
  p_interest_rate numeric default null,
  p_interest_rate_period text default null,
  p_minimum_payment numeric default null,
  p_payment_due_day integer default null,
  p_lender_name text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_debt_id uuid;
  v_account_id uuid;
  v_transaction_id uuid;
  v_name text;
  v_currency_code varchar(3);
  v_account_type text;
  v_account_class text;
  v_account_archived boolean;
  v_account_deleted_at timestamptz;
  v_opening_balance_amount numeric(18,4);
  v_opening_balance_date date;
  v_interest_rate_period text;
  v_exchange_rate numeric(18,8);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if not public.is_household_admin(p_household_id) then
    raise exception 'Not authorized to create debts for this household';
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');

  if v_name is null then
    raise exception 'name is required';
  end if;

  v_interest_rate_period := nullif(trim(coalesce(p_interest_rate_period, '')), '');

  if v_interest_rate_period is not null
    and v_interest_rate_period not in ('monthly', 'annual') then
    raise exception 'interest_rate_period must be monthly or annual';
  end if;

  if p_original_principal is not null and p_original_principal < 0 then
    raise exception 'original_principal must be 0 or greater';
  end if;

  if p_interest_rate is not null and p_interest_rate < 0 then
    raise exception 'interest_rate must be 0 or greater';
  end if;

  if p_minimum_payment is not null and p_minimum_payment < 0 then
    raise exception 'minimum_payment must be 0 or greater';
  end if;

  if p_payment_due_day is not null
    and (p_payment_due_day < 1 or p_payment_due_day > 31) then
    raise exception 'payment_due_day must be between 1 and 31';
  end if;

  if p_opening_balance_amount is not null and p_opening_balance_amount < 0 then
    raise exception 'opening_balance_amount must be 0 or greater';
  end if;

  if p_exchange_rate_to_base is null or p_exchange_rate_to_base <= 0 then
    raise exception 'exchange_rate_to_base must be greater than 0';
  end if;

  v_exchange_rate := p_exchange_rate_to_base;

  if p_existing_account_id is not null then
    select
      a.id,
      a.currency_code,
      a.account_type,
      a.account_class,
      a.is_archived,
      a.deleted_at
    into
      v_account_id,
      v_currency_code,
      v_account_type,
      v_account_class,
      v_account_archived,
      v_account_deleted_at
    from public.accounts a
    where a.id = p_existing_account_id
      and a.household_id = p_household_id;

    if v_account_id is null then
      raise exception 'linked account not found for household';
    end if;

    if v_account_archived or v_account_deleted_at is not null then
      raise exception 'linked account is not active';
    end if;

    if v_account_class <> 'liability' then
      raise exception 'linked account must be a liability account';
    end if;
  else
    v_currency_code := upper(nullif(trim(coalesce(p_currency_code, '')), ''));
    v_account_type := nullif(trim(coalesce(p_account_type, '')), '');

    if v_account_type is null then
      v_account_type := 'debt';
    end if;

    if v_account_type not in ('debt', 'credit_card') then
      raise exception 'account_type must be debt or credit_card';
    end if;

    if v_currency_code is null then
      raise exception 'currency_code is required';
    end if;

    if not exists (
      select 1
      from public.currencies c
      where c.code = v_currency_code
        and c.is_active = true
    ) then
      raise exception 'currency is not active';
    end if;

    v_opening_balance_date := coalesce(p_opening_balance_date, current_date);

    insert into public.accounts (
      household_id,
      name,
      account_type,
      account_class,
      currency_code,
      institution_name,
      opening_balance_date,
      include_in_net_worth,
      notes,
      created_by,
      updated_by
    )
    values (
      p_household_id,
      v_name,
      v_account_type,
      'liability',
      v_currency_code,
      nullif(trim(coalesce(p_lender_name, '')), ''),
      v_opening_balance_date,
      true,
      nullif(trim(coalesce(p_notes, '')), ''),
      auth.uid(),
      auth.uid()
    )
    returning id into v_account_id;

    v_opening_balance_amount := coalesce(p_opening_balance_amount, 0)::numeric(18,4);

    if v_opening_balance_amount > 0 then
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
        v_opening_balance_date,
        'Opening balance',
        nullif(trim(coalesce(p_notes, '')), ''),
        'posted',
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
        v_account_id,
        -abs(v_opening_balance_amount),
        v_currency_code,
        v_exchange_rate,
        -abs(v_opening_balance_amount) * v_exchange_rate,
        'adjustment'
      );
    end if;
  end if;

  if exists (
    select 1
    from public.debts d
    where d.account_id = v_account_id
      and d.deleted_at is null
  ) then
    raise exception 'A debt already exists for this account';
  end if;

  insert into public.debts (
    household_id,
    account_id,
    name,
    lender_name,
    original_principal,
    interest_rate,
    interest_rate_period,
    minimum_payment,
    payment_due_day,
    status,
    notes,
    created_by,
    updated_by
  )
  values (
    p_household_id,
    v_account_id,
    v_name,
    nullif(trim(coalesce(p_lender_name, '')), ''),
    p_original_principal,
    p_interest_rate,
    v_interest_rate_period,
    p_minimum_payment,
    p_payment_due_day,
    'active',
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid(),
    auth.uid()
  )
  returning id into v_debt_id;

  return v_debt_id;
end;
$$;

grant execute on function public.create_debt_with_account(
  uuid,
  text,
  uuid,
  text,
  varchar,
  numeric,
  date,
  numeric,
  numeric,
  numeric,
  text,
  numeric,
  integer,
  text,
  text
) to authenticated;
