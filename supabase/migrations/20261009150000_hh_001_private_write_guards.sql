-- ============================================================
-- Rumbo — HH-1 (4/5): private accounts — write guards in functions
-- Spec: docs/features/household-sharing.md §7 HH-1, S4, S5, S19, S20, S22,
-- S23, PRV-7, PRV-9.
-- ------------------------------------------------------------
-- Every function that takes an account, payee or transaction id was reviewed
-- (inventory in the HH-1 PR). Most needed nothing: they are SECURITY INVOKER
-- and already re-read each account / transaction under the caller's RLS, so
-- another member's private one is "not found" with the same text as a missing
-- one (S4/S5) — create_transfer_transaction, create_balance_adjustment,
-- create_debt_payment, cancel_installment_plan, create_csv_import,
-- revert_csv_import, apply_goal_adjustment, update_debt_metadata.
--
-- Re-created below, each a verbatim copy of its latest definition plus only
-- the change named in its section header:
--    1  get_or_create_payee        new signature: privacy context (PRV-7)
--    2  create_manual_transaction  payee context
--    3  update_manual_transaction  S22 owner guard + payee context (a kept
--                                  private payee follows the transaction to
--                                  a shared account)
--    4  update_transfer_transaction  S22
--    5  void_transaction           S22
--    6  unvoid_transaction         S22
--    7  set_transaction_tags       S22
--    8  create_refund_transaction  S23 + payee context
--    9  create_installment_plan    payee context
--   10  create_opening_balance     a private account's owner (any editor)
--   11  create_debt_with_account  + p_private; private owner (any editor)
--   12  merge_payees              never across visibility
--   13  copy_household_data       refuses a source with private data (S20)
--   14  run_recurring_autopost    skips rules of an inactive private owner (S19)
--   15  the stale 8-argument create_transfer_transaction is dropped (no caller
--       in src/ or supabase/; the app and fixtures call the 12-argument one)
--
-- S22 guard text is the same everywhere: a co-member can SEE a mixed
-- transfer's shared side (so this reveals nothing they do not already see) but
-- only the private account's owner may change it. Without the explicit check
-- the UPDATE would silently match no row under the new policy and the RPC
-- would report success.
-- ============================================================

-- ------------------------------------------------------------
-- 1. get_or_create_payee: the privacy context (PRV-7)
-- ------------------------------------------------------------
-- New third argument: the account ids of the transaction (or template) the
-- payee is for. Private when EVERY one of them is the caller's private
-- account — then the caller's own private payee of that name is reused, or a
-- shared one if it exists (reusing a visible name reveals nothing), or a new
-- private one is created. Otherwise the shared payee is reused or created.
-- An account the caller cannot see answers exactly like a missing one (S5).
-- Also gains the editor check it never had (viewers used to hit a raw RLS
-- error). Old signature dropped (contract §9.5); no default on the new
-- argument, so a caller that forgets the context fails loudly instead of
-- quietly creating a shared payee.
drop function if exists public.get_or_create_payee(uuid, text);

