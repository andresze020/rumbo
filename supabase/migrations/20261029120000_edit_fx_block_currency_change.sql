-- ============================================================
-- Rumbo — EDIT-FX: update_manual_transaction refuses a currency change
-- ------------------------------------------------------------
-- Moving a transaction to an account in a DIFFERENT currency kept the entry's
-- and allocation's stored exchange_rate_to_base, so the base amount was wrong
-- (50,000 COP stored as 50,000 CAD). The rate belongs to the old currency;
-- there is no honest rate to carry over, so the edit is rejected and the user
-- voids and re-records the transaction instead.
--
-- Only change vs 20261009150000_hh_001_private_write_guards.sql: the
-- v_entry_currency variable, currency_code added to the entry select, and the
-- currency guard right after it. Same signature (CREATE OR REPLACE keeps
-- existing grants), SECURITY INVOKER, search_path = public.
--
-- Rollback: re-run section 3 of 20261009150000_hh_001_private_write_guards.sql.
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
  v_entry_currency varchar(3);
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

  select te.id, te.exchange_rate_to_base, te.currency_code
  into v_entry_id, v_entry_exchange_rate, v_entry_currency
  from public.transaction_entries te
  where te.transaction_id = p_transaction_id
    and te.household_id = v_transaction.household_id;

  if v_account_currency is distinct from v_entry_currency then
    raise exception 'This account uses a different currency. To move the transaction there, void it and record it again.';
  end if;

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

grant execute on function public.update_manual_transaction(
  uuid, uuid, uuid, numeric, date, text, text, text, text, text
) to authenticated;
