-- ============================================================
-- App Finanzas — UC-9: recurring transfers
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- `recurring_transactions` has a single `account_id`, so a template could only
-- ever describe an income or an expense. A savings sweep — the whole point of
-- UC-9 — needs a destination too.
--
-- 1. `to_account_id`, nullable, set only on transfer templates.
-- 2. A shape constraint, so a transfer template cannot exist without a
--    destination and a non-transfer template cannot carry one.
-- 3. A `transfer` branch in `run_recurring_autopost()`, which until now rejected
--    anything that was not income or expense.
--
-- CROSS-CURRENCY IS DELIBERATELY NOT AUTO-POSTABLE. `create_transfer_transaction`
-- raises when the two accounts differ in currency and `p_to_amount` is null,
-- and it is right to: the amount that *arrived* is a real ledger value only the
-- user knows, and it changes every month with the rate. A template cannot carry
-- it, and inventing one from a stale rate would silently write a wrong balance.
-- So: a cross-currency transfer template is allowed and can be posted by hand
-- (the post form asks for the received amount, exactly as the transfer form
-- does), but `auto_post` is refused on it in the app layer, and the job below
-- flags-and-skips it rather than guessing. Same "fail visibly, never post a
-- silent 1:1" rule BR-014 already follows for missing FX rates.
-- ============================================================

alter table public.recurring_transactions
  add column if not exists to_account_id uuid references public.accounts(id);

comment on column public.recurring_transactions.to_account_id is
  'UC-9: destination account for transfer templates. NULL for income/expense.';

create index if not exists idx_recurring_transactions_to_account
  on public.recurring_transactions(to_account_id)
  where to_account_id is not null;

-- Shape per type. Existing rows are all income/expense with a null
-- to_account_id, so they satisfy the `else` branch and the ALTER validates
-- without a rewrite.
alter table public.recurring_transactions
  drop constraint if exists recurring_transactions_shape_chk;

alter table public.recurring_transactions
  add constraint recurring_transactions_shape_chk
  check (
    case
      when transaction_type = 'transfer' then
        account_id is not null
        and to_account_id is not null
        and account_id <> to_account_id
        -- A transfer moves money between accounts; it is not income or expense,
        -- so it must not carry a reporting category (mirrors the ledger rule
        -- that a transfer has entries but no allocation).
        and category_id is null
      else
        to_account_id is null
    end
  );

-- ------------------------------------------------------------
-- Auto-post: add the transfer branch
-- ------------------------------------------------------------
-- Signature is unchanged, so `create or replace` is safe here (no overload
-- risk). The income/expense path is byte-for-byte the previous version; the
-- transfer path is new and writes the same two balancing entries and no
-- allocation that create_transfer_transaction does for a same-currency move.

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
        -- ── UC-9: transfer ────────────────────────────────────────────────
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

        -- The refusal this whole feature turns on: the amount received is a
        -- real value only the user knows, so an unattended job must not invent
        -- it. Flag and skip; the template stays due and can be posted by hand.
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
          v_rec.household_id, 'transfer', v_rec.next_run_date,
          v_rec.name, 'Auto-posted from a recurring template',
          'posted', 'system', v_rec.created_by
        )
        returning id into v_txn_id;

        -- Two balancing entries, both valued at the same rate, so the pair sums
        -- to zero in base currency: a transfer never moves net worth.
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

        -- No allocation: a transfer is not income or expense. (BR-039's
        -- treat-transfers-as-expense is a *reporting* flag read at query time
        -- and deliberately does not add one either.)

      else
        -- ── income / expense (unchanged) ──────────────────────────────────
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
      end if;

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

-- Unchanged from BR-014: this SECURITY DEFINER job bypasses RLS and posts across
-- the whole household, so only the scheduler (pg_cron, running as the table
-- owner) and DB admins may call it.
revoke all on function public.run_recurring_autopost(date) from public;

-- The existing daily `recurring-autopost` cron job picks this up with no
-- change — same function name, same signature.