create or replace function public.get_or_create_payee(
  p_household_id uuid,
  p_name text,
  p_account_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_name text;
  v_payee_id uuid;
  v_wanted integer;
  v_found integer;
  v_mine integer;
  v_owner uuid;
begin
  v_name := nullif(trim(coalesce(p_name, '')), '');

  if p_household_id is null or v_name is null then
    return null;
  end if;

  if not public.is_household_editor(p_household_id) then
    raise exception 'Not authorized to create payees for this household';
  end if;

  select count(distinct x.id)
  into v_wanted
  from unnest(coalesce(p_account_ids, '{}'::uuid[])) as x(id)
  where x.id is not null;

  -- Under the caller's RLS: another member's private account is not found.
  select
    count(*),
    count(*) filter (where a.private_owner_id = auth.uid())
  into v_found, v_mine
  from public.accounts a
  where a.household_id = p_household_id
    and a.id in (select distinct x.id from unnest(coalesce(p_account_ids, '{}'::uuid[])) as x(id));

  if v_found < v_wanted then
    raise exception 'account not found for household';
  end if;

  v_owner := case when v_found > 0 and v_mine = v_found then auth.uid() end;

  if v_owner is not null then
    select p.id
    into v_payee_id
    from public.payees p
    where p.household_id = p_household_id
      and p.private_owner_id = v_owner
      and lower(p.name) = lower(v_name)
    limit 1;

    if v_payee_id is not null then
      return v_payee_id;
    end if;
  end if;

  select p.id
  into v_payee_id
  from public.payees p
  where p.household_id = p_household_id
    and p.private_owner_id is null
    and lower(p.name) = lower(v_name)
  limit 1;

  if v_payee_id is not null then
    return v_payee_id;
  end if;

  if v_owner is null then
    insert into public.payees (household_id, name)
    values (p_household_id, v_name)
    on conflict (household_id, lower(name)) where private_owner_id is null do nothing
    returning id into v_payee_id;
  else
    insert into public.payees (household_id, name, private_owner_id)
    values (p_household_id, v_name, v_owner)
    on conflict (household_id, private_owner_id, lower(name)) where private_owner_id is not null do nothing
    returning id into v_payee_id;
  end if;

  -- Lost a race with a concurrent insert of the same name: re-read the winner.
  if v_payee_id is null then
    select p.id
    into v_payee_id
    from public.payees p
    where p.household_id = p_household_id
      and p.private_owner_id is not distinct from v_owner
      and lower(p.name) = lower(v_name)
    limit 1;
  end if;

  return v_payee_id;
end;
$$;

revoke all on function public.get_or_create_payee(uuid, text, uuid[]) from public, anon;
grant execute on function public.get_or_create_payee(uuid, text, uuid[]) to authenticated;

-- ------------------------------------------------------------
-- 2. create_manual_transaction: payee privacy context (only change)
-- ------------------------------------------------------------
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
  v_payee_id := public.get_or_create_payee(p_household_id, p_payee_name, array[p_account_id]);
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


-- ------------------------------------------------------------
-- 3. update_manual_transaction: S22 owner guard + payee privacy context; a
-- kept private payee is replaced by the shared one when the transaction moves
-- to a shared account
-- ------------------------------------------------------------
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

    -- HH-1: a payee is never more private than its transaction. Moving the
    -- transaction onto a shared account turns a kept private payee into the
    -- shared payee of the same name.
    if v_payee_id is not null
       and exists (select 1 from public.payees p where p.id = v_payee_id and p.private_owner_id is not null)
       and exists (select 1 from public.accounts a where a.id = p_account_id and a.private_owner_id is null) then
      v_payee_id := public.get_or_create_payee(
        v_transaction.household_id,
        (select p.name from public.payees p where p.id = v_payee_id),
        array[p_account_id]
      );
    end if;
  else
    v_payee_id := public.get_or_create_payee(v_transaction.household_id, p_payee_name, array[p_account_id]);
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


-- ------------------------------------------------------------
-- 4. update_transfer_transaction: S22 owner guard (only change)
-- ------------------------------------------------------------
create or replace function public.update_transfer_transaction(
  p_transaction_id uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_transaction_date date,
  p_description text default null,
  p_notes text default null,
  p_status text default 'posted',
  p_exchange_rate_to_base numeric(18,8) default 1,
  p_to_amount numeric default null,
  p_cost_base numeric default null,
  p_cost_category_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction record;
  v_base_currency varchar(3);
  v_from_currency varchar(3);
  v_to_currency varchar(3);
  v_from_amount numeric(18,4);
  v_to_amount numeric(18,4);
  v_from_rate numeric(18,8);
  v_to_rate numeric(18,8);
  v_from_base numeric(18,4);
  v_to_base numeric(18,4);
  v_cost numeric(18,4);
  v_entry_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if p_transaction_id is null then raise exception 'transaction_id is required'; end if;
  if p_from_account_id is null then raise exception 'from_account_id is required'; end if;
  if p_to_account_id is null then raise exception 'to_account_id is required'; end if;
  if p_from_account_id = p_to_account_id then
    raise exception 'from_account_id and to_account_id must be different';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be greater than 0'; end if;
  if p_transaction_date is null then raise exception 'transaction_date is required'; end if;
  if p_status is null or p_status not in ('pending', 'posted') then
    raise exception 'status must be pending or posted';
  end if;
  if p_exchange_rate_to_base is null or p_exchange_rate_to_base <= 0 then
    raise exception 'exchange_rate_to_base must be greater than 0';
  end if;

  select t.id, t.household_id, t.transaction_type, t.status, t.source, t.deleted_at
  into v_transaction
  from public.transactions t where t.id = p_transaction_id;

  if v_transaction.id is null then raise exception 'transaction not found'; end if;
  if v_transaction.transaction_type <> 'transfer' then
    raise exception 'Only transfer transactions can be edited with update_transfer_transaction.';
  end if;
  if v_transaction.source <> 'manual' then
    raise exception 'Only manual transfer transactions can be edited in this version.';
  end if;
  if v_transaction.deleted_at is not null or v_transaction.status in ('voided', 'deleted_soft') then
    raise exception 'Voided or deleted transfers cannot be edited';
  end if;
  if not public.is_household_editor(v_transaction.household_id) then
    raise exception 'Not authorized to edit transfers for this household';
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

  select h.base_currency into v_base_currency
  from public.households h where h.id = v_transaction.household_id;

  select a.currency_code into v_from_currency
  from public.accounts a
  where a.id = p_from_account_id and a.household_id = v_transaction.household_id
    and a.deleted_at is null and a.is_archived = false;
  if v_from_currency is null then raise exception 'from account not found or is not active'; end if;

  select a.currency_code into v_to_currency
  from public.accounts a
  where a.id = p_to_account_id and a.household_id = v_transaction.household_id
    and a.deleted_at is null and a.is_archived = false;
  if v_to_currency is null then raise exception 'to account not found or is not active'; end if;

  select count(*)::integer into v_entry_count
  from public.transaction_entries te
  where te.transaction_id = p_transaction_id and te.household_id = v_transaction.household_id;
  if v_entry_count <> 2 then raise exception 'transfer edit requires exactly two ledger entries'; end if;

  v_from_amount := abs(p_amount)::numeric(18,4);

  if v_from_currency = v_to_currency then
    v_to_amount := v_from_amount;
    v_cost := 0;
    v_from_rate := p_exchange_rate_to_base;
    v_to_rate := p_exchange_rate_to_base;
    v_from_base := (-v_from_amount * v_from_rate)::numeric(18,4);
    v_to_base := (v_to_amount * v_to_rate)::numeric(18,4);
  else
    if p_to_amount is null or p_to_amount <= 0 then
      raise exception 'Cross-currency transfers require the amount received (p_to_amount).';
    end if;
    v_to_amount := abs(p_to_amount)::numeric(18,4);
    v_cost := greatest(coalesce(p_cost_base, 0), 0)::numeric(18,4);

    if v_to_currency = v_base_currency then
      v_to_rate := 1;
      v_to_base := v_to_amount;
      v_from_base := (-(v_to_base + v_cost))::numeric(18,4);
      v_from_rate := ((v_to_base + v_cost) / v_from_amount)::numeric(18,8);
    elsif v_from_currency = v_base_currency then
      v_from_rate := 1;
      v_from_base := (-v_from_amount)::numeric(18,4);
      v_to_base := (v_from_amount - v_cost)::numeric(18,4);
      v_to_rate := (v_to_base / v_to_amount)::numeric(18,8);
    else
      v_from_rate := p_exchange_rate_to_base;
      v_from_base := (-(v_from_amount * v_from_rate))::numeric(18,4);
      v_to_base := ((v_from_amount * v_from_rate) - v_cost)::numeric(18,4);
      v_to_rate := (v_to_base / v_to_amount)::numeric(18,8);
    end if;

    if v_to_base <= 0 then
      raise exception 'The transfer cost is too large for the amounts entered.';
    end if;

    if v_cost > 0 then
      if p_cost_category_id is null then
        raise exception 'Pick a category for the transfer cost.';
      end if;
      perform public.assert_expense_category(v_transaction.household_id, p_cost_category_id);
    end if;
  end if;

  update public.transactions
  set transaction_date = p_transaction_date,
      description = nullif(trim(coalesce(p_description, '')), ''),
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      status = p_status,
      updated_by = auth.uid()
  where id = p_transaction_id and household_id = v_transaction.household_id;

  -- Rebuild entries + the cost allocation from scratch.
  delete from public.transaction_entries te
  where te.transaction_id = p_transaction_id and te.household_id = v_transaction.household_id;
  delete from public.transaction_allocations ta
  where ta.transaction_id = p_transaction_id and ta.household_id = v_transaction.household_id;

  insert into public.transaction_entries (
    household_id, transaction_id, account_id,
    amount_account_currency, currency_code,
    exchange_rate_to_base, amount_base_currency, entry_type, notes
  )
  values
    (v_transaction.household_id, p_transaction_id, p_from_account_id,
     -v_from_amount, v_from_currency, v_from_rate, v_from_base, 'movement', 'Transfer out'),
    (v_transaction.household_id, p_transaction_id, p_to_account_id,
     v_to_amount, v_to_currency, v_to_rate, v_to_base, 'movement', 'Transfer in');

  if v_cost > 0 and p_cost_category_id is not null then
    insert into public.transaction_allocations (
      household_id, transaction_id, category_id, allocation_type,
      amount_original_currency, currency_code, exchange_rate_to_base, amount_base_currency
    )
    values (
      v_transaction.household_id, p_transaction_id, p_cost_category_id, 'expense',
      v_cost, v_base_currency, 1, v_cost
    );
  end if;

  return p_transaction_id;
end;
$$;


-- ------------------------------------------------------------
-- 5. void_transaction: S22 owner guard (only change)
-- ------------------------------------------------------------
create or replace function public.void_transaction(
  p_transaction_id uuid,
  p_void_reason text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_household_id uuid;
  v_status text;
  v_deleted_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_transaction_id is null then
    raise exception 'transaction_id is required';
  end if;

  select
    t.household_id,
    t.status,
    t.deleted_at
  into
    v_household_id,
    v_status,
    v_deleted_at
  from public.transactions t
  where t.id = p_transaction_id;

  if v_household_id is null then
    raise exception 'transaction not found';
  end if;

  if not public.is_household_editor(v_household_id) then
    raise exception 'Not authorized to void transactions for this household';
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

  if v_deleted_at is not null then
    raise exception 'Cannot void a deleted transaction';
  end if;

  if v_status = 'voided' then
    raise exception 'Transaction is already voided';
  end if;

  if v_status = 'deleted_soft' then
    raise exception 'Cannot void a soft-deleted transaction';
  end if;

  if v_status not in ('posted', 'pending') then
    raise exception 'Only posted or pending transactions can be voided';
  end if;

  -- Ledger rows remain unchanged for traceability. Financial calculations
  -- exclude this transaction through transactions.status = 'voided'.
  update public.transactions
  set
    status = 'voided',
    voided_at = now(),
    voided_by = auth.uid(),
    void_reason = nullif(trim(coalesce(p_void_reason, '')), ''),
    updated_by = auth.uid()
  where id = p_transaction_id
    and household_id = v_household_id;

  return p_transaction_id;
end;
$$;


-- ------------------------------------------------------------
-- 6. unvoid_transaction: S22 owner guard (only change)
-- ------------------------------------------------------------
create or replace function public.unvoid_transaction(
  p_transaction_id uuid,
  p_restore_status text default 'posted'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_household_id uuid;
  v_status text;
  v_deleted_at timestamptz;
  v_restore_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_transaction_id is null then
    raise exception 'transaction_id is required';
  end if;

  v_restore_status := coalesce(nullif(trim(p_restore_status), ''), 'posted');
  if v_restore_status not in ('posted', 'pending') then
    raise exception 'Can only restore a transaction to posted or pending';
  end if;

  select
    t.household_id,
    t.status,
    t.deleted_at
  into
    v_household_id,
    v_status,
    v_deleted_at
  from public.transactions t
  where t.id = p_transaction_id;

  if v_household_id is null then
    raise exception 'transaction not found';
  end if;

  if not public.is_household_editor(v_household_id) then
    raise exception 'Not authorized to restore transactions for this household';
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

  if v_deleted_at is not null then
    raise exception 'Cannot restore a deleted transaction';
  end if;

  if v_status <> 'voided' then
    raise exception 'Only voided transactions can be restored';
  end if;

  update public.transactions
  set
    status = v_restore_status,
    voided_at = null,
    voided_by = null,
    void_reason = null,
    updated_by = auth.uid()
  where id = p_transaction_id
    and household_id = v_household_id;

  return p_transaction_id;
end;
$$;


-- ------------------------------------------------------------
-- 7. set_transaction_tags: S22 owner guard (only change)
-- ------------------------------------------------------------
create or replace function public.set_transaction_tags(
  p_transaction_id uuid,
  p_tag_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_household_id uuid;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_transaction_id is null then
    raise exception 'transaction_id is required';
  end if;

  select household_id
  into v_household_id
  from public.transactions
  where id = p_transaction_id
    and deleted_at is null;

  if v_household_id is null then
    raise exception 'transaction not found';
  end if;

  if not public.is_household_editor(v_household_id) then
    raise exception 'Not authorized to tag transactions for this household';
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

  -- Remove links that are no longer selected (or all of them when clearing).
  delete from public.transaction_tags tt
  where tt.transaction_id = p_transaction_id
    and (
      p_tag_ids is null
      or tt.tag_id <> all(p_tag_ids)
    );

  -- Add newly selected tags that belong to this household. Foreign or unknown
  -- ids never match the join, so they're skipped; existing links are no-ops.
  if p_tag_ids is not null and array_length(p_tag_ids, 1) is not null then
    insert into public.transaction_tags (household_id, transaction_id, tag_id)
    select v_household_id, p_transaction_id, tg.id
    from public.tags tg
    where tg.id = any(p_tag_ids)
      and tg.household_id = v_household_id
    on conflict (transaction_id, tag_id) do nothing;
  end if;

  select count(*)::integer
  into v_count
  from public.transaction_tags
  where transaction_id = p_transaction_id;

  return v_count;
end;
$$;


-- ------------------------------------------------------------
-- 8. create_refund_transaction: S23 same visibility + payee privacy context
-- ------------------------------------------------------------
create or replace function public.create_refund_transaction(
  p_household_id uuid,
  p_account_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_transaction_date date,
  p_description text default null,
  p_refunded_transaction_id uuid default null,
  p_notes text default null,
  p_payee_name text default null,
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
  v_payee_id uuid;
  v_account_owner uuid;
  v_amount numeric(18,4);
  v_original_expense numeric(18,4);
  v_already_refunded numeric(18,4);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if not public.is_household_editor(p_household_id) then
    raise exception 'Not authorized to create refunds for this household';
  end if;

  if p_account_id is null then
    raise exception 'account_id is required';
  end if;

  if p_category_id is null then
    raise exception 'category_id is required';
  end if;

  -- The refund is *entered* as a positive amount; the sign is applied below, so
  -- the caller never has to think about it.
  if p_amount is null or p_amount <= 0 then
    raise exception 'The refund amount must be greater than 0';
  end if;

  if p_transaction_date is null then
    raise exception 'transaction_date is required';
  end if;

  if p_exchange_rate_to_base is null or p_exchange_rate_to_base <= 0 then
    raise exception 'exchange_rate_to_base must be greater than 0';
  end if;

  v_amount := round(p_amount, 2)::numeric(18,4);

  select a.currency_code, a.is_archived, a.deleted_at, a.private_owner_id
  into v_account_currency, v_account_archived, v_account_deleted_at, v_account_owner
  from public.accounts a
  where a.id = p_account_id and a.household_id = p_household_id;

  if v_account_currency is null then
    raise exception 'account not found for household';
  end if;
  if v_account_archived or v_account_deleted_at is not null then
    raise exception 'account is not active';
  end if;

  select c.reporting_type, c.is_archived, c.deleted_at
  into v_category_reporting_type, v_category_archived, v_category_deleted_at
  from public.categories c
  where c.id = p_category_id and c.household_id = p_household_id;

  if v_category_reporting_type is null then
    raise exception 'category not found for household';
  end if;
  if v_category_archived or v_category_deleted_at is not null then
    raise exception 'category is not active';
  end if;
  -- A refund reduces a *cost*, so it can only sit in an expense category. In any
  -- other category the negative allocation would also violate the narrowed
  -- CHECK above, but failing here says why.
  if v_category_reporting_type not in ('expense', 'debt_interest') then
    raise exception 'A refund must be filed under the expense category it refunds';
  end if;

  -- When the refund is linked to an original expense, it must not exceed what is
  -- left of it. Without this, a category could be driven arbitrarily negative by
  -- a typo — and "the category nets to the true cost" would stop being true.
  if p_refunded_transaction_id is not null then
    select coalesce(sum(ta.amount_base_currency), 0)::numeric(18,4)
    into v_original_expense
    from public.transaction_allocations ta
    join public.transactions t
      on t.id = ta.transaction_id
      and t.household_id = ta.household_id
    where ta.transaction_id = p_refunded_transaction_id
      and ta.household_id = p_household_id
      and ta.allocation_type = 'expense'
      and t.status = 'posted'
      and t.deleted_at is null;

    if v_original_expense <= 0 then
      raise exception 'The transaction being refunded is not a posted expense of this household';
    end if;

    -- S23: a refund lands in an account with the same visibility as the
    -- purchase, so its link never points other members at a hidden
    -- transaction (or puts a private purchase's refund in shared numbers).
    if (
      select t.private_owner_id from public.transactions t where t.id = p_refunded_transaction_id
    ) is distinct from v_account_owner then
      raise exception 'A refund must go to an account with the same visibility as the purchase';
    end if;

    -- Refunds already recorded against the same original (stored negative, so
    -- this sum is negative).
    select coalesce(sum(ta.amount_base_currency), 0)::numeric(18,4)
    into v_already_refunded
    from public.transaction_allocations ta
    join public.transactions t
      on t.id = ta.transaction_id
      and t.household_id = ta.household_id
    where t.refunded_transaction_id = p_refunded_transaction_id
      and ta.household_id = p_household_id
      and t.status = 'posted'
      and t.deleted_at is null;

    if (v_amount * p_exchange_rate_to_base) > (v_original_expense + v_already_refunded) then
      raise exception
        'That is more than is left to refund on this transaction (% remaining).',
        round(v_original_expense + v_already_refunded, 2);
    end if;
  end if;

  if p_payee_name is not null and length(trim(p_payee_name)) > 0 then
    v_payee_id := public.get_or_create_payee(p_household_id, trim(p_payee_name), array[p_account_id]);
  end if;

  insert into public.transactions (
    household_id, transaction_type, transaction_date,
    description, payee_id, notes, status, source, created_by,
    refunded_transaction_id
  )
  values (
    p_household_id, 'refund', p_transaction_date,
    nullif(trim(coalesce(p_description, '')), ''),
    v_payee_id,
    nullif(trim(coalesce(p_notes, '')), ''),
    'posted', 'manual', auth.uid(),
    p_refunded_transaction_id
  )
  returning id into v_transaction_id;

  -- Positive: the money comes back into the account.
  insert into public.transaction_entries (
    household_id, transaction_id, account_id,
    amount_account_currency, currency_code,
    exchange_rate_to_base, amount_base_currency, entry_type, notes
  )
  values (
    p_household_id, v_transaction_id, p_account_id,
    v_amount, v_account_currency,
    p_exchange_rate_to_base, (v_amount * p_exchange_rate_to_base)::numeric(18,4),
    'movement', 'Refund'
  );

  -- Negative, `expense`, same category: this is the line that makes the category
  -- net to the true cost, in every report, budget and closure, with no change to
  -- any of them.
  insert into public.transaction_allocations (
    household_id, transaction_id, category_id, allocation_type,
    amount_original_currency, currency_code, exchange_rate_to_base, amount_base_currency
  )
  values (
    p_household_id, v_transaction_id, p_category_id, 'expense',
    -v_amount, v_account_currency,
    p_exchange_rate_to_base, (-v_amount * p_exchange_rate_to_base)::numeric(18,4)
  );

  return v_transaction_id;
end;
$$;


-- ------------------------------------------------------------
-- 9. create_installment_plan: payee privacy context (only change)
-- ------------------------------------------------------------
create or replace function public.create_installment_plan(
  p_household_id uuid,
  p_account_id uuid,
  p_category_id uuid,
  p_total_amount numeric,
  p_installment_count integer,
  p_start_date date,
  p_description text,
  p_payee_name text default null,
  p_notes text default null,
  p_exchange_rate_to_base numeric default 1
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_account_currency varchar(3);
  v_account_archived boolean;
  v_account_deleted_at timestamptz;
  v_category_reporting_type text;
  v_category_archived boolean;
  v_category_deleted_at timestamptz;
  v_payee_id uuid;
  v_total numeric(18,4);
  v_per numeric(18,4);
  v_last numeric(18,4);
  v_amount numeric(18,4);
  v_date date;
  v_txn_id uuid;
  v_index integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if not public.is_household_editor(p_household_id) then
    raise exception 'Not authorized to create installment plans for this household';
  end if;

  if p_account_id is null then
    raise exception 'account_id is required';
  end if;

  if p_category_id is null then
    raise exception 'category_id is required';
  end if;

  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'The total must be greater than 0';
  end if;

  if p_installment_count is null or p_installment_count < 2 or p_installment_count > 60 then
    raise exception 'The number of installments must be between 2 and 60';
  end if;

  if p_start_date is null then
    raise exception 'start_date is required';
  end if;

  if p_description is null or length(trim(p_description)) = 0 then
    raise exception 'A description is required';
  end if;

  if p_exchange_rate_to_base is null or p_exchange_rate_to_base <= 0 then
    raise exception 'exchange_rate_to_base must be greater than 0';
  end if;

  select a.currency_code, a.is_archived, a.deleted_at
  into v_account_currency, v_account_archived, v_account_deleted_at
  from public.accounts a
  where a.id = p_account_id and a.household_id = p_household_id;

  if v_account_currency is null then
    raise exception 'account not found for household';
  end if;
  if v_account_archived or v_account_deleted_at is not null then
    raise exception 'account is not active';
  end if;

  select c.reporting_type, c.is_archived, c.deleted_at
  into v_category_reporting_type, v_category_archived, v_category_deleted_at
  from public.categories c
  where c.id = p_category_id and c.household_id = p_household_id;

  if v_category_reporting_type is null then
    raise exception 'category not found for household';
  end if;
  if v_category_archived or v_category_deleted_at is not null then
    raise exception 'category is not active';
  end if;
  -- An installment plan is a purchase, so it files under an expense category.
  if v_category_reporting_type not in ('expense', 'debt_interest') then
    raise exception 'An installment plan requires an expense category';
  end if;

  if p_payee_name is not null and length(trim(p_payee_name)) > 0 then
    v_payee_id := public.get_or_create_payee(p_household_id, trim(p_payee_name), array[p_account_id]);
  end if;

  v_total := round(p_total_amount, 2)::numeric(18,4);
  -- Equal installments, with the remainder on the last one so the N amounts sum
  -- back to the total exactly.
  v_per := round(v_total / p_installment_count, 2)::numeric(18,4);
  v_last := (v_total - v_per * (p_installment_count - 1))::numeric(18,4);

  -- A pathological total/count split (e.g. a total so small that each rounded
  -- installment is 0) would violate the entries' nonzero check further down
  -- with a confusing message. Say it plainly here instead.
  if v_per <= 0 or v_last <= 0 then
    raise exception 'The total is too small to split into % installments', p_installment_count;
  end if;

  insert into public.installment_plans (
    household_id, account_id, category_id, payee_id,
    description, total_amount, currency_code, installment_count,
    start_date, status, created_by
  )
  values (
    p_household_id, p_account_id, p_category_id, v_payee_id,
    trim(p_description), v_total, v_account_currency, p_installment_count,
    p_start_date, 'active', auth.uid()
  )
  returning id into v_plan_id;

  for v_index in 1..p_installment_count loop
    v_amount := case when v_index = p_installment_count then v_last else v_per end;

    -- Clamp the day into the target month: Jan 31 + 1 month → Feb 28, not Mar 3.
    v_date := (
      date_trunc('month', p_start_date) + ((v_index - 1) || ' months')::interval
      + (least(
          extract(day from p_start_date)::integer,
          extract(day from (
            date_trunc('month', p_start_date)
            + ((v_index - 1) || ' months')::interval
            + interval '1 month - 1 day'
          ))::integer
        ) - 1) * interval '1 day'
    )::date;

    insert into public.transactions (
      household_id, transaction_type, transaction_date,
      description, payee_id, notes, status, source, created_by,
      installment_plan_id, installment_number
    )
    values (
      p_household_id, 'expense', v_date,
      trim(p_description), v_payee_id, nullif(trim(coalesce(p_notes, '')), ''),
      'posted', 'manual', auth.uid(),
      v_plan_id, v_index
    )
    returning id into v_txn_id;

    -- An expense leaves the account, so the entry is negative (same convention
    -- as create_manual_transaction).
    insert into public.transaction_entries (
      household_id, transaction_id, account_id,
      amount_account_currency, currency_code,
      exchange_rate_to_base, amount_base_currency, entry_type
    )
    values (
      p_household_id, v_txn_id, p_account_id,
      -v_amount, v_account_currency,
      p_exchange_rate_to_base, (-v_amount * p_exchange_rate_to_base)::numeric(18,4),
      'movement'
    );

    insert into public.transaction_allocations (
      household_id, transaction_id, category_id, allocation_type,
      amount_original_currency, currency_code, exchange_rate_to_base, amount_base_currency
    )
    values (
      p_household_id, v_txn_id, p_category_id, 'expense',
      v_amount, v_account_currency,
      p_exchange_rate_to_base, (v_amount * p_exchange_rate_to_base)::numeric(18,4)
    );
  end loop;

  return v_plan_id;
end;
$$;


-- ------------------------------------------------------------
-- 10. create_opening_balance: a private account's owner may set it
-- ------------------------------------------------------------
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
  v_account_owner uuid;
  v_signed_entry_amount numeric(18,4);
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  -- A shared account's opening balance is owner/admin work; a private
  -- account's is its owner's (any editor), checked once the account is read.
  if not public.is_household_editor(p_household_id) then
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
    a.deleted_at,
    a.private_owner_id
  into
    v_account_currency,
    v_account_class,
    v_account_archived,
    v_account_deleted_at,
    v_account_owner
  from public.accounts a
  where a.id = p_account_id
    and a.household_id = p_household_id;

  if v_account_currency is null then
    raise exception 'account not found for household';
  end if;

  if v_account_owner is null and not public.is_household_admin(p_household_id) then
    raise exception 'Not authorized to create opening balances for this household';
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


-- ------------------------------------------------------------
-- 11. create_debt_with_account: + p_private (new liability account private to
-- the caller); a private account's owner may create its debt. Old 15-argument
-- signature dropped (contract §9.5). The debt row and its opening-balance
-- transaction derive their privacy from the account (triggers).
-- ------------------------------------------------------------
drop function if exists public.create_debt_with_account(
  uuid, text, uuid, text, varchar, numeric, date, numeric, numeric, numeric, text, numeric, integer, text, text
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
  p_notes text default null,
  p_private boolean default false
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
  v_account_owner uuid;
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

  -- A shared debt (and its liability account) is owner/admin work; a
  -- private one is any editor's, for themselves (D5). Checked once we know
  -- which: the linked account's visibility, or p_private for a new account.
  if not public.is_household_editor(p_household_id) then
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
      a.deleted_at,
      a.private_owner_id
    into
      v_account_id,
      v_currency_code,
      v_account_type,
      v_account_class,
      v_account_archived,
      v_account_deleted_at,
      v_account_owner
    from public.accounts a
    where a.id = p_existing_account_id
      and a.household_id = p_household_id;

    if v_account_id is null then
      raise exception 'linked account not found for household';
    end if;

    if v_account_owner is null and not public.is_household_admin(p_household_id) then
      raise exception 'Not authorized to create debts for this household';
    end if;

    if v_account_archived or v_account_deleted_at is not null then
      raise exception 'linked account is not active';
    end if;

    if v_account_class <> 'liability' then
      raise exception 'linked account must be a liability account';
    end if;
  else
    if not coalesce(p_private, false) and not public.is_household_admin(p_household_id) then
      raise exception 'Not authorized to create debts for this household';
    end if;

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
      private_owner_id,
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
      case when coalesce(p_private, false) then auth.uid() end,
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


revoke all on function public.create_debt_with_account(
  uuid, text, uuid, text, varchar, numeric, date, numeric, numeric, numeric, text, numeric, integer, text, text, boolean
) from public, anon;
grant execute on function public.create_debt_with_account(
  uuid, text, uuid, text, varchar, numeric, date, numeric, numeric, numeric, text, numeric, integer, text, text, boolean
) to authenticated;

-- ------------------------------------------------------------
-- 12. merge_payees: never across visibility (merge_payees_bulk delegates here)
-- ------------------------------------------------------------
create or replace function public.merge_payees(
  p_household_id uuid,
  p_source_id uuid,
  p_target_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_target_name text;
  v_source_exists boolean;
  v_moved integer;
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if not public.is_household_editor(p_household_id) then
    raise exception 'Not authorized to merge payees for this household';
  end if;

  if p_source_id is null or p_target_id is null then
    raise exception 'source and target payees are required';
  end if;

  if p_source_id = p_target_id then
    raise exception 'source and target payees must be different';
  end if;

  -- Both payees must belong to this household. Read the surviving name so we
  -- can keep the denormalized merchant_name in sync with the winner.
  select name
  into v_target_name
  from public.payees
  where id = p_target_id
    and household_id = p_household_id;

  if v_target_name is null then
    raise exception 'target payee not found for household';
  end if;

  select true
  into v_source_exists
  from public.payees
  where id = p_source_id
    and household_id = p_household_id;

  if v_source_exists is null then
    raise exception 'source payee not found for household';
  end if;

  -- Merges never cross visibility: a private payee folds only into the same
  -- owner's private payees, a shared one only into shared ones.
  if (select p.private_owner_id from public.payees p where p.id = p_source_id)
     is distinct from (select p.private_owner_id from public.payees p where p.id = p_target_id) then
    raise exception 'A private payee and a shared payee cannot be merged';
  end if;

  -- Reassign every transaction and mirror the merchant label to the winner.
  update public.transactions
  set
    payee_id = p_target_id,
    merchant_name = v_target_name
  where household_id = p_household_id
    and payee_id = p_source_id;

  get diagnostics v_moved = row_count;

  -- Archive (never physically delete) the drained source payee.
  update public.payees
  set is_archived = true
  where id = p_source_id
    and household_id = p_household_id;

  return v_moved;
end;
$$;


-- ------------------------------------------------------------
-- 13. copy_household_data: refuse a source with private data (S20)
-- ------------------------------------------------------------
create or replace function public.copy_household_data(
  p_source_household_id uuid,
  p_target_household_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_n_categories int;
  v_n_accounts int;
  v_n_payees int;
  v_n_transactions int;
  v_n_entries int;
  v_n_allocations int;
  v_n_budgets int;
  v_n_budget_lines int;
  v_n_debts int;
  v_n_recurring int;
  v_n_goals int;
  v_n_exchange_rates int;
begin
  if p_source_household_id is null or p_target_household_id is null or p_actor_user_id is null then
    raise exception 'source_household_id, target_household_id, and actor_user_id are all required';
  end if;

  if p_source_household_id = p_target_household_id then
    raise exception 'source and target household must be different';
  end if;

  if not exists (
    select 1 from public.households where id = p_source_household_id and deleted_at is null
  ) then
    raise exception 'source household not found';
  end if;

  if not exists (
    select 1 from public.households where id = p_target_household_id and deleted_at is null
  ) then
    raise exception 'target household not found';
  end if;

  -- actor_user_id is only used to stamp created_by/updated_by/deleted_by on
  -- copied rows (several RLS insert policies require created_by = auth.uid(),
  -- so the rows need a real, consistent owner). It is intentionally NOT
  -- required to already be a member of either household: this function is
  -- a trusted maintenance tool run from the SQL editor (which bypasses RLS
  -- entirely), used precisely to seed a *separate* demo user's household
  -- from a real one — the real user and the demo user are different
  -- people/accounts on purpose.
  if not exists (
    select 1 from auth.users where id = p_actor_user_id
  ) then
    raise exception 'actor_user_id does not match an existing user';
  end if;

  -- S20: this definer tool bypasses RLS and stamps every copied row with one
  -- actor, so it cannot carry anyone's privacy across. It refuses a source
  -- that holds private data instead (accounts are the source of truth; a
  -- private payee can outlive its account's sharing).
  if exists (
    select 1 from public.accounts where household_id = p_source_household_id and private_owner_id is not null
  ) or exists (
    select 1 from public.payees where household_id = p_source_household_id and private_owner_id is not null
  ) then
    raise exception 'source household has private accounts or payees; copy_household_data only copies shared data';
  end if;

  -- ── Wipe the target household first. ────────────────────────────────────
  -- The copy is meant to leave the target as an exact mirror of the source,
  -- and target households normally already have data (at minimum the
  -- default categories every household gets seeded with on creation), which
  -- would otherwise collide with the copied rows on unique constraints
  -- (account/category names, budget month, etc.). This is the destructive
  -- part of this function: anything already in the target household is
  -- permanently gone after this runs. Order respects FKs without cascade
  -- (debts/recurring_transactions reference accounts/categories directly;
  -- transactions/budgets cascade their entries/allocations/lines, but they
  -- are deleted explicitly anyway for clarity).
  delete from public.transaction_allocations where household_id = p_target_household_id;
  delete from public.transaction_entries where household_id = p_target_household_id;
  delete from public.transactions where household_id = p_target_household_id;
  delete from public.budget_lines where household_id = p_target_household_id;
  delete from public.budgets where household_id = p_target_household_id;
  delete from public.debts where household_id = p_target_household_id;
  delete from public.recurring_transactions where household_id = p_target_household_id;
  delete from public.goals where household_id = p_target_household_id;
  delete from public.payees where household_id = p_target_household_id;
  delete from public.accounts where household_id = p_target_household_id;
  delete from public.categories where household_id = p_target_household_id;
  delete from public.exchange_rates where household_id = p_target_household_id;

  -- ── Id maps (old id -> new id), populated up front so every insert below
  --    can remap cross-references in a single pass. Dropped explicitly
  --    (rather than `on commit drop`) so the function can be called more
  --    than once in the same session/transaction. ─────────────────────────
  drop table if exists map_category, map_account, map_payee, map_transaction, map_budget;

  create temp table map_category (old_id uuid primary key, new_id uuid not null default gen_random_uuid());
  create temp table map_account (old_id uuid primary key, new_id uuid not null default gen_random_uuid());
  create temp table map_payee (old_id uuid primary key, new_id uuid not null default gen_random_uuid());
  create temp table map_transaction (old_id uuid primary key, new_id uuid not null default gen_random_uuid());
  create temp table map_budget (old_id uuid primary key, new_id uuid not null default gen_random_uuid());

  insert into map_category (old_id) select id from public.categories where household_id = p_source_household_id;
  insert into map_account (old_id) select id from public.accounts where household_id = p_source_household_id;
  insert into map_payee (old_id) select id from public.payees where household_id = p_source_household_id;
  insert into map_transaction (old_id) select id from public.transactions where household_id = p_source_household_id;
  insert into map_budget (old_id) select id from public.budgets where household_id = p_source_household_id;

  -- ── Categories (self-referencing parent_category_id) ───────────────────
  insert into public.categories (
    id, household_id, name, category_type, reporting_type, parent_category_id,
    is_system, is_archived, exclude_from_budget, exclude_from_reports,
    color, icon, sort_order, created_by, updated_by,
    created_at, updated_at, deleted_at, deleted_by
  )
  select
    mc.new_id, p_target_household_id, c.name, c.category_type, c.reporting_type, mp.new_id,
    c.is_system, c.is_archived, c.exclude_from_budget, c.exclude_from_reports,
    c.color, c.icon, c.sort_order, p_actor_user_id, p_actor_user_id,
    c.created_at, c.updated_at, c.deleted_at, case when c.deleted_at is not null then p_actor_user_id end
  from public.categories c
  join map_category mc on mc.old_id = c.id
  left join map_category mp on mp.old_id = c.parent_category_id
  where c.household_id = p_source_household_id;
  get diagnostics v_n_categories = row_count;

  -- ── Accounts ─────────────────────────────────────────────────────────
  insert into public.accounts (
    id, household_id, name, account_type, account_class, currency_code,
    institution_name, last_four, color, icon, opening_balance_date,
    is_archived, include_in_net_worth, sort_order, notes,
    created_by, updated_by, created_at, updated_at, deleted_at, deleted_by
  )
  select
    ma.new_id, p_target_household_id, a.name, a.account_type, a.account_class, a.currency_code,
    a.institution_name, a.last_four, a.color, a.icon, a.opening_balance_date,
    a.is_archived, a.include_in_net_worth, a.sort_order, a.notes,
    p_actor_user_id, p_actor_user_id, a.created_at, a.updated_at, a.deleted_at,
    case when a.deleted_at is not null then p_actor_user_id end
  from public.accounts a
  join map_account ma on ma.old_id = a.id
  where a.household_id = p_source_household_id;
  get diagnostics v_n_accounts = row_count;

  -- ── Payees ───────────────────────────────────────────────────────────
  insert into public.payees (id, household_id, name, created_at, updated_at)
  select mpy.new_id, p_target_household_id, py.name, py.created_at, py.updated_at
  from public.payees py
  join map_payee mpy on mpy.old_id = py.id
  where py.household_id = p_source_household_id;
  get diagnostics v_n_payees = row_count;

  -- ── Transactions (import_batch_id / import_row_id intentionally dropped) ─
  insert into public.transactions (
    id, household_id, transaction_date, transaction_type, status, source,
    description, notes, merchant_name, review_status, payee_id,
    created_by, updated_by, created_at, updated_at, deleted_at, deleted_by,
    voided_at, voided_by, void_reason
  )
  select
    mt.new_id, p_target_household_id, t.transaction_date, t.transaction_type, t.status, t.source,
    t.description, t.notes, t.merchant_name, t.review_status, mpy.new_id,
    p_actor_user_id, p_actor_user_id, t.created_at, t.updated_at, t.deleted_at,
    case when t.deleted_at is not null then p_actor_user_id end,
    t.voided_at, case when t.voided_at is not null then p_actor_user_id end, t.void_reason
  from public.transactions t
  join map_transaction mt on mt.old_id = t.id
  left join map_payee mpy on mpy.old_id = t.payee_id
  where t.household_id = p_source_household_id;
  get diagnostics v_n_transactions = row_count;

  -- ── Transaction entries ──────────────────────────────────────────────
  insert into public.transaction_entries (
    id, household_id, transaction_id, account_id, currency_code,
    entry_type, amount_account_currency, exchange_rate_to_base, amount_base_currency,
    notes, created_at, updated_at
  )
  select
    gen_random_uuid(), p_target_household_id, mt.new_id, ma.new_id, te.currency_code,
    te.entry_type, te.amount_account_currency, te.exchange_rate_to_base, te.amount_base_currency,
    te.notes, te.created_at, te.updated_at
  from public.transaction_entries te
  join map_transaction mt on mt.old_id = te.transaction_id
  join map_account ma on ma.old_id = te.account_id
  where te.household_id = p_source_household_id;
  get diagnostics v_n_entries = row_count;

  -- ── Transaction allocations ──────────────────────────────────────────
  insert into public.transaction_allocations (
    id, household_id, transaction_id, category_id, currency_code,
    allocation_type, amount_original_currency, exchange_rate_to_base, amount_base_currency,
    notes, created_at
  )
  select
    gen_random_uuid(), p_target_household_id, mt.new_id, mc.new_id, ta.currency_code,
    ta.allocation_type, ta.amount_original_currency, ta.exchange_rate_to_base, ta.amount_base_currency,
    ta.notes, ta.created_at
  from public.transaction_allocations ta
  join map_transaction mt on mt.old_id = ta.transaction_id
  join map_category mc on mc.old_id = ta.category_id
  where ta.household_id = p_source_household_id;
  get diagnostics v_n_allocations = row_count;

  -- ── Budgets ──────────────────────────────────────────────────────────
  insert into public.budgets (
    id, household_id, budget_month, status, currency_code,
    created_by, updated_by, created_at, updated_at, deleted_at, deleted_by
  )
  select
    mb.new_id, p_target_household_id, b.budget_month, b.status, b.currency_code,
    p_actor_user_id, p_actor_user_id, b.created_at, b.updated_at, b.deleted_at,
    case when b.deleted_at is not null then p_actor_user_id end
  from public.budgets b
  join map_budget mb on mb.old_id = b.id
  where b.household_id = p_source_household_id;
  get diagnostics v_n_budgets = row_count;

  -- ── Budget lines ─────────────────────────────────────────────────────
  insert into public.budget_lines (
    id, household_id, budget_id, category_id, planned_amount, notes,
    created_by, updated_by, created_at, updated_at, deleted_at, deleted_by
  )
  select
    gen_random_uuid(), p_target_household_id, mb.new_id, mc.new_id, bl.planned_amount, bl.notes,
    p_actor_user_id, p_actor_user_id, bl.created_at, bl.updated_at, bl.deleted_at,
    case when bl.deleted_at is not null then p_actor_user_id end
  from public.budget_lines bl
  join map_budget mb on mb.old_id = bl.budget_id
  join map_category mc on mc.old_id = bl.category_id
  where bl.household_id = p_source_household_id;
  get diagnostics v_n_budget_lines = row_count;

  -- ── Debts ────────────────────────────────────────────────────────────
  insert into public.debts (
    id, household_id, account_id, name, lender_name, original_principal,
    interest_rate, interest_rate_period, minimum_payment, payment_due_day,
    status, notes, created_by, updated_by, created_at, updated_at, deleted_at, deleted_by
  )
  select
    gen_random_uuid(), p_target_household_id, ma.new_id, d.name, d.lender_name, d.original_principal,
    d.interest_rate, d.interest_rate_period, d.minimum_payment, d.payment_due_day,
    d.status, d.notes, p_actor_user_id, p_actor_user_id, d.created_at, d.updated_at, d.deleted_at,
    case when d.deleted_at is not null then p_actor_user_id end
  from public.debts d
  join map_account ma on ma.old_id = d.account_id
  where d.household_id = p_source_household_id;
  get diagnostics v_n_debts = row_count;

  -- ── Recurring transaction templates ──────────────────────────────────
  insert into public.recurring_transactions (
    id, household_id, name, transaction_type, account_id, category_id,
    amount, currency_code, frequency, start_date, end_date, next_run_date,
    auto_post, is_active, created_by, created_at, updated_at
  )
  select
    gen_random_uuid(), p_target_household_id, r.name, r.transaction_type, ma.new_id, mc.new_id,
    r.amount, r.currency_code, r.frequency, r.start_date, r.end_date, r.next_run_date,
    r.auto_post, r.is_active, p_actor_user_id, r.created_at, r.updated_at
  from public.recurring_transactions r
  left join map_account ma on ma.old_id = r.account_id
  left join map_category mc on mc.old_id = r.category_id
  where r.household_id = p_source_household_id;
  get diagnostics v_n_recurring = row_count;

  -- ── Goals ────────────────────────────────────────────────────────────
  insert into public.goals (
    id, household_id, name, goal_type, target_amount, current_amount,
    currency_code, target_date, linked_account_id, status, created_by, created_at, updated_at
  )
  select
    gen_random_uuid(), p_target_household_id, g.name, g.goal_type, g.target_amount, g.current_amount,
    g.currency_code, g.target_date, ma.new_id, g.status, p_actor_user_id, g.created_at, g.updated_at
  from public.goals g
  left join map_account ma on ma.old_id = g.linked_account_id
  where g.household_id = p_source_household_id;
  get diagnostics v_n_goals = row_count;

  -- ── Exchange rates ───────────────────────────────────────────────────
  insert into public.exchange_rates (
    id, household_id, from_currency_code, to_currency_code, rate, rate_date,
    source, notes, created_by, updated_by, created_at, updated_at
  )
  select
    gen_random_uuid(), p_target_household_id, e.from_currency_code, e.to_currency_code, e.rate, e.rate_date,
    e.source, e.notes, p_actor_user_id, p_actor_user_id, e.created_at, e.updated_at
  from public.exchange_rates e
  where e.household_id = p_source_household_id
  on conflict (household_id, from_currency_code, to_currency_code, rate_date) do nothing;
  get diagnostics v_n_exchange_rates = row_count;

  drop table map_category, map_account, map_payee, map_transaction, map_budget;

  v_result := jsonb_build_object(
    'categories', v_n_categories,
    'accounts', v_n_accounts,
    'payees', v_n_payees,
    'transactions', v_n_transactions,
    'transaction_entries', v_n_entries,
    'transaction_allocations', v_n_allocations,
    'budgets', v_n_budgets,
    'budget_lines', v_n_budget_lines,
    'debts', v_n_debts,
    'recurring_transactions', v_n_recurring,
    'goals', v_n_goals,
    'exchange_rates', v_n_exchange_rates
  );

  return v_result;
end;
$$;


-- ------------------------------------------------------------
-- 14. run_recurring_autopost: skip rules whose private owner left (S19)
-- ------------------------------------------------------------
create or replace function public.run_recurring_autopost(
  p_run_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Max occurrences posted (or attempted) per template per run.
  c_max_per_template constant integer := 100;

  v_rec record;
  v_base_currency varchar(3);
  v_account_currency varchar(3);
  v_account_archived boolean;
  v_account_deleted timestamptz;
  v_to_currency varchar(3);
  v_to_archived boolean;
  v_to_deleted timestamptz;
  v_category_reporting text;
  v_category_archived boolean;
  v_category_deleted timestamptz;
  v_rate numeric(18,8);
  v_signed numeric(18,4);
  v_alloc_type text;
  v_txn_id uuid;
  v_next date;
  v_cur date;          -- occurrence being processed (the in-memory cursor)
  v_iter integer;
  v_failed boolean;
  v_posted integer := 0;
  v_error text;
begin
  for v_rec in
    select r.*
    from public.recurring_transactions r
    where r.auto_post = true
      and r.is_active = true
      and r.next_run_date is not null
      and r.next_run_date <= p_run_date
      -- S19 / PRV-9: a rule on a private account posts only while its owner
      -- is an active member. It is skipped untouched (no error written), so
      -- it resumes if they rejoin. What it posts derives its privacy through
      -- the triggers like any other write.
      and (
        r.private_owner_id is null
        or exists (
          select 1
          from public.household_members m
          where m.household_id = r.household_id
            and m.user_id = r.private_owner_id
            and m.status = 'active'
        )
      )
    order by r.next_run_date asc, r.id asc
    for update of r skip locked
  loop
    v_cur := v_rec.next_run_date;
    v_iter := 0;
    v_failed := false;

    while v_cur <= p_run_date and v_iter < c_max_per_template loop
      v_iter := v_iter + 1;

      -- Never post an occurrence dated after end_date; retire the template.
      if v_rec.end_date is not null and v_cur > v_rec.end_date then
        update public.recurring_transactions
        set is_active = false,
            updated_at = now()
        where id = v_rec.id;
        exit;
      end if;

      -- Per-occurrence block: a failure undoes ONLY this occurrence.
      begin
        if v_rec.transaction_type not in ('income', 'expense', 'transfer') then
          raise exception 'Only income, expense and transfer templates can auto-post.';
        end if;

        if v_rec.account_id is null then
          raise exception 'Template is missing an account.';
        end if;

        if v_rec.amount is null or v_rec.amount <= 0 then
          raise exception 'Template amount must be greater than 0.';
        end if;

        select h.base_currency into v_base_currency
        from public.households h where h.id = v_rec.household_id;

        select a.currency_code, a.is_archived, a.deleted_at
        into v_account_currency, v_account_archived, v_account_deleted
        from public.accounts a
        where a.id = v_rec.account_id and a.household_id = v_rec.household_id;

        if v_account_currency is null then
          raise exception 'Account not found for this household.';
        end if;
        if v_account_archived or v_account_deleted is not null then
          raise exception 'Account is archived or deleted.';
        end if;

        -- FX: last known rate for the account currency (1 for base currency).
        -- Shared by both branches; a transfer values both of its legs at the
        -- source rate, which is what keeps a same-currency move base-neutral.
        if v_account_currency = v_base_currency then
          v_rate := 1;
        else
          select te.exchange_rate_to_base
          into v_rate
          from public.transaction_entries te
          where te.household_id = v_rec.household_id
            and te.currency_code = v_account_currency
            and te.exchange_rate_to_base > 0
          order by te.created_at desc
          limit 1;

          if v_rate is null then
            raise exception 'No known exchange rate for % to %; post one manually first.',
              v_account_currency, v_base_currency;
          end if;
        end if;

        if v_rec.transaction_type = 'transfer' then
          -- ── UC-9: transfer ──────────────────────────────────────────────
          if v_rec.to_account_id is null then
            raise exception 'Transfer template is missing its destination account.';
          end if;

          select a.currency_code, a.is_archived, a.deleted_at
          into v_to_currency, v_to_archived, v_to_deleted
          from public.accounts a
          where a.id = v_rec.to_account_id and a.household_id = v_rec.household_id;

          if v_to_currency is null then
            raise exception 'Destination account not found for this household.';
          end if;
          if v_to_archived or v_to_deleted is not null then
            raise exception 'Destination account is archived or deleted.';
          end if;

          -- Flag and skip: the amount received is a real value only the user
          -- knows, so an unattended job must not invent it. The cursor stays
          -- on this occurrence and the template can be posted by hand.
          if v_to_currency <> v_account_currency then
            raise exception
              'Cross-currency transfers cannot post automatically — the amount received in % must be entered. Post this one manually.',
              v_to_currency;
          end if;

          insert into public.transactions (
            household_id, transaction_type, transaction_date,
            description, notes, status, source, created_by
          )
          values (
            v_rec.household_id, 'transfer', v_cur,
            v_rec.name, 'Auto-posted from a recurring template',
            'posted', 'system', v_rec.created_by
          )
          returning id into v_txn_id;

          -- Two balancing entries at the same rate: net zero in base currency.
          insert into public.transaction_entries (
            household_id, transaction_id, account_id,
            amount_account_currency, currency_code,
            exchange_rate_to_base, amount_base_currency, entry_type, notes
          )
          values
            (v_rec.household_id, v_txn_id, v_rec.account_id,
             -v_rec.amount, v_account_currency,
             v_rate, (-v_rec.amount * v_rate)::numeric(18,4), 'movement', 'Transfer out'),
            (v_rec.household_id, v_txn_id, v_rec.to_account_id,
             v_rec.amount, v_to_currency,
             v_rate, (v_rec.amount * v_rate)::numeric(18,4), 'movement', 'Transfer in');

          -- No allocation: a transfer is not income or expense.

        else
          -- ── income / expense ────────────────────────────────────────────
          if v_rec.category_id is null then
            raise exception 'Template is missing a category.';
          end if;

          select c.reporting_type, c.is_archived, c.deleted_at
          into v_category_reporting, v_category_archived, v_category_deleted
          from public.categories c
          where c.id = v_rec.category_id and c.household_id = v_rec.household_id;

          if v_category_reporting is null then
            raise exception 'Category not found for this household.';
          end if;
          if v_category_archived or v_category_deleted is not null then
            raise exception 'Category is archived or deleted.';
          end if;
          if v_rec.transaction_type = 'income' and v_category_reporting <> 'income' then
            raise exception 'Income template requires an income category.';
          end if;
          if v_rec.transaction_type = 'expense' and v_category_reporting not in ('expense', 'debt_interest') then
            raise exception 'Expense template requires an expense category.';
          end if;

          if v_rec.transaction_type = 'income' then
            v_signed := v_rec.amount;
            v_alloc_type := 'income';
          else
            v_signed := -v_rec.amount;
            v_alloc_type := 'expense';
          end if;

          insert into public.transactions (
            household_id, transaction_type, transaction_date,
            description, payee_id, notes, status, source, created_by
          )
          values (
            v_rec.household_id, v_rec.transaction_type, v_cur,
            v_rec.name, v_rec.payee_id, 'Auto-posted from a recurring template',
            'posted', 'system', v_rec.created_by
          )
          returning id into v_txn_id;

          insert into public.transaction_entries (
            household_id, transaction_id, account_id,
            amount_account_currency, currency_code,
            exchange_rate_to_base, amount_base_currency, entry_type
          )
          values (
            v_rec.household_id, v_txn_id, v_rec.account_id,
            v_signed, v_account_currency,
            v_rate, (v_signed * v_rate)::numeric(18,4), 'movement'
          );

          insert into public.transaction_allocations (
            household_id, transaction_id, category_id, allocation_type,
            amount_original_currency, currency_code, exchange_rate_to_base, amount_base_currency
          )
          values (
            v_rec.household_id, v_txn_id, v_rec.category_id, v_alloc_type,
            v_rec.amount, v_account_currency, v_rate, (v_rec.amount * v_rate)::numeric(18,4)
          );
        end if;

        -- Advance one step; deactivate once past end_date.
        v_next := public.advance_recurring_next_run(v_cur, v_rec.frequency);
        if v_next <= v_cur then
          -- Cannot happen with the current frequency set; guards a runaway loop.
          raise exception 'Recurrence did not advance (% -> %).', v_cur, v_next;
        end if;

        update public.recurring_transactions
        set next_run_date = v_next,
            is_active = case
              when v_rec.end_date is not null and v_next > v_rec.end_date then false
              else is_active
            end,
            last_auto_post_at = now(),
            last_error = null,
            last_error_at = null,
            consecutive_failures = 0,
            updated_at = now()
        where id = v_rec.id;

        insert into public.recurring_autopost_log (
          household_id, recurring_id, run_date, status, transaction_id
        )
        values (v_rec.household_id, v_rec.id, p_run_date, 'posted', v_txn_id);

        -- LAST statements of the success path: plpgsql variables are not
        -- rolled back with the savepoint, so only move them once nothing in
        -- this occurrence can fail any more.
        v_posted := v_posted + 1;
        v_cur := v_next;

      exception when others then
        -- Everything this occurrence wrote (transaction, entries, allocation,
        -- cursor advance, log row) has been rolled back. Earlier occurrences
        -- of this run are untouched.
        v_error := SQLERRM;
        v_failed := true;
        begin
          update public.recurring_transactions
          set last_error = v_error,
              last_error_at = now(),
              consecutive_failures = consecutive_failures + 1,
              updated_at = now()
          where id = v_rec.id;

          insert into public.recurring_autopost_log (
            household_id, recurring_id, run_date, status, error
          )
          values (v_rec.household_id, v_rec.id, p_run_date, 'failed', v_error);
        exception when others then
          -- Bookkeeping must never abort the batch.
          raise warning 'run_recurring_autopost: could not record failure for template %: %',
            v_rec.id, SQLERRM;
        end;
      end;

      -- A failure stops this template (cursor stays on the failing
      -- occurrence); the batch moves on to the next template.
      exit when v_failed;

      -- Past end_date: the template was deactivated by the update above.
      exit when v_rec.end_date is not null and v_cur > v_rec.end_date;
    end loop;

    if not v_failed and v_cur <= p_run_date
       and (v_rec.end_date is null or v_cur <= v_rec.end_date) then
      raise notice 'run_recurring_autopost: template % hit the % occurrence cap; resuming from % next run.',
        v_rec.id, c_max_per_template, v_cur;
    end if;
  end loop;

  return v_posted;
end;
$$;


-- ------------------------------------------------------------
-- 15. The stale create_transfer_transaction overload
-- ------------------------------------------------------------
drop function if exists public.create_transfer_transaction(
  uuid, uuid, uuid, numeric, date, text, text, text
);
