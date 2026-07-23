-- ============================================================
-- App Finanzas — Recurring Sprint B / BR-014: auto-post scheduler + failure log
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- Adds the unattended posting path for recurring templates that opt into
-- `auto_post`. A daily job (pg_cron — see the scheduling snippet at the bottom)
-- calls run_recurring_autopost(), which posts every due income/expense template
-- and records success/failure. Because the job runs with no auth.uid(), the
-- posting function is SECURITY DEFINER and mirrors create_manual_transaction's
-- ledger writes (transaction + entry + allocation) directly, attributing the
-- rows to the template's creator.
--
-- FX strategy (Open Decision #3 = "last known rate"): the account's currency is
-- valued at the most recent exchange_rate_to_base seen in the household ledger
-- for that currency; base-currency accounts use 1. If a non-base account has no
-- prior rate, the template is FLAGGED (last_error) and skipped — never posted
-- with a silent 1:1.
-- ============================================================

-- ── 1. Failure/health columns on the template ───────────────────────────────
alter table public.recurring_transactions
  add column if not exists last_auto_post_at timestamptz,
  add column if not exists last_error text,
  add column if not exists last_error_at timestamptz,
  add column if not exists consecutive_failures integer not null default 0;

-- ── 2. Auto-post run log (one row per attempt) ──────────────────────────────
create table if not exists public.recurring_autopost_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recurring_id uuid not null references public.recurring_transactions(id) on delete cascade,
  run_date date not null,
  status text not null check (status in ('posted', 'failed')),
  transaction_id uuid references public.transactions(id) on delete set null,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_recurring_autopost_log_household
  on public.recurring_autopost_log(household_id, created_at desc);
create index if not exists idx_recurring_autopost_log_recurring
  on public.recurring_autopost_log(recurring_id, created_at desc);

alter table public.recurring_autopost_log enable row level security;

-- Members read their household's log; only the SECURITY DEFINER job writes it.
drop policy if exists recurring_autopost_log_select on public.recurring_autopost_log;
create policy recurring_autopost_log_select
  on public.recurring_autopost_log
  for select
  using (public.is_household_member(household_id));

-- ── 3. next_run_date advancement (mirrors lib/recurring/shared.ts) ──────────
-- Postgres clamps month overflow (Jan 31 + 1 month → Feb 28), matching the TS
-- addMonthsClamped helper. semimonthly hops 1st↔15th.
create or replace function public.advance_recurring_next_run(
  p_from date,
  p_frequency text
)
returns date
language sql
immutable
set search_path = public
as $$
  select (case p_frequency
    when 'daily'       then p_from + interval '1 day'
    when 'weekly'      then p_from + interval '7 days'
    when 'biweekly'    then p_from + interval '14 days'
    when 'semimonthly' then
      case when extract(day from p_from) < 15
        then date_trunc('month', p_from::timestamp) + interval '14 days'   -- → the 15th
        else date_trunc('month', p_from::timestamp) + interval '1 month'   -- → 1st of next month
      end
    when 'monthly'     then p_from + interval '1 month'
    when 'quarterly'   then p_from + interval '3 months'
    when 'yearly'      then p_from + interval '1 year'
    else p_from + interval '1 month'
  end)::date
$$;

-- ── 4. The unattended posting job ───────────────────────────────────────────
create or replace function public.run_recurring_autopost(
  p_run_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_base_currency varchar(3);
  v_account_currency varchar(3);
  v_account_archived boolean;
  v_account_deleted timestamptz;
  v_category_reporting text;
  v_category_archived boolean;
  v_category_deleted timestamptz;
  v_rate numeric(18,8);
  v_signed numeric(18,4);
  v_alloc_type text;
  v_txn_id uuid;
  v_next date;
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
    order by r.next_run_date asc
  loop
    -- Per-template block so one bad template never aborts the batch.
    begin
      if v_rec.transaction_type not in ('income', 'expense') then
        raise exception 'Only income and expense templates can auto-post (transfers are not supported yet).';
      end if;

      if v_rec.account_id is null or v_rec.category_id is null then
        raise exception 'Template is missing an account or category.';
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

      -- FX: last known rate for the account currency (1 for base currency).
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
        v_rec.household_id, v_rec.transaction_type, v_rec.next_run_date,
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

      -- Advance one step; deactivate once past end_date.
      v_next := public.advance_recurring_next_run(v_rec.next_run_date, v_rec.frequency);
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

      v_posted := v_posted + 1;

    exception when others then
      v_error := SQLERRM;
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
    end;
  end loop;

  return v_posted;
end;
$$;

-- Deliberately NOT granted to `authenticated`: this SECURITY DEFINER job
-- bypasses RLS and posts across the whole household, so only the scheduler
-- (pg_cron, running as the table owner) and DB admins may call it.
revoke all on function public.run_recurring_autopost(date) from public;

-- ── 5. Scheduling (MANUAL — run after enabling pg_cron in Supabase) ─────────
-- pg_cron must be enabled once from the Supabase dashboard
-- (Database → Extensions → pg_cron) or:  create extension if not exists pg_cron;
-- Then schedule a daily 06:00 UTC run:
--
--   select cron.schedule(
--     'recurring-autopost',
--     '0 6 * * *',
--     $$ select public.run_recurring_autopost(); $$
--   );
--
-- To remove it later:  select cron.unschedule('recurring-autopost');
