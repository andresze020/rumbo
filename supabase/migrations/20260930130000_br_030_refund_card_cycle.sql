-- ============================================================
-- Rumbo — BR-030: a refund after the close offsets the open cycle first
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- Before: get_card_cycle_summaries counted every positive entry after the
-- close as `paid_since_close`, refunds included. A refund of a charge made
-- AFTER the close therefore shrank `payable` (the closed statement) while
-- `outstanding` stayed gross. Reproduced 2026-09-30: close on the 15th, 50
-- charged before and 80 after, then 30 refunded on the 80 — `payable` 20 /
-- `outstanding` 80 instead of 50 / 50 (docs/alpha/tier-3-4-authenticated-qa.md).
--
-- Whether an issuer applies a post-close credit to the statement it already
-- billed varies by issuer. `payable` is the "pay this by the due date" number,
-- so understating it risks interest while overstating it only moves a payment
-- a few weeks earlier. The rule is the conservative one:
--
--   payments (any positive entry that is not a refund) reduce the statement,
--     exactly as before;
--   refunds (transaction_type = 'refund') offset this cycle's charges first;
--     only a refund larger than everything charged since the close carries
--     the excess onto the statement.
--
-- `payable + outstanding` still equals what the card owes whenever neither
-- figure is floored, and a refund of a statement-period charge with no new
-- spend still lowers `payable` in full. Returned columns, signature, security
-- (SECURITY INVOKER + is_household_member) and the grant are unchanged;
-- `paid_since_close` now means payments plus the refund excess that reached
-- the statement.
--
-- Pure function replacement, same signature, no schema change. Rollback:
-- re-run the get_card_cycle_summaries definition from
-- 20260730140000_br_030_card_statement_cycle.sql.
-- ============================================================

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
      (public.card_cycle_day_in_month(
        (date_trunc('month', w.closed_end) - interval '1 month')::date, w.statement_day
      ) + interval '1 day')::date as closed_start,
      (w.closed_end + interval '1 day')::date as open_start,
      public.card_cycle_day_in_month(
        (date_trunc('month', w.closed_end) + interval '1 month')::date, w.statement_day
      ) as open_end,
      public.card_cycle_day_in_month(
        (date_trunc('month', w.closed_end) + interval '1 month')::date, w.payment_day
      ) as closed_due,
      public.card_cycle_day_in_month(
        (date_trunc('month', w.closed_end) + interval '2 months')::date, w.payment_day
      ) as open_due
    from windows w
  ),
  raw as (
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
      -- After the close, split three ways: payments, refunds, new charges.
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
          and t.transaction_type <> 'refund'
      ), 0)::numeric(18,4) as payments_calc,
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
          and t.transaction_type = 'refund'
      ), 0)::numeric(18,4) as refunds_calc,
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
      ), 0)::numeric(18,4) as charges_calc
    from periods p
  ),
  figures as (
    select
      r.*,
      -- A refund offsets this cycle's charges first; only the excess reaches
      -- the closed statement.
      (r.payments_calc + greatest(r.refunds_calc - r.charges_calc, 0))::numeric(18,4)
        as paid_since_close_calc,
      greatest(r.charges_calc - r.refunds_calc, 0)::numeric(18,4) as outstanding_calc
    from raw r
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
    f.outstanding_calc as outstanding,
    (
      greatest(greatest(f.statement_balance_calc, 0) - f.paid_since_close_calc, 0) > 0
      and f.closed_due < p_as_of
    ) as is_overdue
  from figures f
  order by f.name asc;
end;
$$;

grant execute on function public.get_card_cycle_summaries(uuid, date) to authenticated;
