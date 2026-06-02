-- ============================================================
-- App Finanzas — sprint_10_debts_net_worth.sql
-- Sprint 10: Debt metadata and principal-only debt payments
-- Target: Supabase / PostgreSQL
-- ============================================================

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid not null references public.accounts(id),

  name text not null,
  lender_name text,
  original_principal numeric(18,4),
  interest_rate numeric(9,4),
  interest_rate_period text,
  minimum_payment numeric(18,4),
  payment_due_day integer,
  status text not null default 'active',
  notes text,

  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),

  constraint debts_name_not_blank_chk
    check (length(trim(name)) > 0),
  constraint debts_original_principal_nonnegative_chk
    check (original_principal is null or original_principal >= 0),
  constraint debts_interest_rate_nonnegative_chk
    check (interest_rate is null or interest_rate >= 0),
  constraint debts_interest_rate_period_chk
    check (interest_rate_period is null or interest_rate_period in ('monthly', 'annual')),
  constraint debts_minimum_payment_nonnegative_chk
    check (minimum_payment is null or minimum_payment >= 0),
  constraint debts_payment_due_day_chk
    check (payment_due_day is null or payment_due_day between 1 and 31),
  constraint debts_status_chk
    check (status in ('active', 'inactive'))
);

drop trigger if exists trg_debts_updated_at on public.debts;

create trigger trg_debts_updated_at
before update on public.debts
for each row execute function public.set_updated_at();

create unique index if not exists debts_unique_active_account
  on public.debts(account_id)
  where deleted_at is null;

create index if not exists idx_debts_household
  on public.debts(household_id);

create index if not exists idx_debts_household_status
  on public.debts(household_id, status)
  where deleted_at is null;

create index if not exists idx_debts_account
  on public.debts(account_id);

alter table public.debts enable row level security;

drop policy if exists "debts_select_member" on public.debts;
drop policy if exists "debts_insert_editor" on public.debts;
drop policy if exists "debts_update_editor" on public.debts;
drop policy if exists "debts_delete_editor" on public.debts;

create policy "debts_select_member"
on public.debts
for select
to authenticated
using (
  deleted_at is null
  and public.is_household_member(household_id)
);

create policy "debts_insert_editor"
on public.debts
for insert
to authenticated
with check (
  public.is_household_editor(household_id)
  and created_by = auth.uid()
);

create policy "debts_update_editor"
on public.debts
for update
to authenticated
using (
  deleted_at is null
  and public.is_household_editor(household_id)
)
with check (
  public.is_household_editor(household_id)
);

create policy "debts_delete_editor"
on public.debts
for delete
to authenticated
using (public.is_household_editor(household_id));

create or replace function public.create_debt_with_account(
  p_household_id uuid,
  p_name text,
  p_existing_account_id uuid default null,
  p_account_type text default 'debt',
  p_currency_code varchar(3) default null,
  p_opening_balance_amount numeric default null,
  p_opening_balance_date date default current_date,
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
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  -- Creating a new liability account follows the account-admin boundary.
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
        1,
        -abs(v_opening_balance_amount),
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
  text,
  numeric,
  integer,
  text,
  text
) to authenticated;

create or replace function public.update_debt_metadata(
  p_debt_id uuid,
  p_name text,
  p_original_principal numeric default null,
  p_interest_rate numeric default null,
  p_interest_rate_period text default null,
  p_minimum_payment numeric default null,
  p_payment_due_day integer default null,
  p_lender_name text default null,
  p_status text default 'active',
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_household_id uuid;
  v_name text;
  v_interest_rate_period text;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_debt_id is null then
    raise exception 'debt_id is required';
  end if;

  select d.household_id
  into v_household_id
  from public.debts d
  where d.id = p_debt_id
    and d.deleted_at is null;

  if v_household_id is null then
    raise exception 'debt not found';
  end if;

  if not public.is_household_editor(v_household_id) then
    raise exception 'Not authorized to update debts for this household';
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');
  v_interest_rate_period := nullif(trim(coalesce(p_interest_rate_period, '')), '');
  v_status := nullif(trim(coalesce(p_status, '')), '');

  if v_name is null then
    raise exception 'name is required';
  end if;

  if v_interest_rate_period is not null
    and v_interest_rate_period not in ('monthly', 'annual') then
    raise exception 'interest_rate_period must be monthly or annual';
  end if;

  if v_status is null or v_status not in ('active', 'inactive') then
    raise exception 'status must be active or inactive';
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

  update public.debts
  set name = v_name,
      lender_name = nullif(trim(coalesce(p_lender_name, '')), ''),
      original_principal = p_original_principal,
      interest_rate = p_interest_rate,
      interest_rate_period = v_interest_rate_period,
      minimum_payment = p_minimum_payment,
      payment_due_day = p_payment_due_day,
      status = v_status,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      updated_by = auth.uid()
  where id = p_debt_id
    and deleted_at is null;

  return p_debt_id;
end;
$$;

grant execute on function public.update_debt_metadata(
  uuid,
  text,
  numeric,
  numeric,
  text,
  numeric,
  integer,
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
