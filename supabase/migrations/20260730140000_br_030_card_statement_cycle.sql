-- ============================================================
-- App Finanzas — BR-030: credit-card statement cycle (slice 1)
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- A credit card had exactly one number: its running balance. That cannot answer
-- the question a card-holding household actually asks — "what do I owe on the
-- next payment date?" — because the running balance mixes the closed statement
-- (due soon) with this cycle's spend (not billed yet).
--
-- Slice 1 is the schema plus a derived summary. The `Pay` action that posts the
-- settlement transfer is slice 2 and is deliberately NOT bundled here (the
-- BR-030 row says so explicitly); `billing_account_id` is stored now so that
-- slice has somewhere to read the source account from, and so the UI can say
-- which account the card is paid from.
--
-- Nothing here changes a balance, a total or the ledger. The summary is read-only
-- and derived at query time from `transaction_entries`.
-- ============================================================

alter table public.accounts
  add column if not exists statement_day smallint,
  add column if not exists payment_day smallint,
  add column if not exists billing_account_id uuid references public.accounts(id) on delete set null;

comment on column public.accounts.statement_day is
  'BR-030: day of month the card statement closes (1-31, clamped to the month''s '
  'last day). NULL = no cycle configured, and the account behaves exactly as before.';
comment on column public.accounts.payment_day is
  'BR-030: day of month the payment is due, in the month after the statement closes.';
comment on column public.accounts.billing_account_id is
  'BR-030: the account this card is normally paid from. Read by the slice-2 Pay '
  'action; slice 1 only displays it.';

-- Days are 1-31 and only meaningful on a credit card. A card with no cycle set
-- is explicitly allowed — the whole point is that existing cards keep working.
alter table public.accounts
  drop constraint if exists accounts_statement_day_chk;
alter table public.accounts
  add constraint accounts_statement_day_chk
  check (statement_day is null or statement_day between 1 and 31);

alter table public.accounts
  drop constraint if exists accounts_payment_day_chk;
alter table public.accounts
  add constraint accounts_payment_day_chk
  check (payment_day is null or payment_day between 1 and 31);

-- Both days or neither: a statement day with no payment day cannot produce a due
-- date, and a payment day with no statement day has no cycle to be due for.
alter table public.accounts
  drop constraint if exists accounts_cycle_pair_chk;
alter table public.accounts
  add constraint accounts_cycle_pair_chk
  check ((statement_day is null) = (payment_day is null));

-- The cycle only makes sense where a statement exists. Mirrors the
-- TRANSFER_AS_EXPENSE_TYPES pattern BR-039 uses for its own type restriction.
alter table public.accounts
  drop constraint if exists accounts_cycle_type_chk;
alter table public.accounts
  add constraint accounts_cycle_type_chk
  check (statement_day is null or account_type in ('credit_card', 'debt'));

-- A card cannot be paid from itself.
alter table public.accounts
  drop constraint if exists accounts_billing_account_not_self_chk;
alter table public.accounts
  add constraint accounts_billing_account_not_self_chk
  check (billing_account_id is null or billing_account_id <> id);

create index if not exists idx_accounts_billing_account
  on public.accounts(billing_account_id)
  where billing_account_id is not null;

-- ------------------------------------------------------------
-- Cycle date math
-- ------------------------------------------------------------
-- `p_day` is clamped to the target month's last day, so a statement day of 31
-- closes on Feb 28/29 rather than overflowing into March. This is the same
-- clamping rule advance_recurring_next_run relies on for monthly frequencies.

create or replace function public.card_cycle_day_in_month(
  p_month date,
  p_day smallint
)
returns date
language sql
immutable
set search_path = public
as $$
  select (
    date_trunc('month', p_month)
    + (least(
        p_day,
        extract(day from (date_trunc('month', p_month) + interval '1 month - 1 day'))::smallint
      ) - 1) * interval '1 day'
  )::date
$$;

comment on function public.card_cycle_day_in_month(date, smallint) is
  'BR-030: the given day of the month containing p_month, clamped to that '
  'month''s last day (day 31 in February → the 28th/29th).';

-- ------------------------------------------------------------
-- get_card_cycle_summaries
-- ------------------------------------------------------------
-- The BR-030 row names this `get_card_cycle_summary(account_id, as_of)`. It is
-- household-scoped and plural here on purpose: the accounts list renders every
-- card at once, and a per-account function would mean one round trip per card.
-- Same shape as get_account_balances, which is also household-scoped.
--
-- The four figures, all in the card's own currency and all positive-as-owed:
--
--   statement_balance  what the closed statement said you owe: the account's
--                      balance as of the close date, sign-flipped.
--   paid_since_close    payments and credits posted after the close — the reason
--                      a settled statement stops showing a balance due.
--   payable             statement_balance − paid_since_close, floored at 0. This
--                      is the "what do I owe on the next payment date" number,
--                      and it deliberately EXCLUDES this cycle's spend.
--   outstanding         new charges since the close: the open cycle, not billed
--                      yet. Shown beside payable, never added into it.
--
-- Sign convention comes straight from the ledger: a charge on a card is a
-- negative entry, a payment is positive, so a card that owes money has a
-- negative balance (see get_account_balances). Everything below flips that to
-- "positive means owed", which is how a statement reads.

