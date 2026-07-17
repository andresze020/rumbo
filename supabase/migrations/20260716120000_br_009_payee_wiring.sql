-- ============================================================
-- App Finanzas — br_009_payee_wiring.sql
-- BR-009 (slice 1): wire payee_id into the manual transaction RPCs.
-- ------------------------------------------------------------
-- The `payees` table + nullable `transactions.payee_id` FK already exist
-- (20260622100000_create_payees.sql) and are backfilled from merchant_name,
-- but nothing writes payee_id yet. This migration:
--   1. Adds `get_or_create_payee(household, name)` — normalizes a free-text
--      payee name into a `payees` row (case/whitespace-insensitive), creating
--      it when new. security invoker, so RLS (`payees_insert_editor`) applies.
--   2. Re-creates `create_manual_transaction` / `update_manual_transaction`
--      with a trailing `p_payee_name text` argument that resolves + stores
--      payee_id and keeps merchant_name in sync (so existing merchant-based
--      list/report displays keep working).
--
-- ADDITIVE + backward-compatible: the new arg defaults to null, so existing
-- callers that don't pass it (e.g. recurring auto-post) behave exactly as
-- before (payee_id untouched, merchant_name from p_merchant_name).
--
-- NOTE (function overload trap): adding a parameter via CREATE OR REPLACE
-- leaves the old signature alive as a second overload, which PostgREST cannot
-- disambiguate. Each function's OLD signature is dropped explicitly first.
--
-- Depends on: public.payees, public.transactions, public.transaction_entries,
-- public.transaction_allocations, public.is_household_editor(uuid).
-- ============================================================

-- ── 1. Payee normalizer ─────────────────────────────────────────────────────
create or replace function public.get_or_create_payee(
  p_household_id uuid,
  p_name text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_name text;
  v_payee_id uuid;
begin
  v_name := nullif(trim(coalesce(p_name, '')), '');

  if p_household_id is null or v_name is null then
    return null;
  end if;

  -- Reuse an existing payee (case/whitespace-insensitive) before creating one.
  select id
  into v_payee_id
  from public.payees
  where household_id = p_household_id
    and lower(name) = lower(v_name)
  limit 1;

  if v_payee_id is not null then
    return v_payee_id;
  end if;

  insert into public.payees (household_id, name)
  values (p_household_id, v_name)
  on conflict (household_id, lower(name)) do nothing
  returning id into v_payee_id;

  -- Lost a race with a concurrent insert of the same name: re-read the winner.
  if v_payee_id is null then
    select id
    into v_payee_id
    from public.payees
    where household_id = p_household_id
      and lower(name) = lower(v_name)
    limit 1;
  end if;

  return v_payee_id;
end;
$$;

grant execute on function public.get_or_create_payee(uuid, text) to authenticated;

-- ── 2. create_manual_transaction (+ p_payee_name) ───────────────────────────
drop function if exists public.create_manual_transaction(
  uuid, text, date, uuid, uuid, numeric, text, text, text, text, numeric
);

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
  p_exchange_rate_to_base numeric default 1,
  p_payee_name text default null
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
  v_payee_id uuid;
  v_merchant_name text;
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

  -- Normalize the payee, then keep merchant_name in sync (prefer an explicit
  -- merchant, otherwise mirror the chosen payee's canonical name).
  v_payee_id := public.get_or_create_payee(p_household_id, p_payee_name);
  v_merchant_name := coalesce(
    nullif(trim(coalesce(p_merchant_name, '')), ''),
    nullif(trim(coalesce(p_payee_name, '')), '')
  );

  insert into public.transactions (
    household_id,
    transaction_type,
    transaction_date,
    description,
    merchant_name,
    payee_id,
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
    v_merchant_name,
    v_payee_id,
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
  numeric,
  text
) to authenticated;

-- ── 3. update_manual_transaction (+ p_payee_name) ───────────────────────────
drop function if exists public.update_manual_transaction(
  uuid, uuid, uuid, numeric, date, text, text, text, text
);

create or replace function public.update_manual_transaction(
  p_transaction_id uuid,
  p_account_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_transaction_date date,
  p_description text default null,
  p_merchant_name text default null,
  p_notes text default null,
  p_status text default 'posted',
  p_payee_name text default null
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
  v_payee_id uuid;
  v_merchant_name text;
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
    t.deleted_at,
    t.payee_id
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

  -- Payee handling:
  --   * p_payee_name IS NULL  → legacy caller, leave payee_id untouched and use
  --                             p_merchant_name for merchant_name (old behavior).
  --   * p_payee_name = ''      → user cleared the payee → clear payee + merchant.
  --   * p_payee_name non-empty → resolve/create payee, mirror to merchant_name.
  if p_payee_name is null then
    v_payee_id := v_transaction.payee_id;
    v_merchant_name := nullif(trim(coalesce(p_merchant_name, '')), '');
  else
    v_payee_id := public.get_or_create_payee(v_transaction.household_id, p_payee_name);
    v_merchant_name := coalesce(
      nullif(trim(coalesce(p_merchant_name, '')), ''),
      nullif(trim(p_payee_name), '')
    );
  end if;

  update public.transactions
  set
    transaction_date = p_transaction_date,
    description = nullif(trim(coalesce(p_description, '')), ''),
    merchant_name = v_merchant_name,
    payee_id = v_payee_id,
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
  text,
  text
) to authenticated;
