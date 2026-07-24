-- ============================================================
-- App Finanzas — Cross-currency transfer cost (unified FX spread + fee)
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- Extends BR-007 so a cross-currency transfer can record its real cost
-- (exchange spread + any fee) as a single expense. The user enters what left
-- (sent) and what arrived (received); the app suggests the cost in the base
-- currency and the user can override it + pick a category.
--
-- Ledger model — the cost is an ALLOCATION, not an extra entry, so the transfer
-- keeps its two movement entries (list/edit untouched):
--   * The two entries are valued so the transfer's net base = -(cost). The
--     base-currency leg is anchored at rate 1; the other leg's rate is derived
--     from the cost. Net worth therefore drops by the real cost.
--   * A single expense allocation (cost, in base currency, to a chosen expense
--     category) classifies that cost so it shows in reports/budgets.
-- Same-currency transfers stay neutral (cost = 0), preserving the BF-020 fix.
--
-- Net worth (sum of entries) and reports (sum of allocations) view the same
-- loss through different lenses — no double counting.
--
-- Adds p_cost_base + p_cost_category_id; the previous 10-arg signatures are
-- dropped first to avoid an ambiguous overload.
-- ============================================================

drop function if exists public.create_transfer_transaction(
  uuid, uuid, uuid, numeric, date, text, text, text, numeric, numeric
);

drop function if exists public.update_transfer_transaction(
  uuid, uuid, uuid, numeric, date, text, text, text, numeric, numeric
);

-- Shared helper: validate that a category is an active expense category for the
-- household (used for the transfer-cost allocation).
create or replace function public.assert_expense_category(
  p_household_id uuid,
  p_category_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reporting text;
  v_archived boolean;
  v_deleted timestamptz;
begin
  select c.reporting_type, c.is_archived, c.deleted_at
  into v_reporting, v_archived, v_deleted
  from public.categories c
  where c.id = p_category_id and c.household_id = p_household_id;

  if v_reporting is null then
    raise exception 'The transfer-cost category was not found for this household.';
  end if;
  if v_archived or v_deleted is not null then
    raise exception 'The transfer-cost category is archived or deleted.';
  end if;
  if v_reporting not in ('expense', 'debt_interest') then
    raise exception 'The transfer cost must be filed under an expense category.';
  end if;
end;
$$;

create or replace function public.create_transfer_transaction(
  p_household_id uuid,
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
  v_transaction_id uuid;
  v_base_currency varchar(3);
  v_from_currency varchar(3);
  v_to_currency varchar(3);
  v_from_archived boolean;
  v_to_archived boolean;
  v_from_deleted_at timestamptz;
  v_to_deleted_at timestamptz;
  v_from_amount numeric(18,4);
  v_to_amount numeric(18,4);
  v_from_rate numeric(18,8);
  v_to_rate numeric(18,8);
  v_from_base numeric(18,4);
  v_to_base numeric(18,4);
  v_cost numeric(18,4);
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

  select h.base_currency into v_base_currency from public.households h where h.id = p_household_id;

  select a.currency_code, a.is_archived, a.deleted_at
  into v_from_currency, v_from_archived, v_from_deleted_at
  from public.accounts a where a.id = p_from_account_id and a.household_id = p_household_id;
  if v_from_currency is null then raise exception 'from account not found for household'; end if;
  if v_from_archived or v_from_deleted_at is not null then raise exception 'from account is not active'; end if;

  select a.currency_code, a.is_archived, a.deleted_at
  into v_to_currency, v_to_archived, v_to_deleted_at
  from public.accounts a where a.id = p_to_account_id and a.household_id = p_household_id;
  if v_to_currency is null then raise exception 'to account not found for household'; end if;
  if v_to_archived or v_to_deleted_at is not null then raise exception 'to account is not active'; end if;

  v_from_amount := abs(p_amount)::numeric(18,4);

  if v_from_currency = v_to_currency then
    -- Same currency: pure transfer, no FX cost.
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

    -- Anchor the base-currency leg at rate 1; derive the other leg so the
    -- transfer's net base equals -(cost).
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
      perform public.assert_expense_category(p_household_id, p_cost_category_id);
    end if;
  end if;

  insert into public.transactions (
    household_id, transaction_type, transaction_date,
    description, notes, status, source, created_by
  )
  values (
    p_household_id, 'transfer', p_transaction_date,
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    p_status, 'manual', auth.uid()
  )
  returning id into v_transaction_id;

  insert into public.transaction_entries (
    household_id, transaction_id, account_id,
    amount_account_currency, currency_code,
    exchange_rate_to_base, amount_base_currency, entry_type, notes
  )
  values
    (p_household_id, v_transaction_id, p_from_account_id,
     -v_from_amount, v_from_currency, v_from_rate, v_from_base, 'movement', 'Transfer out'),
    (p_household_id, v_transaction_id, p_to_account_id,
     v_to_amount, v_to_currency, v_to_rate, v_to_base, 'movement', 'Transfer in');

  -- Cost = one expense allocation in base currency (classification for reports).
  if v_cost > 0 and p_cost_category_id is not null then
    insert into public.transaction_allocations (
      household_id, transaction_id, category_id, allocation_type,
      amount_original_currency, currency_code, exchange_rate_to_base, amount_base_currency
    )
    values (
      p_household_id, v_transaction_id, p_cost_category_id, 'expense',
      v_cost, v_base_currency, 1, v_cost
    );
  end if;

  return v_transaction_id;
end;
$$;

grant execute on function public.create_transfer_transaction(
  uuid, uuid, uuid, numeric, date, text, text, text, numeric, numeric, numeric, uuid
) to authenticated;


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

grant execute on function public.update_transfer_transaction(
  uuid, uuid, uuid, numeric, date, text, text, text, numeric, numeric, numeric, uuid
) to authenticated;
