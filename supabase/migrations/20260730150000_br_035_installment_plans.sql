-- ============================================================
-- App Finanzas — BR-035: installment purchases (*meses sin intereses*)
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- A 12-month plan had to be faked as a recurring template, which has no
-- end-total and no "n of N" position. The BR-035 row is explicit that this is
-- NOT a reuse of `recurring_transactions`, and it is right: the two differ in
-- kind. A recurring template is open-ended and its amount is a guess that may
-- change; an installment plan has a fixed total and a fixed count, both known at
-- creation, and its whole purpose is to divide one into the other.
--
-- ── THE MODEL ───────────────────────────────────────────────────────────────
-- `installment_plans` is **metadata, not a transaction**. It holds no ledger
-- rows and no allocation. All of the money lives in the N generated child
-- transactions, each one an ordinary expense of total/N.
--
-- This is what satisfies the row's "reports do not double-count the parent and
-- its children" check *by construction* rather than by a filter someone has to
-- remember: there is no parent transaction to double-count. Nothing needed to
-- change in any report, budget or monthly RPC — an installment is just an
-- expense that happens to know which plan it came from.
--
-- Consequences worth stating:
--   * A report for this month shows this month's installment, which is what the
--     household actually pays this month.
--   * Future-dated installments are posted, so they surface in future months'
--     reports as already-committed spend, and the card's all-time balance shows
--     the full amount owed — both correct for a card plan.
--   * BR-030 puts them where they belong with no extra work: a future-dated
--     installment falls after the statement close, so it lands in `outstanding`
--     and never in `payable`.
--
-- ── ROUNDING ────────────────────────────────────────────────────────────────
-- total/N rarely divides evenly. Every installment gets the same amount rounded
-- to cents, and the **last** one absorbs the remainder, so the N amounts sum to
-- the original total exactly (the row's first verification).
-- ============================================================

create table if not exists public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,

  -- The card (or any account) the installments are charged to. Deliberately NOT
  -- `on delete cascade` and never cleared: the plan must survive an account
  -- archive, per the row's third verification. Archiving sets a flag; it does
  -- not delete the row, so the reference stays valid.
  account_id uuid not null references public.accounts(id),
  category_id uuid not null references public.categories(id),
  payee_id uuid references public.payees(id),

  description text not null,
  total_amount numeric(18,4) not null,
  currency_code varchar(3) not null references public.currencies(code),
  installment_count integer not null,
  start_date date not null,

  status text not null default 'active',

  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint installment_plans_description_not_blank_chk
    check (length(trim(description)) > 0),

  constraint installment_plans_total_positive_chk
    check (total_amount > 0),

  -- One "installment" is not a plan, and a 120-month plan is a data-entry
  -- accident rather than a purchase.
  constraint installment_plans_count_chk
    check (installment_count between 2 and 60),

  constraint installment_plans_status_chk
    check (status in ('active', 'completed', 'cancelled'))
);

drop trigger if exists trg_installment_plans_updated_at on public.installment_plans;
create trigger trg_installment_plans_updated_at
before update on public.installment_plans
for each row execute function public.set_updated_at();

create index if not exists idx_installment_plans_household
  on public.installment_plans(household_id, status);
create index if not exists idx_installment_plans_account
  on public.installment_plans(account_id);

-- ── The child link on the transaction ───────────────────────────────────────
-- `on delete set null`: a plan should never be hard-deleted (it is cancelled),
-- but if one ever is, the installments are real ledger history and must survive
-- as ordinary expenses.
alter table public.transactions
  add column if not exists installment_plan_id uuid
    references public.installment_plans(id) on delete set null,
  add column if not exists installment_number integer;

comment on column public.transactions.installment_plan_id is
  'BR-035: the plan this transaction is one installment of. NULL for every '
  'ordinary transaction.';
comment on column public.transactions.installment_number is
  'BR-035: 1-based position within the plan, for the "n of N" badge.';

alter table public.transactions
  drop constraint if exists transactions_installment_number_chk;
alter table public.transactions
  add constraint transactions_installment_number_chk
  check (
    (installment_plan_id is null and installment_number is null)
    or (installment_plan_id is not null and installment_number >= 1)
  );

create index if not exists idx_transactions_installment_plan
  on public.transactions(installment_plan_id, installment_number)
  where installment_plan_id is not null;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Members read, editors write — matching `transactions` and `budgets`. No DELETE
-- policy: a plan is cancelled, never deleted (archive-over-delete, as with
-- goals, tags, payees and notes).
alter table public.installment_plans enable row level security;

drop policy if exists "installment_plans_select_member" on public.installment_plans;
create policy "installment_plans_select_member"
on public.installment_plans
for select
to authenticated
using (public.is_household_member(household_id));

drop policy if exists "installment_plans_insert_editor" on public.installment_plans;
create policy "installment_plans_insert_editor"
on public.installment_plans
for insert
to authenticated
with check (
  public.is_household_editor(household_id)
  and created_by = auth.uid()
);

drop policy if exists "installment_plans_update_editor" on public.installment_plans;
create policy "installment_plans_update_editor"
on public.installment_plans
for update
to authenticated
using (public.is_household_editor(household_id))
with check (public.is_household_editor(household_id));

-- ------------------------------------------------------------
-- create_installment_plan
-- ------------------------------------------------------------
-- Writes the plan and all N installments in one statement, so a partial plan —
-- some installments posted, some missing — cannot exist. Mirrors
-- create_manual_transaction's ledger writes (transaction + entry + allocation)
-- and its validation, because each installment IS an ordinary expense.
--
-- Installment k is dated `start_date + (k-1) months`, with the day clamped to
-- the target month's last day, so a plan starting Jan 31 bills Feb 28 rather
-- than skipping to Mar 3.

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
    v_payee_id := public.get_or_create_payee(p_household_id, trim(p_payee_name));
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

grant execute on function public.create_installment_plan(
  uuid, uuid, uuid, numeric, integer, date, text, text, text, numeric
) to authenticated;

-- ------------------------------------------------------------
-- cancel_installment_plan
-- ------------------------------------------------------------
-- Early payoff or a mistaken plan. Voids only the installments that have not
-- come due yet (`transaction_date > p_as_of`) — the ones already billed are real
-- history and stay. Uses the same void columns as void_transaction, so an
-- installment voided here behaves like any other voided row and can be undone
-- individually with unvoid_transaction (BR-015).
--
-- The plan is marked `cancelled`, never deleted: archive-over-delete.

create or replace function public.cancel_installment_plan(
  p_plan_id uuid,
  p_as_of date default current_date
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_household_id uuid;
  v_voided integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select ip.household_id into v_household_id
  from public.installment_plans ip
  where ip.id = p_plan_id;

  if v_household_id is null then
    raise exception 'Installment plan not found';
  end if;

  if not public.is_household_editor(v_household_id) then
    raise exception 'Not authorized to cancel installment plans for this household';
  end if;

  with cancelled as (
    update public.transactions t
    set status = 'voided',
        voided_at = now(),
        voided_by = auth.uid(),
        void_reason = 'Installment plan cancelled',
        updated_by = auth.uid()
    where t.installment_plan_id = p_plan_id
      and t.household_id = v_household_id
      and t.transaction_date > p_as_of
      and t.status <> 'voided'
      and t.deleted_at is null
    returning 1
  )
  select count(*)::integer into v_voided from cancelled;

  update public.installment_plans
  set status = 'cancelled'
  where id = p_plan_id;

  return v_voided;
end;
$$;

grant execute on function public.cancel_installment_plan(uuid, date) to authenticated;
