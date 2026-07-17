-- ============================================================
-- App Finanzas — br_017_balance_adjustment.sql
-- BR-017: adjust/reconcile an account's current balance without editing
-- historical transactions.
-- ------------------------------------------------------------
-- Adds `create_balance_adjustment(...)`, which posts a single ledger-safe
-- adjustment transaction that moves an account's POSTED balance to a target
-- value. It computes the delta between the account's current posted balance
-- and the requested target, then writes one `adjustment` entry for that delta.
--
-- Ledger contract preserved:
--   * transaction_type = 'adjustment', entry_type = 'adjustment' (both already
--     allowed by the ledger check constraints).
--   * NO transaction_allocations row — an adjustment is a balance correction,
--     not income/expense, so it never touches reports/budgets (same policy as
--     opening balances).
--   * It DOES move net worth, because net worth derives from entry balances —
--     that is the intended effect of a correction.
--
-- Sign convention matches create_opening_balance / the accounts UI:
--   * asset accounts     → target stored as entered (may be negative).
--   * liability accounts → user passes the amount OWED as a positive number;
--     it is stored as a negative balance (-abs(target)).
--
-- Additive. Depends on: public.accounts, public.transactions,
-- public.transaction_entries, public.is_household_editor(uuid).
-- ============================================================

create or replace function public.create_balance_adjustment(
  p_household_id uuid,
  p_account_id uuid,
  p_new_balance numeric,
  p_adjustment_date date,
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
  v_current_balance numeric(18,4);
  v_target_balance numeric(18,4);
  v_delta numeric(18,4);
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if not public.is_household_editor(p_household_id) then
    raise exception 'Not authorized to adjust balances for this household';
  end if;

  if p_account_id is null then
    raise exception 'account_id is required';
  end if;

  if p_new_balance is null then
    raise exception 'new_balance is required';
  end if;

  if p_adjustment_date is null then
    raise exception 'adjustment_date is required';
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

  -- Current posted balance = the balance shown on the accounts page
  -- (get_account_balances.posted_balance_account_currency): posted, non-deleted
  -- entries only. Pending transactions are intentionally left out of the base.
  select coalesce(sum(te.amount_account_currency), 0)::numeric(18,4)
  into v_current_balance
  from public.transaction_entries te
  join public.transactions t
    on t.id = te.transaction_id
    and t.household_id = te.household_id
  where te.household_id = p_household_id
    and te.account_id = p_account_id
    and t.deleted_at is null
    and t.status = 'posted';

  if v_account_class = 'asset' then
    v_target_balance := p_new_balance::numeric(18,4);
  elsif v_account_class = 'liability' then
    v_target_balance := -abs(p_new_balance)::numeric(18,4);
  else
    raise exception 'account_class must be asset or liability';
  end if;

  v_delta := (v_target_balance - v_current_balance)::numeric(18,4);

  if v_delta = 0 then
    raise exception 'Account balance is already at that amount; no adjustment needed.';
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
    'adjustment',
    p_adjustment_date,
    'Balance adjustment',
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
    entry_type,
    notes
  )
  values (
    p_household_id,
    v_transaction_id,
    p_account_id,
    v_delta,
    v_account_currency,
    p_exchange_rate_to_base,
    (v_delta * p_exchange_rate_to_base)::numeric(18,4),
    'adjustment',
    'Reconcile to ' || to_char(v_target_balance, 'FM999999999990.00') || ' ' || v_account_currency
  );

  return v_transaction_id;
end;
$$;

grant execute on function public.create_balance_adjustment(
  uuid,
  uuid,
  numeric,
  date,
  numeric,
  text
) to authenticated;
