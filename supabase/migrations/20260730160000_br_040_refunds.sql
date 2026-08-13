-- ============================================================
-- App Finanzas — BR-040: refunds as a negative amount in the same category
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- A partial refund had no clean representation. Booking it as income inflates
-- both sides of the ledger and distorts the category totals, which is the exact
-- complaint in the BR-040 row.
--
-- The row demands a written modelling decision before any code. It is in
-- `docs/features/refunds-negative-amounts.md`; the short version:
--
-- FINDING: `transaction_allocations` did NOT tolerate negative amounts — two
-- CHECK constraints required `> 0`. Everything else was already fine: every
-- reporting query sums `amount_base_currency` (so a negative row nets with no
-- arithmetic change), and the invariant in
-- `supabase/tests/br_003_006_money_invariants.sql` asserts
-- `allocation_actuals <= entry_movements`, which a negative row only makes more
-- true.
--
-- DECISION: allow negative allocations, but **narrow** the constraints instead of
-- dropping them. Negatives are permitted only where `allocation_type = 'expense'`;
-- zero stays forbidden everywhere; a negative income / financial / adjustment
-- allocation still raises exactly as before.
--
-- That is what makes this cheap and safe at the same time. Because the refund is
-- an ordinary `expense` allocation, **every** reporting surface nets it with no
-- change at all: get_monthly_dashboard_summary, get_monthly_expenses_by_category,
-- get_monthly_budget_details, BR-043's get_budget_previous_actuals and
-- get_budget_payment_split, month closures, trends, and the TS report queries.
-- Not one line of shared financial SQL is touched below.
--
-- The alternative (a separate `expense_refund` allocation_type, sign applied per
-- query) would have meant rewriting five shared money functions so that a P3
-- ticket could be seen at all — the same cost BR-039 declined to pay.
-- ============================================================

-- ── 1. Narrowed positivity constraints ──────────────────────────────────────
alter table public.transaction_allocations
  drop constraint if exists transaction_allocations_amount_original_positive_chk;

alter table public.transaction_allocations
  add constraint transaction_allocations_amount_original_signed_chk
  check (
    case
      when allocation_type = 'expense' then amount_original_currency <> 0
      else amount_original_currency > 0
    end
  );

alter table public.transaction_allocations
  drop constraint if exists transaction_allocations_amount_base_positive_chk;

alter table public.transaction_allocations
  add constraint transaction_allocations_amount_base_signed_chk
  check (
    case
      when allocation_type = 'expense' then amount_base_currency <> 0
      else amount_base_currency > 0
    end
  );

-- ── 2. `refund` as a transaction type ───────────────────────────────────────
-- A refund is not an expense (money comes back) and not income (the household
-- did not earn it), so it gets its own label rather than being disguised as one.
alter table public.transactions
  drop constraint if exists transactions_type_chk;

alter table public.transactions
  add constraint transactions_type_chk
  check (transaction_type in (
    'income',
    'expense',
    'transfer',
    'debt_payment',
    'adjustment',
    'opening_balance',
    'investment',
    'refund'
  ));

-- Optional link to the expense being refunded. `on delete set null`: a refund is
-- real ledger history and must survive even if the original is ever removed.
alter table public.transactions
  add column if not exists refunded_transaction_id uuid
    references public.transactions(id) on delete set null;

comment on column public.transactions.refunded_transaction_id is
  'BR-040: the expense this refund is against. NULL for a standalone refund. '
  'Drives the prefill on the "Record refund" action.';

create index if not exists idx_transactions_refunded_transaction
  on public.transactions(refunded_transaction_id)
  where refunded_transaction_id is not null;

-- ── 3. create_refund_transaction ────────────────────────────────────────────
-- Entry POSITIVE: money returns to the account, so the balance rises. This is
-- also why a refund can never produce a negative-balance artefact.
-- Allocation NEGATIVE, `expense`, in the original's category: the category nets
-- to the true cost, which is the entire point of the ticket.

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
    v_payee_id := public.get_or_create_payee(p_household_id, trim(p_payee_name));
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

grant execute on function public.create_refund_transaction(
  uuid, uuid, uuid, numeric, date, text, uuid, text, text, numeric
) to authenticated;