create or replace function public.get_card_cycle_summaries(
  p_household_id uuid,
  p_as_of date default current_date
)
returns table (
  account_id uuid,
  account_name text,
  currency_code varchar(3),
  statement_day smallint,
  payment_day smallint,
  billing_account_id uuid,
  billing_account_name text,
  closed_period_start date,
  closed_period_end date,
  closed_payment_due date,
  open_period_start date,
  open_period_end date,
  open_payment_due date,
  statement_balance numeric(18,4),
  paid_since_close numeric(18,4),
  payable numeric(18,4),
  outstanding numeric(18,4),
  is_overdue boolean
)
language plpgsql
security invoker
stable
set search_path = public
as $$
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not authorized to read card cycles for this household';
  end if;

  return query
  with cards as (
    select
      a.id,
      a.name,
      a.currency_code,
      a.statement_day,
      a.payment_day,
      a.billing_account_id,
      b.name as billing_account_name
    from public.accounts a
    left join public.accounts b
      on b.id = a.billing_account_id
      and b.household_id = a.household_id
      and b.deleted_at is null
    where a.household_id = p_household_id
      and a.deleted_at is null
      and a.is_archived = false
      and a.statement_day is not null
      and a.payment_day is not null
  ),
  windows as (
    select
      c.*,
      -- The close date in p_as_of's own month. If that day has not arrived yet,
      -- the statement that closed most recently is the previous month's.
      case
        when public.card_cycle_day_in_month(p_as_of, c.statement_day) <= p_as_of
          then public.card_cycle_day_in_month(p_as_of, c.statement_day)
        else public.card_cycle_day_in_month(
          (date_trunc('month', p_as_of) - interval '1 month')::date, c.statement_day
        )
      end as closed_end
    from cards c
  ),
  periods as (
    select
      w.*,
      -- The closed statement began the day after the close before it.
      (public.card_cycle_day_in_month(
        (date_trunc('month', w.closed_end) - interval '1 month')::date, w.statement_day
      ) + interval '1 day')::date as closed_start,
      -- The open cycle runs from the day after the close to the next close.
      (w.closed_end + interval '1 day')::date as open_start,
      public.card_cycle_day_in_month(
        (date_trunc('month', w.closed_end) + interval '1 month')::date, w.statement_day
      ) as open_end,
      -- Payment falls on payment_day of the month AFTER the statement closes,
      -- which is how both benchmark cards read (close 06-30 → pay 07-01).
      public.card_cycle_day_in_month(
        (date_trunc('month', w.closed_end) + interval '1 month')::date, w.payment_day
      ) as closed_due,
      public.card_cycle_day_in_month(
        (date_trunc('month', w.closed_end) + interval '2 months')::date, w.payment_day
      ) as open_due
    from windows w
  ),
  figures as (
    select
      p.*,
      -- Balance at close, flipped so "owed" is positive. Pending rows are
      -- excluded: a statement bills what actually posted.
      coalesce(-(
        select sum(te.amount_account_currency)
        from public.transaction_entries te
        join public.transactions t
          on t.id = te.transaction_id
          and t.household_id = te.household_id
        where te.account_id = p.id
          and te.household_id = p_household_id
          and t.status = 'posted'
          and t.deleted_at is null
          and t.transaction_date <= p.closed_end
      ), 0)::numeric(18,4) as statement_balance_calc,
      -- Positive entries after the close: payments and refunds, both of which
      -- genuinely reduce what is due.
      coalesce((
        select sum(te.amount_account_currency)
        from public.transaction_entries te
        join public.transactions t
          on t.id = te.transaction_id
          and t.household_id = te.household_id
        where te.account_id = p.id
          and te.household_id = p_household_id
          and t.status = 'posted'
          and t.deleted_at is null
          and t.transaction_date > p.closed_end
          and t.transaction_date <= p_as_of
          and te.amount_account_currency > 0
      ), 0)::numeric(18,4) as paid_since_close_calc,
      -- Negative entries after the close: this cycle's new charges.
      coalesce(-(
        select sum(te.amount_account_currency)
        from public.transaction_entries te
        join public.transactions t
          on t.id = te.transaction_id
          and t.household_id = te.household_id
        where te.account_id = p.id
          and te.household_id = p_household_id
          and t.status = 'posted'
          and t.deleted_at is null
          and t.transaction_date > p.closed_end
          and t.transaction_date <= p_as_of
          and te.amount_account_currency < 0
      ), 0)::numeric(18,4) as outstanding_calc
    from periods p
  )
  select
    f.id,
    f.name,
    f.currency_code,
    f.statement_day,
    f.payment_day,
    f.billing_account_id,
    f.billing_account_name,
    f.closed_start,
    f.closed_end,
    f.closed_due,
    f.open_start,
    f.open_end,
    f.open_due,
    greatest(f.statement_balance_calc, 0)::numeric(18,4) as statement_balance,
    f.paid_since_close_calc as paid_since_close,
    greatest(
      greatest(f.statement_balance_calc, 0) - f.paid_since_close_calc, 0
    )::numeric(18,4) as payable,
    greatest(f.outstanding_calc, 0)::numeric(18,4) as outstanding,
    (
      greatest(greatest(f.statement_balance_calc, 0) - f.paid_since_close_calc, 0) > 0
      and f.closed_due < p_as_of
    ) as is_overdue
  from figures f
  order by f.name asc;
end;
$$;

grant execute on function public.get_card_cycle_summaries(uuid, date) to authenticated;
grant execute on function public.card_cycle_day_in_month(date, smallint) to authenticated;
